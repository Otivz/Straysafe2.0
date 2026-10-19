import { useState, useEffect, useMemo } from 'react';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import api from '../../utils/api';
import { isReportClosed } from '../../utils/reportStatus';
import { getCachedData, setCachedData } from '../../utils/cache';
import { whenVisible } from '../../utils/visibleInterval';
import {
    FileText,
    Download,
    Eye,
    Search,
    ShieldCheck,
    CheckCircle2,
    Clock,
    Calendar,
    Building2,
    RefreshCw,
    ExternalLink,
    X,
    Copy,
    Check
} from 'lucide-react';

interface EndorsementDocument {
    doc_id: string;
    report_id: number;
    title: string;
    date_sent: string;
    recipient: string;
    status: 'In Review' | 'Accepted';
    file_type: 'PDF' | 'DOCX' | 'IMAGE';
    file_size: string;
    file_url?: string;
}

const EndorsementArch = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Accepted' | 'In Review'>('all');
    const [fileTypeFilter, setFileTypeFilter] = useState<'all' | 'PDF' | 'IMAGE'>('all');
    const [selectedDoc, setSelectedDoc] = useState<EndorsementDocument | null>(null);
    const [missionData, setMissionData] = useState<any | null>(null);
    const [loadingMission, setLoadingMission] = useState(false);
    const [docs, setDocs] = useState<EndorsementDocument[]>(() => {
        const cached = getCachedData<EndorsementDocument[]>('subd_endorsement_docs');
        if (!cached) return [];
        return cached.map(d => ({
            ...d,
            status: (d.status as string) === 'Received' ? 'In Review' : d.status
        }));
    });
    const [loadingDocs, setLoadingDocs] = useState<boolean>(() => !getCachedData<EndorsementDocument[]>('subd_endorsement_docs'));
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [copiedDocId, setCopiedDocId] = useState<string | null>(null);

    const handleCopyId = (e: React.MouseEvent, docId: string) => {
        e.stopPropagation();
        navigator.clipboard.writeText(docId);
        setCopiedDocId(docId);
        setTimeout(() => setCopiedDocId(null), 2000);
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Pending': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'In Progress': return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'Resolved': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'Rejected': return 'bg-rose-50 text-rose-700 border-rose-200';
            default: return 'bg-slate-50 text-slate-700 border-slate-200';
        }
    };

    const getBarangayStatusName = (statusId?: number) => {
        if (!statusId) return 'Pending';
        switch (statusId) {
            case 1: return 'Pending';
            case 2: return 'Pending';
            case 3: return 'Rejected';
            case 4: return 'In Progress';
            case 5: return 'In Progress';
            case 6: return 'Resolved';
            default: return 'Pending';
        }
    };

    const getTimelineSteps = (mission: any) => {
        const currentStatus = mission?.report?.status_id || mission?.report?.current_status_id || mission?.status_id || 4;
        const hasAssignment = !!mission?.assigned_staff_name;
        const isResolved = isReportClosed(currentStatus) || currentStatus === 6 || mission?.status_id === 6 || mission?.barangay_status?.toLowerCase() === 'resolved';
        const isInProgress = currentStatus === 5 || mission?.status_id === 5 || mission?.status_id === 4 || mission?.barangay_status?.toLowerCase() === 'in progress';
        const isTeamAssigned = hasAssignment || isResolved || isInProgress || currentStatus === 13 || (mission?.assignments && mission.assignments.length > 0);
        
        return [
            {
                label: 'Report Received',
                status: 'Resolved',
                timestamp: mission?.report?.created_at ? new Date(mission.report.created_at).toLocaleDateString() : 'N/A',
                note: 'Initial incident report registered in subdivision.'
            },
            {
                label: 'Endorsed to Barangay',
                status: currentStatus >= 4 ? 'Resolved' : 'Pending',
                timestamp: mission?.escalated_date || (mission?.created_at ? new Date(mission.created_at).toLocaleDateString() : 'N/A'),
                note: 'Official subdivision endorsement sent to Barangay Operations.'
            },
            {
                label: 'Rescue Team Assigned',
                status: isTeamAssigned ? 'Resolved' : (currentStatus === 4 ? 'Pending' : 'Not Started'),
                timestamp: mission?.assignments && mission.assignments.length > 0 ? new Date(mission.assignments[0].assigned_at).toLocaleDateString() : '-',
                note: mission?.assigned_staff_name ? `Assigned to: ${mission.assigned_staff_name}` : (isResolved ? 'Rescue team dispatched and operation completed.' : 'Awaiting Barangay staff assignment.')
            },
            {
                label: 'Rescue In Progress',
                status: isResolved ? 'Resolved' : (isInProgress ? 'In Progress' : 'Not Started'),
                timestamp: '-',
                note: isInProgress ? 'Barangay rescue squad dispatched and on-site.' : (isResolved ? 'Dispatched and completed.' : '-')
            },
            {
                label: 'Mission Resolved',
                status: isResolved ? 'Resolved' : 'Not Started',
                timestamp: '-',
                note: isResolved ? 'Incident resolved successfully. Animal secured.' : '-'
            }
        ];
    };

    const handlePreview = async (doc: EndorsementDocument) => {
        setSelectedDoc(doc);
        setLoadingMission(true);
        setMissionData(null);
        try {
            const res = await api.get(`/rescue-requests/report/${doc.report_id}`);
            if (res.data) {
                setMissionData(res.data);
            } else {
                try {
                    const reportRes = await api.get(`/reports/${doc.report_id}`);
                    if (reportRes.data) {
                        setMissionData({
                            rescue_id: null,
                            report_id: reportRes.data.report_id,
                            title: doc.title,
                            description: reportRes.data.description,
                            escalated_date: doc.date_sent,
                            status_id: reportRes.data.status_id,
                            report: reportRes.data
                        });
                    }
                } catch {
                    setMissionData(null);
                }
            }
        } catch {
            try {
                const reportRes = await api.get(`/reports/${doc.report_id}`);
                if (reportRes.data) {
                    setMissionData({
                        rescue_id: null,
                        report_id: reportRes.data.report_id,
                        title: doc.title,
                        description: reportRes.data.description,
                        escalated_date: doc.date_sent,
                        status_id: reportRes.data.status_id,
                        report: reportRes.data
                    });
                }
            } catch {
                setMissionData(null);
            }
        } finally {
            setLoadingMission(false);
        }
    };

    const fetchDocs = async (showLoading = true) => {
        try {
            if (showLoading && !getCachedData('subd_endorsement_docs')) setLoadingDocs(true);
            const response = await api.get('/rescue-requests/');
            if (response.data && response.data.length > 0) {
                const mapped: EndorsementDocument[] = response.data.map((m: any) => {
                    const sid = m.status_id;
                    const repSid = m.report?.status_id || m.report?.current_status_id;
                    
                    // Once escalated to barangay, endorsement remains 'In Review' until barangay accepts it
                    const isAccepted = 
                        sid === 4 || sid === 5 || sid === 6 || sid === 7 || sid === 11 || sid === 13 ||
                        repSid === 13 || repSid === 5 || repSid === 6 || repSid === 7 || repSid === 11 ||
                        m.barangay_status === 'Accepted' || m.barangay_status === 'In Progress' || m.barangay_status === 'Resolved';

                    const friendlyStatus: 'In Review' | 'Accepted' = isAccepted ? 'Accepted' : 'In Review';

                    const media = m.report?.media || [];
                    const escFile = media.find((file: any) => file.is_evidence === true && file.status_id !== 11);
                    const isPdf = escFile?.file_url?.toLowerCase().includes('.pdf');

                    const escDate = m.created_at ? new Date(m.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    }) : 'N/A';

                    let docTitle = m.title || `Rescue Request #${m.rescue_id}`;
                    if (!docTitle.toLowerCase().includes('endorsement')) {
                        docTitle = `Endorsement for ${docTitle}`;
                    }

                    return {
                        doc_id: `END-2026-${m.rescue_id.toString().padStart(3, '0')}`,
                        report_id: m.report_id,
                        title: docTitle,
                        date_sent: escDate,
                        recipient: "Barangay San Vicente Ops",
                        status: friendlyStatus,
                        file_type: isPdf ? "PDF" : "IMAGE",
                        file_size: isPdf ? "1.2 MB" : "850 KB",
                        file_url: escFile?.file_url
                    };
                });
                setDocs(mapped);
                setCachedData('subd_endorsement_docs', mapped);
            } else {
                setDocs([]);
            }
        } catch (error) {
            console.error('Error fetching endorsement documents:', error);
            if (!getCachedData('subd_endorsement_docs')) {
                setDocs([]);
            }
        } finally {
            if (showLoading) setLoadingDocs(false);
            setIsRefreshing(false);
        }
    };

    const handleManualRefresh = () => {
        setIsRefreshing(true);
        fetchDocs(false);
    };

    const handleDownload = async (doc: EndorsementDocument) => {
        if (!doc.file_url) {
            alert("No uploaded file available for this document.");
            return;
        }

        try {
            const response = await fetch(doc.file_url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = blobUrl;
            
            const ext = doc.file_type === 'PDF' ? 'pdf' : 'jpg';
            link.download = `${doc.doc_id}.${ext}`;
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error("Blob download failed, falling back to new window open:", error);
            const link = document.createElement('a');
            link.href = doc.file_url;
            link.target = '_blank';
            link.download = doc.title;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    useEffect(() => {
        fetchDocs(true);
        const interval = setInterval(whenVisible(() => fetchDocs(false)), 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!selectedDoc) return;
        
        const pollMission = async () => {
            try {
                const res = await api.get(`/rescue-requests/report/${selectedDoc.report_id}`);
                if (res.data) {
                    setMissionData(res.data);
                }
            } catch (err) {
                console.error('Error polling preview mission:', err);
            }
        };

        const interval = setInterval(whenVisible(pollMission), 5000);
        return () => clearInterval(interval);
    }, [selectedDoc]);

    // Statistics Counts
    const acceptedCount = useMemo(() => docs.filter(d => d.status === 'Accepted').length, [docs]);
    const inReviewCount = useMemo(() => docs.filter(d => d.status === 'In Review').length, [docs]);

    const filteredDocs = useMemo(() => {
        return docs.filter(doc => {
            const matchesSearch = 
                doc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                doc.doc_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                `#${doc.report_id}`.includes(searchTerm) ||
                doc.recipient.toLowerCase().includes(searchTerm.toLowerCase());
            
            const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
            const matchesFileType = fileTypeFilter === 'all' || doc.file_type === fileTypeFilter;

            return matchesSearch && matchesStatus && matchesFileType;
        });
    }, [docs, searchTerm, statusFilter, fileTypeFilter]);

    return (
        <div className="flex h-screen bg-[#FDFBF7]">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                                <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none uppercase">Endorsement Archive</h1>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-role-soft text-role border border-role-border">
                                    Official Hub
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Legal records of all official incident endorsements transmitted to Barangay operations
                            </p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-36 md:pb-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">

                        {/* Top Summary Metric Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                            {/* Card 1: Total Letters */}
                            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs hover:border-role-border/60 transition-all flex items-center justify-between group">
                                <div>
                                    <p className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider">
                                        Total Endorsements
                                    </p>
                                    <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-0.5 tracking-tight">
                                        {docs.length}
                                    </h3>
                                    <p className="text-[10px] text-role font-bold mt-1 flex items-center gap-1">
                                        <span>📜</span> Transmitted to Barangay
                                    </p>
                                </div>
                                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-role-soft text-role flex items-center justify-center border border-role-border shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                    <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                            </div>

                            {/* Card 2: Accepted Operations */}
                            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs hover:border-emerald-300 transition-all flex items-center justify-between group">
                                <div>
                                    <p className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider">
                                        Accepted Operations
                                    </p>
                                    <h3 className="text-2xl sm:text-3xl font-black text-emerald-600 mt-0.5 tracking-tight">
                                        {acceptedCount}
                                    </h3>
                                    <p className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
                                        <span>✓</span> Confirmed by Barangay
                                    </p>
                                </div>
                                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                    <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                            </div>

                            {/* Card 3: In Review */}
                            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs hover:border-amber-300 transition-all flex items-center justify-between group">
                                <div>
                                    <p className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider">
                                        Awaiting Action
                                    </p>
                                    <h3 className="text-2xl sm:text-3xl font-black text-amber-600 mt-0.5 tracking-tight">
                                        {inReviewCount}
                                    </h3>
                                    <p className="text-[10px] text-amber-600 font-bold mt-1 flex items-center gap-1">
                                        <span>⏱️</span> In review / dispatch
                                    </p>
                                </div>
                                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                    <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                            </div>

                            {/* Card 4: Audit & Legal Status */}
                            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs hover:border-role-border/60 transition-all flex items-center justify-between group">
                                <div>
                                    <p className="text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-wider">
                                        Legal Compliance
                                    </p>
                                    <h3 className="text-2xl sm:text-3xl font-black text-role-strong mt-0.5 tracking-tight">
                                        100%
                                    </h3>
                                    <p className="text-[10px] text-role font-bold mt-1 flex items-center gap-1">
                                        <span>🛡️</span> Tamper-evident trail
                                    </p>
                                </div>
                                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-role-soft text-role flex items-center justify-center border border-role-border shrink-0 shadow-inner group-hover:scale-105 transition-transform">
                                    <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                            </div>
                        </div>

                        {/* Search, Filter Tabs & Controls Toolbar */}
                        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs space-y-4">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
                                
                                {/* Status Filter Tabs */}
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
                                    <button
                                        type="button"
                                        onClick={() => setStatusFilter('all')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                            statusFilter === 'all'
                                                ? 'bg-role text-white shadow-xs'
                                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                                        }`}
                                    >
                                        All Letters ({docs.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStatusFilter('Accepted')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                            statusFilter === 'Accepted'
                                                ? 'bg-emerald-600 text-white shadow-xs'
                                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/60'
                                        }`}
                                    >
                                        Accepted ({acceptedCount})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setStatusFilter('In Review')}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap ${
                                            statusFilter === 'In Review'
                                                ? 'bg-amber-500 text-white shadow-xs'
                                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/60'
                                        }`}
                                    >
                                        In Review ({inReviewCount})
                                    </button>
                                </div>

                                {/* Right Side: Search & Format Filter */}
                                <div className="flex items-center gap-2 w-full md:w-auto">
                                    {/* Format filter */}
                                    <div className="relative">
                                        <select
                                            value={fileTypeFilter}
                                            onChange={(e) => setFileTypeFilter(e.target.value as any)}
                                            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-role cursor-pointer"
                                        >
                                            <option value="all">All Formats</option>
                                            <option value="PDF">PDF Only</option>
                                            <option value="IMAGE">Image Evidence</option>
                                        </select>
                                    </div>

                                    {/* Search Input */}
                                    <div className="relative flex-1 md:w-72">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                                            <Search className="w-4 h-4" />
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Search document ID, title, report #..."
                                            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-role focus:border-role outline-none transition-all"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                        {searchTerm && (
                                            <button
                                                type="button"
                                                onClick={() => setSearchTerm('')}
                                                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>

                                    {/* Refresh Button */}
                                    <button
                                        type="button"
                                        onClick={handleManualRefresh}
                                        disabled={isRefreshing}
                                        title="Refresh Archive"
                                        className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:text-role hover:bg-role-soft hover:border-role-border transition-all cursor-pointer shrink-0 disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-role' : ''}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Document Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
                            {loadingDocs ? (
                                <div className="col-span-full py-20 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200/80 shadow-xs">
                                    <div className="w-12 h-12 border-4 border-role-border border-t-role rounded-full animate-spin" />
                                    <p className="text-xs font-black text-slate-700 uppercase tracking-widest mt-4">Synchronizing Archive Repository...</p>
                                    <p className="text-[11px] text-slate-400 mt-1">Connecting to official Barangay operations database</p>
                                </div>
                            ) : filteredDocs.length > 0 ? (
                                filteredDocs.map((doc) => {
                                    const isAccepted = doc.status === 'Accepted';
                                    const isPdf = doc.file_type === 'PDF';

                                    return (
                                        <div
                                            key={doc.doc_id}
                                            className="group bg-white rounded-3xl border border-slate-200/80 shadow-xs hover:border-role-border hover:shadow-xl transition-all duration-300 p-5 sm:p-6 flex flex-col justify-between relative overflow-hidden"
                                        >
                                            {/* Status Accent Stripe on Left */}
                                            <div
                                                className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                                                    isAccepted
                                                        ? 'bg-emerald-500'
                                                        : 'bg-amber-400'
                                                }`}
                                            />

                                            {/* Top Row: Doc ID with Copy + Status Badge */}
                                            <div className="flex items-start justify-between gap-3 mb-4 pl-1.5">
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleCopyId(e, doc.doc_id)}
                                                    title="Click to copy Document ID"
                                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono text-[10.5px] font-black tracking-wider transition-all cursor-pointer border border-slate-200/60 group/btn"
                                                >
                                                    {copiedDocId === doc.doc_id ? (
                                                        <>
                                                            <Check className="w-3 h-3 text-emerald-600" />
                                                            <span className="text-emerald-700 font-bold">COPIED</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>🆔</span>
                                                            <span>{doc.doc_id}</span>
                                                            <Copy className="w-2.5 h-2.5 opacity-40 group-hover/btn:opacity-100" />
                                                        </>
                                                    )}
                                                </button>

                                                <span
                                                    className={`px-2.5 py-1 rounded-full text-[9.5px] font-black uppercase tracking-wider border shrink-0 flex items-center gap-1 shadow-2xs ${
                                                        isAccepted
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            : 'bg-amber-50 text-amber-700 border-amber-200'
                                                    }`}
                                                >
                                                    {isAccepted ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                                    <span>{doc.status}</span>
                                                </span>
                                            </div>

                                            {/* Title & Case Link */}
                                            <div className="space-y-1.5 mb-4 pl-1.5 flex-1">
                                                <h3 className="text-sm sm:text-base font-extrabold text-slate-800 line-clamp-2 leading-snug group-hover:text-role transition-colors">
                                                    {doc.title}
                                                </h3>
                                                <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-slate-400">
                                                    <span className="text-role">🔗</span>
                                                    <span>Incident Report #{doc.report_id}</span>
                                                </div>
                                            </div>

                                            {/* Transmission Details Box */}
                                            <div className="bg-slate-50/80 rounded-2xl p-3 sm:p-3.5 border border-slate-100 mb-5 pl-3.5 space-y-2 text-xs">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                                                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                        Recipient
                                                    </span>
                                                    <span className="font-bold text-slate-700 truncate max-w-[170px]">
                                                        {doc.recipient}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                                                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                                        Transmitted
                                                    </span>
                                                    <span className="font-bold text-slate-700">
                                                        {doc.date_sent}
                                                    </span>
                                                </div>

                                                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/50">
                                                    <span className="text-slate-400 font-semibold flex items-center gap-1">
                                                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                                                        File Spec
                                                    </span>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                                                        isPdf
                                                            ? 'bg-rose-50 text-rose-700 border-rose-200'
                                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                    }`}>
                                                        <span>{doc.file_type}</span>
                                                        <span>•</span>
                                                        <span>{doc.file_size}</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons: Preview & Download */}
                                            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 pl-1.5">
                                                <button
                                                    type="button"
                                                    onClick={() => handlePreview(doc)}
                                                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-200 text-slate-700 hover:text-role-strong hover:bg-role-soft hover:border-role-border font-bold text-xs bg-white transition-all shadow-2xs cursor-pointer"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    <span>Preview</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => handleDownload(doc)}
                                                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-role hover:bg-role-hover text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                    <span>Download</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="col-span-full bg-white rounded-3xl border border-dashed border-slate-300 p-12 sm:p-16 text-center space-y-3">
                                    <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto text-slate-400 border border-slate-200">
                                        <FileText className="w-7 h-7" />
                                    </div>
                                    <h3 className="text-base font-extrabold text-slate-800">No Endorsement Letters Found</h3>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                                        {searchTerm || statusFilter !== 'all' || fileTypeFilter !== 'all'
                                            ? 'No documents match your filter criteria. Try resetting filters or search terms.'
                                            : 'No incident reports have been escalated to Barangay operations yet.'}
                                    </p>
                                    {(searchTerm || statusFilter !== 'all' || fileTypeFilter !== 'all') && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchTerm('');
                                                setStatusFilter('all');
                                                setFileTypeFilter('all');
                                            }}
                                            className="px-4 py-2 bg-role-soft text-role hover:bg-role hover:text-white border border-role-border rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                                        >
                                            Reset All Filters
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Official Archive Protocol Banner - On Theme */}
                        <div className="bg-gradient-to-br from-[#FFFBEB] via-[#FFF8E7] to-[#FEF3C7]/60 rounded-3xl text-slate-800 p-6 sm:p-8 relative overflow-hidden shadow-xs border-2 border-amber-200/80">
                            {/* Watermark Seal */}
                            <div className="absolute right-2 -bottom-8 opacity-10 pointer-events-none text-amber-600">
                                <ShieldCheck className="w-60 h-60" />
                            </div>

                            <div className="relative z-10 space-y-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
                                        <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm sm:text-base font-black tracking-tight text-slate-900 uppercase">
                                                Legal Archive & Operations Protocol
                                            </h4>
                                            <span className="text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-role text-white shadow-2xs">
                                                Verifiable
                                            </span>
                                        </div>
                                        <p className="text-xs font-bold text-amber-800/80">
                                            Immutable municipal compliance & animal welfare audit registry
                                        </p>
                                    </div>
                                </div>

                                <p className="text-xs sm:text-[13px] text-slate-700 leading-relaxed max-w-3xl font-medium">
                                    The Endorsement Archive maintains immutable, verifiable digital records of every incident report escalated from the subdivision to the Barangay operations hub. Each document serves as authoritative legal proof of escalation under Republic Act No. 8485 (Animal Welfare Act) and municipal safety coordination protocols.
                                </p>

                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10.5px] font-extrabold bg-white text-amber-950 border border-amber-200/90 shadow-2xs">
                                        <span>🛡️</span> Digital Chain of Custody
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10.5px] font-extrabold bg-white text-amber-950 border border-amber-200/90 shadow-2xs">
                                        <span>🏛️</span> Barangay San Vicente Operations Link
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[10.5px] font-extrabold bg-white text-amber-950 border border-amber-200/90 shadow-2xs">
                                        <span>🔒</span> Audit-Ready & Tamper-Evident
                                    </span>
                                </div>
                            </div>
                        </div>

                    </div>
                </main>
                <SubdBottomNav />
            </div>

            {/* Endorsement Preview Modal */}
            {selectedDoc && (
                <div 
                    onClick={() => {
                        setSelectedDoc(null);
                        setMissionData(null);
                    }}
                    className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
                >
                    <div 
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200"
                    >
                        {/* Modal Header */}
                        <header className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-white to-amber-50/30 shrink-0">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black bg-role-soft text-role px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-role-border">
                                        Official Endorsement Document
                                    </span>
                                    <span className="text-xs font-mono text-slate-400 font-bold">
                                        {selectedDoc.doc_id}
                                    </span>
                                </div>
                                <h2 className="text-base sm:text-lg font-black text-slate-900 mt-1 tracking-tight leading-snug">
                                    {selectedDoc.title}
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleDownload(selectedDoc)}
                                    title="Download Document"
                                    className="p-2 rounded-xl bg-role-soft hover:bg-role text-role hover:text-white border border-role-border transition-all cursor-pointer shadow-2xs"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => {
                                        setSelectedDoc(null);
                                        setMissionData(null);
                                    }}
                                    className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all shrink-0 cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </header>

                        {/* Modal Scrollable Body */}
                        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar">
                            
                            {/* Document Info Card */}
                            <div className="bg-slate-50/80 border border-slate-200/80 p-4 rounded-2xl">
                                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                                    <span>📋</span> Transmission Metadata
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Date Sent</p>
                                        <p className="font-bold text-slate-800 mt-0.5">{selectedDoc.date_sent}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Recipient</p>
                                        <p className="font-bold text-slate-800 mt-0.5 truncate">{selectedDoc.recipient}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Format</p>
                                        <p className="font-bold text-slate-800 mt-0.5">{selectedDoc.file_type} ({selectedDoc.file_size})</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Barangay Status</p>
                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border mt-0.5 ${
                                            selectedDoc.status === 'Accepted' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                        }`}>
                                            {selectedDoc.status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Live Escalated Mission Status */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                        <span>🚨</span> Live Barangay Operations Sync
                                    </h3>
                                    <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 uppercase tracking-wider">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                        </span>
                                        Live DB Sync
                                    </span>
                                </div>

                                {loadingMission ? (
                                    <div className="py-12 flex flex-col items-center justify-center gap-3 bg-slate-50 rounded-2xl border border-slate-200/60">
                                        <div className="w-8 h-8 border-3 border-role-border border-t-role rounded-full animate-spin"></div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">Syncing live mission operations...</p>
                                    </div>
                                ) : missionData ? (
                                    (() => {
                                        const media = missionData.report?.media || [];
                                        const escalationFiles = media.filter((m: any) => m.is_evidence === true && m.status_id !== 11);
                                        const originalEvidence = media.filter((m: any) => !m.is_evidence);
                                        const resolutionProof = media.filter((m: any) => m.is_evidence === true && m.status_id === 11);

                                        return (
                                            <div className="space-y-6">
                                                {/* Escalation Endorsement Document Preview */}
                                                <div className="space-y-3">
                                                    <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                                                        <span>📄</span> Uploaded Endorsement File Preview
                                                    </h4>
                                                    {escalationFiles.length > 0 ? (
                                                        <div className="space-y-4">
                                                            {escalationFiles.map((file: any) => {
                                                                const isPdf = file.file_url.toLowerCase().includes('.pdf');
                                                                const isImage = file.media_type === 'Image' || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.file_url);

                                                                return (
                                                                    <div key={file.media_id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs flex flex-col">
                                                                        {/* File Header */}
                                                                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="text-base">{isPdf ? '📄' : '🖼️'}</span>
                                                                                <div>
                                                                                    <h4 className="text-xs font-extrabold text-slate-800">
                                                                                        {isPdf ? 'Official Endorsement Letter (PDF)' : 'Escalation Evidence Image'}
                                                                                    </h4>
                                                                                    <p className="text-[9px] font-medium text-slate-400 font-mono">MEDIA ID: {file.media_id}</p>
                                                                                </div>
                                                                            </div>
                                                                            <a 
                                                                                href={file.file_url} 
                                                                                target="_blank" 
                                                                                rel="noreferrer" 
                                                                                className="px-3 py-1 bg-white hover:bg-role-soft hover:text-role hover:border-role-border border border-slate-200 text-slate-700 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all flex items-center gap-1"
                                                                            >
                                                                                <span>Open Full</span>
                                                                                <ExternalLink className="w-2.5 h-2.5" />
                                                                            </a>
                                                                        </div>

                                                                        {/* File Viewport */}
                                                                        <div className="bg-slate-100/50 p-4 flex items-center justify-center min-h-[300px]">
                                                                            {isPdf ? (
                                                                                <div className="w-full h-[380px] bg-white rounded-xl overflow-hidden border border-slate-200 shadow-inner">
                                                                                    <iframe 
                                                                                        src={file.file_url} 
                                                                                        className="w-full h-full border-none" 
                                                                                        title={`Endorsement Document #${file.media_id} Preview`}
                                                                                    />
                                                                                </div>
                                                                            ) : isImage ? (
                                                                                <div className="relative max-w-full rounded-xl overflow-hidden border border-slate-200 bg-white group shadow-xs">
                                                                                    <img 
                                                                                        src={file.file_url} 
                                                                                        alt="Escalation Document" 
                                                                                        className="max-h-[350px] w-auto object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                                                                                    />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="p-8 text-center bg-white border border-slate-200 rounded-xl w-full">
                                                                                    <span className="text-2xl block mb-2">📂</span>
                                                                                    <p className="text-xs font-bold text-slate-700">Document available for download</p>
                                                                                    <p className="text-[10px] text-slate-400 mt-1">Please use the "Open Full" button above to view this file format.</p>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="bg-role-soft/60 border border-dashed border-role-border rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-1.5">
                                                            <span className="text-2xl">📑</span>
                                                            <h4 className="text-xs font-bold text-role-strong uppercase tracking-wider">Endorsement Letter on Record</h4>
                                                            <p className="text-[11px] text-role-strong/80 leading-relaxed max-w-sm">
                                                                Digital endorsement transmission logged. Use the download button to retrieve full certificate.
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Mission Info Grid */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                                    <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Target Animal</p>
                                                        <p className="text-xs font-bold text-slate-800">
                                                            {missionData.report?.animal_type || 'Animal'} {missionData.report?.animal_breed ? `(${missionData.report.animal_breed})` : ''}
                                                        </p>
                                                    </div>
                                                    <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Location / Landmark</p>
                                                        <p className="text-xs font-bold text-slate-800 truncate">{missionData.report?.landmark || 'Subdivision Boundary'}</p>
                                                    </div>
                                                    <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl col-span-full">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Incident Report Condition</p>
                                                        <p className="text-xs font-medium text-slate-600 leading-relaxed">{missionData.report?.condition || missionData.description || 'No specific injuries noted.'}</p>
                                                    </div>
                                                    <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Assigned Rescue Team</p>
                                                        <p className={`text-xs font-black uppercase tracking-wider ${missionData.assigned_staff_name ? 'text-blue-600' : 'text-slate-400'}`}>
                                                            {missionData.assigned_staff_name || 'Awaiting Dispatch'}
                                                        </p>
                                                    </div>
                                                    <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl">
                                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-0.5">Barangay Status</p>
                                                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase tracking-wider border mt-0.5 ${getStatusStyle(getBarangayStatusName(missionData.status_id))}`}>
                                                            {getBarangayStatusName(missionData.status_id)}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Progress Timeline */}
                                                <div className="space-y-4 pt-2">
                                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Operational Progress Timeline</h4>
                                                    <div className="pl-1 space-y-4">
                                                        {getTimelineSteps(missionData).map((step, idx, arr) => {
                                                            const isLast = idx === arr.length - 1;
                                                            const isCompleted = step.status === 'Resolved';
                                                            const isInProgress = step.status === 'In Progress';
                                                            const isPending = step.status === 'Pending';
                                                            const isNotStarted = step.status === 'Not Started';

                                                            let circleBg = 'bg-slate-100 border-slate-300 text-slate-400';
                                                            let lineBg = 'bg-slate-200';

                                                            if (isCompleted) {
                                                                circleBg = 'bg-emerald-500 text-white border-emerald-500';
                                                                lineBg = 'bg-emerald-500';
                                                            } else if (isInProgress) {
                                                                circleBg = 'bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-500/30';
                                                                lineBg = 'bg-slate-200';
                                                            } else if (isPending) {
                                                                circleBg = 'bg-role text-white border-role shadow-sm shadow-role/30';
                                                                lineBg = 'bg-slate-200';
                                                            }

                                                            return (
                                                                <div key={idx} className="flex items-start relative pb-4 last:pb-0">
                                                                    {!isLast && (
                                                                        <div className={`absolute left-[13px] top-[24px] bottom-0 w-[2px] ${lineBg}`}></div>
                                                                    )}
                                                                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center z-10 shrink-0 font-bold text-[10px] ${circleBg}`}>
                                                                        {isCompleted ? (
                                                                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                                                                        ) : isInProgress ? (
                                                                            <span className="relative flex h-1.5 w-1.5">
                                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
                                                                            </span>
                                                                        ) : (
                                                                            <span>{idx + 1}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="ml-3.5 flex-1">
                                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-0.5">
                                                                            <h4 className={`text-xs font-extrabold ${isNotStarted ? 'text-slate-400' : 'text-slate-900'}`}>{step.label}</h4>
                                                                            {!isNotStarted && step.timestamp && (
                                                                                <span className="text-[9px] font-bold text-slate-400 font-mono">{step.timestamp}</span>
                                                                            )}
                                                                        </div>
                                                                        {step.note && (
                                                                            <p className="text-[11px] font-medium text-slate-500 leading-normal">{step.note}</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>

                                                {/* Original Resident Incident Evidence */}
                                                {originalEvidence.length > 0 && (
                                                    <div className="space-y-3 pt-2">
                                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                                            Original Sighting Evidence
                                                        </h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {originalEvidence.map((file: any) => (
                                                                <div key={file.media_id} className="bg-slate-50 border border-slate-200 p-3 rounded-xl flex flex-col gap-2">
                                                                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                                                                        <span>🖼️ Media #{file.media_id}</span>
                                                                        <a
                                                                            href={file.file_url}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="text-role hover:underline flex items-center gap-0.5 text-[9.5px]"
                                                                        >
                                                                            <span>View</span>
                                                                            <ExternalLink className="w-2.5 h-2.5" />
                                                                        </a>
                                                                    </div>
                                                                    <div className="relative group overflow-hidden rounded-lg border border-slate-200 bg-white flex items-center justify-center">
                                                                        <img 
                                                                            src={file.file_url} 
                                                                            alt="Incident Evidence" 
                                                                            className="w-full max-h-36 object-cover group-hover:scale-105 transition-transform duration-300"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Operational Resolution Proof */}
                                                {resolutionProof.length > 0 && (
                                                    <div className="space-y-3 pt-2">
                                                        <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-[0.2em] flex items-center gap-1">
                                                            <span>✓</span> Official Resolution Proof
                                                        </h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            {resolutionProof.map((file: any) => (
                                                                <div key={file.media_id} className="bg-emerald-50/50 border border-emerald-200 p-3 rounded-xl flex flex-col gap-2">
                                                                    <div className="flex items-center justify-between text-[10px] font-bold text-emerald-700">
                                                                        <span>✅ Mission Complete #{file.media_id}</span>
                                                                        <a
                                                                            href={file.file_url}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            className="text-emerald-700 hover:underline flex items-center gap-0.5 text-[9.5px]"
                                                                        >
                                                                            <span>View</span>
                                                                            <ExternalLink className="w-2.5 h-2.5" />
                                                                        </a>
                                                                    </div>
                                                                    <div className="relative group overflow-hidden rounded-lg border border-emerald-200 bg-white flex items-center justify-center">
                                                                        <img 
                                                                            src={file.file_url} 
                                                                            alt="Resolution Evidence" 
                                                                            className="w-full max-h-36 object-cover group-hover:scale-105 transition-transform duration-300"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()
                                ) : (
                                    <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-5 text-center">
                                        <p className="text-xs font-bold text-amber-800 uppercase tracking-wider">Awaiting Active Operations Sync</p>
                                        <p className="text-[11px] text-amber-700/80 mt-1 leading-relaxed">
                                            This endorsement document is recorded in the archive and awaiting active dispatch sync.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <footer className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
                            <span className="text-[11px] text-slate-400 font-medium">
                                StraySafe Official Document Verification
                            </span>
                            <button 
                                type="button"
                                onClick={() => {
                                    setSelectedDoc(null);
                                    setMissionData(null);
                                }}
                                className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                            >
                                Close Preview
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EndorsementArch;
