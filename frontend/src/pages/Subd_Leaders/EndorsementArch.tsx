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

    const closePreview = () => {
        setSelectedDoc(null);
        setMissionData(null);
    };

    useEffect(() => {
        if (!selectedDoc) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSelectedDoc(null); setMissionData(null); } };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [selectedDoc?.doc_id]);

    // Statistics Counts
    const acceptedCount = useMemo(() => docs.filter(d => d.status === 'Accepted').length, [docs]);
    const inReviewCount = useMemo(() => docs.filter(d => d.status === 'In Review').length, [docs]);
    const acceptanceRate = docs.length > 0 ? Math.round((acceptedCount / docs.length) * 100) : 0;
    const hasFilters = Boolean(searchTerm) || statusFilter !== 'all' || fileTypeFilter !== 'all';

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

                <main className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-36 md:pb-8 custom-scrollbar">
                    <div className="max-w-6xl mx-auto w-full flex flex-col gap-3 sm:gap-4 min-w-0">
                        {/* Heading (phones; desktop shows it in the top bar) */}
                        <div className="md:hidden">
                            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-tight">Endorsements</h1>
                            <p className="text-xs font-semibold text-gray-500">Letters sent to the Barangay for escalated reports.</p>
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                            {[
                                { label: 'Total Endorsements', sub: 'Sent to the Barangay', value: docs.length, color: 'text-slate-900' },
                                { label: 'Accepted', sub: 'Confirmed by the Barangay', value: acceptedCount, color: 'text-emerald-600' },
                                { label: 'In Review', sub: 'Awaiting the Barangay', value: inReviewCount, color: 'text-amber-600' },
                                { label: 'Acceptance Rate', sub: 'Accepted of all letters', value: `${acceptanceRate}%`, color: 'text-role' },
                            ].map((m) => (
                                <div key={m.label} className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 flex flex-col gap-1.5 h-full min-w-0">
                                    <p className={`text-2xl sm:text-3xl font-black leading-none ${m.color}`}>{m.value}</p>
                                    <p className="text-xs font-bold text-slate-700 leading-tight">{m.label}</p>
                                    <p className="text-[11px] font-semibold text-slate-400 leading-tight">{m.sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* Search, status, format, refresh */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 flex flex-col gap-2.5 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="relative flex-1 min-w-0">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    <input
                                        type="search"
                                        placeholder="Search document ID, title, report # or recipient"
                                        aria-label="Search endorsements"
                                        className="w-full h-11 pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleManualRefresh}
                                    disabled={isRefreshing}
                                    title="Refresh"
                                    aria-label="Refresh endorsements"
                                    className="h-11 w-11 sm:w-auto sm:px-4 shrink-0 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:text-role hover:border-role-border transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-role' : ''}`} />
                                    <span className="hidden sm:inline">Refresh</span>
                                </button>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0">
                                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl sm:w-96" role="tablist" aria-label="Status">
                                    {([
                                        ['all', 'All', docs.length],
                                        ['Accepted', 'Accepted', acceptedCount],
                                        ['In Review', 'In Review', inReviewCount],
                                    ] as const).map(([value, label, count]) => {
                                        const isActive = statusFilter === value;
                                        return (
                                            <button
                                                key={value}
                                                type="button"
                                                role="tab"
                                                aria-selected={isActive}
                                                onClick={() => setStatusFilter(value)}
                                                className={`h-9 min-w-0 rounded-lg text-xs font-black inline-flex items-center justify-center gap-1 transition-colors cursor-pointer ${isActive
                                                    ? 'bg-role text-white shadow-2xs'
                                                    : 'text-slate-600 hover:text-slate-900'
                                                }`}
                                            >
                                                <span className="truncate">{label}</span>
                                                <span className={`text-[10px] shrink-0 ${isActive ? 'text-white/80' : 'text-slate-400'}`}>{count}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div className="relative sm:ml-auto sm:w-48">
                                    <select
                                        value={fileTypeFilter}
                                        onChange={(e) => setFileTypeFilter(e.target.value as any)}
                                        aria-label="File format"
                                        className="w-full h-10 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 appearance-none cursor-pointer"
                                    >
                                        <option value="all">All Formats</option>
                                        <option value="PDF">PDF Only</option>
                                        <option value="IMAGE">Image Evidence</option>
                                    </select>
                                    <svg className="w-3.5 h-3.5 text-slate-400 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                            <p className="text-[11px] font-semibold text-slate-500">
                                Showing {filteredDocs.length} of {docs.length} letter{docs.length !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {/* Letters */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
                            {loadingDocs ? (
                                [1, 2, 3].map((n) => (
                                    <div key={n} className="bg-white rounded-2xl border border-slate-200/80 p-4 animate-pulse space-y-2.5">
                                        <div className="h-5 w-24 bg-slate-100 rounded-full" />
                                        <div className="h-4 w-3/4 bg-slate-100 rounded" />
                                        <div className="h-3 w-1/2 bg-slate-50 rounded" />
                                        <div className="h-10 w-full bg-slate-50 rounded-xl" />
                                    </div>
                                ))
                            ) : filteredDocs.length > 0 ? (
                                filteredDocs.map((doc) => {
                                    const isAccepted = doc.status === 'Accepted';
                                    const isPdf = doc.file_type === 'PDF';

                                    return (
                                        <div
                                            key={doc.doc_id}
                                            className="bg-white rounded-2xl border border-slate-200/80 hover:border-role-border transition-colors p-3 sm:p-4 flex flex-col gap-2.5 min-w-0"
                                        >
                                            {/* Status + document ID */}
                                            <div className="flex items-center justify-between gap-2 min-w-0">
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border shrink-0 ${isAccepted
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                                }`}>
                                                    {doc.status}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => handleCopyId(e, doc.doc_id)}
                                                    title="Copy document ID"
                                                    aria-label={`Copy document ID ${doc.doc_id}`}
                                                    className="inline-flex items-center gap-1 h-8 px-2 -mr-1 rounded-lg text-slate-500 hover:bg-slate-100 font-mono text-[11px] font-bold min-w-0 cursor-pointer transition-colors"
                                                >
                                                    {copiedDocId === doc.doc_id ? (
                                                        <>
                                                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                            <span className="text-emerald-700 font-sans">Copied</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="truncate">{doc.doc_id}</span>
                                                            <Copy className="w-3 h-3 opacity-50 shrink-0" />
                                                        </>
                                                    )}
                                                </button>
                                            </div>

                                            {/* Title, report, details */}
                                            <div className="min-w-0">
                                                <h3 className="text-sm font-black text-slate-900 leading-snug line-clamp-2 break-words">{doc.title}</h3>
                                                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Incident Report #{doc.report_id}</p>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 min-w-0">
                                                <span className="font-semibold text-slate-700 truncate max-w-full">{doc.recipient}</span>
                                                <span aria-hidden="true">·</span>
                                                <span>Sent {doc.date_sent}</span>
                                                <span className={`px-1.5 py-px rounded-md text-[10px] font-black uppercase ${isPdf ? 'bg-rose-50 text-rose-700' : 'bg-indigo-50 text-indigo-700'}`}>
                                                    {doc.file_type}
                                                </span>
                                            </div>

                                            {/* Actions */}
                                            <div className="grid grid-cols-2 gap-2 pt-2.5 border-t border-slate-100 mt-auto">
                                                <button
                                                    type="button"
                                                    onClick={() => handlePreview(doc)}
                                                    className="h-10 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-role-strong hover:bg-role-soft hover:border-role-border font-bold text-xs transition-colors cursor-pointer"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    Preview
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDownload(doc)}
                                                    className="h-10 flex items-center justify-center gap-1.5 rounded-xl bg-role hover:bg-role-hover text-white font-bold text-xs transition-colors cursor-pointer"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    Download
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="col-span-full bg-white rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center">
                                    <div className="w-12 h-12 bg-role-soft rounded-full flex items-center justify-center mx-auto text-role mb-2">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-sm font-black text-slate-900">{hasFilters ? 'No letters match these filters' : 'No endorsement letters yet'}</h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        {hasFilters ? 'Try another status, format or search word.' : 'No incident reports have been escalated to the Barangay yet.'}
                                    </p>
                                    {hasFilters && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchTerm('');
                                                setStatusFilter('all');
                                                setFileTypeFilter('all');
                                            }}
                                            className="mt-3 h-9 px-4 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:text-role hover:border-role-border cursor-pointer"
                                        >
                                            Clear filters
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* About this page */}
                        <p className="text-[11px] text-slate-500 leading-relaxed px-1">
                            Each letter is the endorsement sent when a report was escalated to the Barangay. Preview one to see the mission's live status, evidence and resolution proof.
                        </p>
                    </div>
                </main>
                <SubdBottomNav />
            </div>

            {/* Endorsement Preview Modal */}
            {selectedDoc && (() => {
                const media = missionData?.report?.media || [];
                const escalationFiles: any[] = missionData
                    ? media.filter((m: any) => m.is_evidence === true && m.status_id !== 11)
                    : (selectedDoc.file_url ? [{ media_id: null, file_url: selectedDoc.file_url, media_type: selectedDoc.file_type === 'IMAGE' ? 'Image' : undefined }] : []);
                const originalEvidence = media.filter((m: any) => !m.is_evidence);
                const resolutionProof = media.filter((m: any) => m.is_evidence === true && m.status_id === 11);
                const rep = missionData?.report;
                const missionStatus = missionData ? getBarangayStatusName(missionData.status_id) : null;
                const caseRows: Array<[string, React.ReactNode]> = [
                    ['Report', `Incident Report #${selectedDoc.report_id}`],
                    ['Target animal', rep?.animal_type ? `${rep.animal_type}${rep?.animal_breed ? ` (${rep.animal_breed})` : ''}` : 'Not recorded'],
                    ['Location', rep?.landmark || 'Not recorded'],
                    ['Condition', rep?.condition || missionData?.description || 'Not recorded'],
                    ['Rescue team', missionData?.assigned_staff_name || 'Awaiting dispatch'],
                ];

                return (
                <div
                    onClick={closePreview}
                    className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-6 bg-black/60 animate-in fade-in duration-200"
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="endorsement-preview-title"
                        onClick={(e) => e.stopPropagation()}
                        className="w-full sm:max-w-3xl min-w-0 bg-white h-[100dvh] sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                    >
                        {/* Header (stays put) */}
                        <header className="shrink-0 px-4 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4 pb-3 border-b border-slate-100 flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-[10px] font-black bg-role-soft text-role px-2 py-0.5 rounded-full uppercase tracking-wide border border-role-border">
                                        Official Endorsement
                                    </span>
                                    <span className="text-[11px] font-mono text-slate-500 font-bold">{selectedDoc.doc_id}</span>
                                </div>
                                <h2 id="endorsement-preview-title" className="text-base sm:text-lg font-black text-slate-900 mt-1 leading-snug break-words">
                                    {selectedDoc.title}
                                </h2>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 -mr-1.5">
                                <button
                                    type="button"
                                    onClick={() => handleDownload(selectedDoc)}
                                    title="Download document"
                                    aria-label="Download document"
                                    className="w-10 h-10 rounded-xl text-role hover:bg-role-soft flex items-center justify-center transition-colors cursor-pointer"
                                >
                                    <Download className="w-5 h-5" />
                                </button>
                                <button
                                    type="button"
                                    onClick={closePreview}
                                    aria-label="Close"
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </header>

                        {/* Body (scrolls) */}
                        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 flex flex-col gap-5 custom-scrollbar">

                            {/* Transmission */}
                            <section>
                                <h3 className="text-xs font-black text-slate-900 mb-2">Transmission</h3>
                                <dl className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-xs">
                                    <div className="min-w-0">
                                        <dt className="text-[11px] font-semibold text-slate-500">Date sent</dt>
                                        <dd className="font-bold text-slate-900 mt-0.5">{selectedDoc.date_sent}</dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-[11px] font-semibold text-slate-500">Recipient</dt>
                                        <dd className="font-bold text-slate-900 mt-0.5 break-words">{selectedDoc.recipient}</dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-[11px] font-semibold text-slate-500">File format</dt>
                                        <dd className="font-bold text-slate-900 mt-0.5">{selectedDoc.file_type}</dd>
                                    </div>
                                    <div className="min-w-0">
                                        <dt className="text-[11px] font-semibold text-slate-500">Barangay status</dt>
                                        <dd className="mt-0.5">
                                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${selectedDoc.status === 'Accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                {selectedDoc.status}
                                            </span>
                                        </dd>
                                    </div>
                                </dl>
                                {/* Sync state: "Live" only once the mission record has loaded (it then refreshes every 5 s) */}
                                <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                                    {loadingMission ? (
                                        <>
                                            <span className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" />
                                            Loading Barangay operations…
                                        </>
                                    ) : missionData ? (
                                        <>
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                            </span>
                                            <span className="text-emerald-700 font-bold">Live</span> · Barangay operations, updates automatically
                                        </>
                                    ) : (
                                        <>
                                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                                            Awaiting active dispatch sync from the Barangay
                                        </>
                                    )}
                                </p>
                            </section>

                            {/* Attached document */}
                            <section className="min-w-0">
                                <h3 className="text-xs font-black text-slate-900 mb-2">Attached document</h3>
                                {loadingMission ? (
                                    <div className="h-24 rounded-xl bg-slate-100 animate-pulse" />
                                ) : escalationFiles.length > 0 ? (
                                    <div className="flex flex-col gap-3">
                                        {escalationFiles.map((file: any, idx: number) => {
                                            const isPdf = String(file.file_url).toLowerCase().includes('.pdf');
                                            const isImage = file.media_type === 'Image' || /\.(jpg|jpeg|png|webp|gif)$/i.test(file.file_url);
                                            return (
                                                <div key={file.media_id ?? idx} className="border border-slate-200 rounded-xl overflow-hidden min-w-0">
                                                    <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 min-w-0">
                                                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-slate-800 truncate">
                                                                {isPdf ? 'Official Endorsement Letter (PDF)' : isImage ? 'Escalation Evidence Image' : 'Endorsement File'}
                                                            </p>
                                                            {file.media_id != null && (
                                                                <p className="text-[10px] text-slate-400 font-mono">Media ID: {file.media_id}</p>
                                                            )}
                                                        </div>
                                                        <a
                                                            href={file.file_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="h-9 px-3 shrink-0 bg-white hover:bg-role-soft hover:text-role hover:border-role-border border border-slate-200 text-slate-700 rounded-lg font-bold text-xs transition-colors flex items-center gap-1"
                                                        >
                                                            Open full
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                    </div>
                                                    {isPdf ? (
                                                        <iframe
                                                            src={file.file_url}
                                                            className="block w-full h-[60vh] sm:h-[480px] border-none bg-white"
                                                            title={`Endorsement document ${file.media_id ?? ''} preview`}
                                                        />
                                                    ) : isImage ? (
                                                        <div className="bg-slate-50 flex justify-center">
                                                            <img
                                                                src={file.file_url}
                                                                alt="Endorsement document"
                                                                className="block max-w-full max-h-[70vh] w-auto h-auto object-contain"
                                                            />
                                                        </div>
                                                    ) : (
                                                        <p className="px-3 py-3 text-xs text-slate-500">
                                                            This file type can't be previewed here. Use <span className="font-bold">Open full</span> or the download button.
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="px-3 py-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500">
                                        No uploaded endorsement file was found for this report.
                                    </p>
                                )}
                            </section>

                            {/* Related case */}
                            <section className="min-w-0">
                                <h3 className="text-xs font-black text-slate-900 mb-2">Related case</h3>
                                <dl className="divide-y divide-slate-100 border-y border-slate-100 text-xs">
                                    {caseRows.map(([label, value]) => (
                                        <div key={label} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2">
                                            <dt className="font-semibold text-slate-500">{label}</dt>
                                            <dd className="font-semibold text-slate-800 break-words">{value}</dd>
                                        </div>
                                    ))}
                                    {missionStatus && (
                                        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2">
                                            <dt className="font-semibold text-slate-500">Mission status</dt>
                                            <dd>
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${getStatusStyle(missionStatus)}`}>
                                                    {missionStatus}
                                                </span>
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </section>

                            {/* Progress */}
                            {missionData && (
                                <section>
                                    <h3 className="text-xs font-black text-slate-900 mb-3">Progress</h3>
                                    <ol className="flex flex-col">
                                        {getTimelineSteps(missionData).map((step, idx, arr) => {
                                            const isLast = idx === arr.length - 1;
                                            const isCompleted = step.status === 'Resolved';
                                            const isInProgress = step.status === 'In Progress';
                                            const isPending = step.status === 'Pending';
                                            const isNotStarted = step.status === 'Not Started';
                                            const circle = isCompleted
                                                ? 'bg-emerald-500 text-white border-emerald-500'
                                                : isInProgress
                                                    ? 'bg-blue-500 text-white border-blue-500'
                                                    : isPending
                                                        ? 'bg-role text-white border-role'
                                                        : 'bg-slate-100 border-slate-300 text-slate-400';
                                            return (
                                                <li key={idx} className="flex items-start relative pb-3 last:pb-0">
                                                    {!isLast && (
                                                        <span className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                                                    )}
                                                    <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 shrink-0 text-[10px] font-bold ${circle}`}>
                                                        {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : idx + 1}
                                                    </span>
                                                    <div className="ml-3 min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                                                            <p className={`text-xs font-bold ${isNotStarted ? 'text-slate-400' : 'text-slate-900'}`}>{step.label}</p>
                                                            {!isNotStarted && step.timestamp && step.timestamp !== '-' && (
                                                                <span className="text-[10px] font-semibold text-slate-400">{step.timestamp}</span>
                                                            )}
                                                        </div>
                                                        {step.note && step.note !== '-' && (
                                                            <p className="text-[11px] text-slate-500 leading-snug break-words">{step.note}</p>
                                                        )}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </section>
                            )}

                            {/* Original sighting photos */}
                            {originalEvidence.length > 0 && (
                                <section>
                                    <h3 className="text-xs font-black text-slate-900 mb-2">Original sighting evidence</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {originalEvidence.map((file: any) => (
                                            <a
                                                key={file.media_id}
                                                href={file.file_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                title={`Open media #${file.media_id}`}
                                                className="block aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
                                            >
                                                <img src={file.file_url} alt={`Sighting media #${file.media_id}`} loading="lazy" className="w-full h-full object-cover" />
                                            </a>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* Resolution proof */}
                            {resolutionProof.length > 0 && (
                                <section>
                                    <h3 className="text-xs font-black text-emerald-700 mb-2">Resolution proof</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {resolutionProof.map((file: any) => (
                                            <a
                                                key={file.media_id}
                                                href={file.file_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                title={`Open media #${file.media_id}`}
                                                className="block aspect-[4/3] rounded-xl overflow-hidden border border-emerald-200 bg-white"
                                            >
                                                <img src={file.file_url} alt={`Resolution media #${file.media_id}`} loading="lazy" className="w-full h-full object-cover" />
                                            </a>
                                        ))}
                                    </div>
                                </section>
                            )}
                        </div>

                        {/* Footer */}
                        <footer className="shrink-0 px-4 sm:px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white flex justify-end">
                            <button
                                type="button"
                                onClick={closePreview}
                                className="h-11 w-full sm:w-auto px-6 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-sm transition-colors cursor-pointer"
                            >
                                Close preview
                            </button>
                        </footer>
                    </div>
                </div>
                );
            })()}
        </div>
    );
};

export default EndorsementArch;
