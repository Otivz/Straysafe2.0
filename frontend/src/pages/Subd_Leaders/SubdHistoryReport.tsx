import { useState, useEffect } from 'react';
import api from '../../utils/api';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { useNavigate } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import DataTable from '../../components/DataTable';
import { getCachedData, setCachedData } from '../../utils/cache';
import { REPORT_STATUS_MAP } from '../../utils/reportStatus';
import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import ReportChatBadge from '../../components/Chat/ReportChatBadge';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';

interface Report {
    report_id: number;
    category_id: number;
    status_id: number;
    priority_level: string;
    latitude: number;
    longitude: number;
    landmark: string;
    animal_count: number;
    animal_type: string;
    breed?: string;
    condition: string;
    behavior_tags?: string;
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    reporter_name?: string;
    reporter_photo?: string;
    media?: any[];
    comments?: any[];
}

const statusMap = REPORT_STATUS_MAP;

const categoryMap: Record<number, string> = {
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed', 6: 'Lost Pet'
};

const HISTORY_STATUSES = [11, 12, 3, 9, 10, 14, 8, 7, 17, 18]; // Resolved (11), Deceased (12), Rejected (3), Claimed (9), Released (10), Dismissed (14), Impounded (8), Observation (7), Cannot Be Found (17), Merged (18)

const SubdHistoryReport = () => {
    const navigate = useNavigate();

    const [reports, setReports] = useState<Report[]>(() => getCachedData<Report[]>('subd_history_reports') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<Report[]>('subd_history_reports'));
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Chat Drawer state
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [selectedChatReport, setSelectedChatReport] = useState<Report | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!userStr) {
            navigate('/staff/login');
        } else {
            try {
                if (currentUser.role_id !== 2) {
                    navigate('/staff/login');
                }
            } catch {
                navigate('/staff/login');
            }
        }
    }, [navigate, userStr, currentUser]);

    const fetchReports = async (forceLoading = false) => {
        try {
            if (forceLoading || !getCachedData('subd_history_reports')) {
                setLoading(true);
            }
            const subId = currentUser?.subdivision_id;
            const url = subId ? `/reports/?subdivision_id=${subId}` : '/reports/';
            const response = await api.get(url);
            const sortedData = (response.data || []).sort((a: any, b: any) => b.report_id - a.report_id);
            const uniqueReports = sortedData.filter((report: any, index: number, self: any[]) =>
                index === self.findIndex((t: any) => t.report_id === report.report_id)
            );
            setReports(uniqueReports);
            setCachedData('subd_history_reports', uniqueReports);
        } catch (error) {
            console.error('Error fetching reports:', error);
            if (!getCachedData('subd_history_reports')) {
                setReports([]);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    // Only include history (closed/impounded/resolved) reports
    const historyReports = reports.filter(rep => HISTORY_STATUSES.includes(rep.status_id));

    const filteredReports = historyReports.filter(rep => {
        const catName = categoryMap[rep.category_id]?.toLowerCase() || '';
        const land = (rep.landmark || '').toLowerCase();
        const reporter = (rep.reporter_name || '').toLowerCase();
        const matchesSearch =
            catName.includes(searchTerm.toLowerCase()) ||
            land.includes(searchTerm.toLowerCase()) ||
            reporter.includes(searchTerm.toLowerCase());

        const statName = statusMap[rep.status_id] || '';
        let matchesStatus = true;
        if (statusFilter !== 'all') {
            const sf = statusFilter.toLowerCase();
            if (sf === 'resolved') {
                matchesStatus = [11, 9, 10].includes(rep.status_id);
            } else if (sf === 'impounded' || sf.includes('impound')) {
                matchesStatus = [8, 7].includes(rep.status_id);
            } else if (sf === 'dismissed' || sf.includes('dismissed') || sf.includes('false alarm')) {
                matchesStatus = [14, 17].includes(rep.status_id);
            } else if (sf === 'deceased') {
                matchesStatus = rep.status_id === 12;
            } else if (sf === 'rejected') {
                matchesStatus = rep.status_id === 3;
            } else {
                matchesStatus = statName.toLowerCase().includes(sf);
            }
        }

        return matchesSearch && matchesStatus;
    });

    // Metrics
    const totalHistory = historyReports.length;
    const resolvedCount = historyReports.filter(r => r.status_id === 11 || r.status_id === 9 || r.status_id === 10).length;
    const impoundedCount = historyReports.filter(r => r.status_id === 8 || r.status_id === 7).length;
    const deceasedCount = historyReports.filter(r => r.status_id === 12).length;
    const dismissedCount = historyReports.filter(r => r.status_id === 14 || r.status_id === 17).length;
    const rejectedCount = historyReports.filter(r => r.status_id === 3).length;

    const getPriorityColor = (priority: string) => {
        switch (priority.toLowerCase()) {
            case 'emergency':
            case 'high': return 'bg-red-50 text-red-600 border-red-100';
            case 'regular':
            case 'medium': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'low': return 'bg-blue-50 text-blue-600 border-blue-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'resolved':
            case 'incident resolved':
                return 'bg-green-50 text-green-600 border-green-100';
            case 'claimed by owner':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'released':
                return 'bg-teal-50 text-teal-700 border-teal-200';
            case 'impounded':
                return 'bg-amber-50 text-amber-800 border-amber-300';
            case 'under observation':
                return 'bg-blue-50 text-blue-700 border-blue-200';
            case 'deceased':
                return 'bg-gray-100 text-gray-600 border-gray-200';
            case 'animal cannot be found':
                return 'bg-amber-50 text-amber-800 border-amber-300';
            case 'false alarm / dismissed':
            case 'dismissed':
                return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'merged — duplicate':
            case 'merged':
                return 'bg-stone-100 text-stone-700 border-stone-200';
            case 'rejected':
                return 'bg-red-50 text-red-600 border-red-100';
            default:
                return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const metrics = [
        {
            label: 'Total History',
            value: totalHistory,
            color: 'bg-purple-500',
            lightColor: 'bg-purple-50',
            textColor: 'text-purple-600',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.8 2.8a1 1 0 101.414-1.414L11 9.586V6z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            label: 'Resolved',
            value: resolvedCount,
            color: 'bg-green-500',
            lightColor: 'bg-green-50',
            textColor: 'text-green-600',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            label: 'Impounded',
            value: impoundedCount,
            color: 'bg-amber-500',
            lightColor: 'bg-amber-50',
            textColor: 'text-amber-700',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            label: 'Dismissed',
            value: dismissedCount,
            color: 'bg-amber-500',
            lightColor: 'bg-amber-50',
            textColor: 'text-amber-600',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524L13.477 14.89zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            label: 'Deceased',
            value: deceasedCount,
            color: 'bg-gray-500',
            lightColor: 'bg-gray-100',
            textColor: 'text-gray-600',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            label: 'Rejected',
            value: rejectedCount,
            color: 'bg-red-500',
            lightColor: 'bg-red-50',
            textColor: 'text-red-600',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            )
        },
    ];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* TOP NAVIGATION */}
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">History Reports</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">All past and closed incident reports in your subdivision</p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-36 md:pb-8 custom-scrollbar">
                    <div className="max-w-6xl mx-auto w-full flex flex-col gap-3 sm:gap-4 min-w-0">
                        {/* Heading (phones; desktop shows it in the top bar) */}
                        <div className="md:hidden">
                            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-tight">History</h1>
                            <p className="text-xs font-semibold text-gray-500">Closed and past incident reports in your subdivision.</p>
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
                            {metrics.map((metric) => (
                                <div key={metric.label} className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 flex flex-col gap-1.5 min-w-0">
                                    <p className={`text-2xl sm:text-3xl font-black leading-none ${metric.textColor}`}>{metric.value}</p>
                                    <p className="text-xs font-bold text-slate-600 leading-tight">{metric.label}</p>
                                </div>
                            ))}
                        </div>

                        {/* Search, outcome chips, refresh */}
                        <div className="bg-white rounded-2xl border border-slate-200/80 p-3 sm:p-4 flex flex-col gap-2.5 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="relative flex-1 min-w-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="search"
                                        placeholder="Search category, landmark or reporter"
                                        aria-label="Search history"
                                        className="w-full h-11 pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => fetchReports(true)}
                                    aria-label="Refresh history"
                                    title="Refresh"
                                    className="h-11 w-11 sm:w-auto sm:px-4 shrink-0 flex items-center justify-center gap-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span className="hidden sm:inline">Refresh</span>
                                </button>
                            </div>

                            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Outcome">
                                {[
                                    { id: 'all', label: 'All', count: totalHistory },
                                    { id: 'Resolved', label: 'Resolved', count: resolvedCount },
                                    { id: 'Impounded', label: 'Impounded', count: impoundedCount },
                                    { id: 'False Alarm / Dismissed', label: 'Dismissed', count: dismissedCount },
                                    { id: 'Deceased', label: 'Deceased', count: deceasedCount },
                                    { id: 'Rejected', label: 'Rejected', count: rejectedCount },
                                ].map((tab) => {
                                    const isActive = statusFilter === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={isActive}
                                            onClick={() => setStatusFilter(tab.id)}
                                            className={`h-9 px-3.5 shrink-0 rounded-full text-xs font-black whitespace-nowrap inline-flex items-center gap-1.5 transition-colors cursor-pointer ${isActive
                                                ? 'bg-role text-white'
                                                : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            {tab.label}
                                            <span className={`text-[10px] font-black ${isActive ? 'text-white/80' : 'text-slate-400'}`}>{tab.count}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] font-semibold text-slate-500">
                                Showing {filteredReports.length} of {totalHistory} closed report{totalHistory !== 1 ? 's' : ''}
                            </p>
                        </div>

                        {/* ─── Phone list ─── */}
                        <div className="md:hidden flex flex-col gap-2.5">
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="bg-white rounded-2xl p-3 border border-slate-200/80 animate-pulse flex gap-3">
                                        <div className="w-16 h-16 bg-slate-100 rounded-xl shrink-0" />
                                        <div className="flex-1 space-y-2 pt-1">
                                            <div className="h-4 w-20 bg-slate-100 rounded-full" />
                                            <div className="h-4 w-3/4 bg-slate-100 rounded" />
                                            <div className="h-3 w-1/2 bg-slate-50 rounded" />
                                        </div>
                                    </div>
                                ))
                            ) : filteredReports.length === 0 ? (
                                <div className="bg-white rounded-2xl px-4 py-10 border border-dashed border-slate-200 text-center">
                                    <div className="w-12 h-12 mx-auto bg-role-soft rounded-full flex items-center justify-center text-role mb-2">🐾</div>
                                    <h4 className="text-sm font-black text-slate-900">{totalHistory === 0 ? 'No closed reports yet' : 'No reports match these filters'}</h4>
                                    <p className="text-xs text-slate-500 mt-1">{totalHistory === 0 ? 'Closed and past reports will appear here.' : 'Try another outcome or search word.'}</p>
                                    {totalHistory > 0 && (statusFilter !== 'all' || searchTerm) && (
                                        <button
                                            type="button"
                                            onClick={() => { setStatusFilter('all'); setSearchTerm(''); }}
                                            className="mt-3 h-9 px-4 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:text-role hover:border-role-border cursor-pointer"
                                        >
                                            Clear filters
                                        </button>
                                    )}
                                </div>
                            ) : (
                                filteredReports.map((rep) => {
                                    const statText = statusMap[rep.status_id] || 'Unknown';
                                    const rawImages = (rep.media || []).filter((m: any) => {
                                        const url = (m.file_url || m.url || '').toLowerCase();
                                        return (
                                            m.media_type !== 'Document' &&
                                            !url.endsWith('.pdf') &&
                                            !url.endsWith('.docx') &&
                                            !url.endsWith('.doc')
                                        );
                                    });
                                    const sightingImages = rawImages.filter((m: any) => !m.is_evidence);
                                    const imagesList = sightingImages.length > 0 ? sightingImages : rawImages;
                                    const firstMedia = imagesList[0] || null;
                                    const isVideo = firstMedia?.media_type === 'Video' || firstMedia?.file_url?.toLowerCase().match(/\.(mp4|mov|webm)$/i);
                                    const mediaCount = imagesList.length;
                                    const priority = rep.priority_level || 'Medium';

                                    return (
                                        <div
                                            key={rep.report_id}
                                            role="link"
                                            tabIndex={0}
                                            aria-label={`Open report #${rep.report_id}`}
                                            onClick={() => navigate(`/subd/history/${rep.report_id}`)}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/subd/history/${rep.report_id}`); } }}
                                            className="bg-white rounded-2xl p-3 border border-slate-200/80 flex gap-3 items-start min-w-0 cursor-pointer hover:border-role-border active:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-role/30"
                                        >
                                            {/* Thumbnail */}
                                            <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-100 border border-slate-100 relative shrink-0">
                                                {firstMedia ? (
                                                    isVideo ? (
                                                        <video src={firstMedia.file_url} preload="metadata" muted playsInline className="w-full h-full object-cover" />
                                                    ) : (
                                                        <img loading="lazy" decoding="async" src={firstMedia.file_url} alt="" className="w-full h-full object-cover" />
                                                    )
                                                ) : (
                                                    <span className="w-full h-full flex items-center justify-center text-xl text-slate-300">🐾</span>
                                                )}
                                                {mediaCount > 1 && (
                                                    <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-black px-1.5 rounded-full">+{mediaCount - 1}</span>
                                                )}
                                            </div>

                                            {/* Outcome, identity, details */}
                                            <div className="min-w-0 flex-1">
                                                <span className={`inline-block max-w-full truncate px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${getStatusColor(statText)}`}>
                                                    {statText}
                                                </span>
                                                <p className="mt-1 text-sm font-black text-slate-900 leading-snug break-words">
                                                    {categoryMap[rep.category_id] || 'Incident Report'}
                                                </p>
                                                <p className="text-[11px] font-semibold text-slate-500 truncate">
                                                    #{rep.report_id.toString().padStart(4, '0')} · {priority} priority
                                                </p>
                                                <p className="text-xs text-slate-600 truncate mt-0.5">{rep.landmark || 'No landmark specified'}</p>
                                                <p className="text-[11px] text-slate-400 truncate">
                                                    Reported <RelativeTimestamp date={rep.created_at} /> · {rep.reporter_name || `Resident #${rep.user_id}`}
                                                </p>
                                            </div>

                                            {/* Case chat + open */}
                                            <div className="flex flex-col items-end justify-between self-stretch gap-2 shrink-0">
                                                <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                                    <ReportChatBadge
                                                        reportId={rep.report_id}
                                                        currentUserId={currentUser?.user_id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedChatReport(rep);
                                                            setIsChatOpen(true);
                                                        }}
                                                    />
                                                </span>
                                                <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* ─── Desktop table ─── */}
                        <div className="hidden md:block">
                            <DataTable
                                loading={loading}
                                data={filteredReports}
                                emptyMessage="No history reports found."
                                loadingMessage="Loading history reports..."
                                onRowClick={(rep) => navigate(`/subd/history/${rep.report_id}`)}
                                columns={[
                                    {
                                        header: "ID",
                                        key: "report_id",
                                        render: (rep) => (
                                            <span className="text-xs font-mono text-slate-500">#{rep.report_id.toString().padStart(4, '0')}</span>
                                        )
                                    },
                                    {
                                        header: "Category",
                                        key: "category",
                                        render: (rep) => (
                                            <span className="text-sm font-bold text-slate-900">{categoryMap[rep.category_id] || 'Other'}</span>
                                        )
                                    },
                                    {
                                        header: "Outcome",
                                        key: "status",
                                        render: (rep) => (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide border whitespace-nowrap ${getStatusColor(statusMap[rep.status_id] || '')}`}>
                                                {statusMap[rep.status_id] || 'Unknown'}
                                            </span>
                                        )
                                    },
                                    {
                                        header: "Priority",
                                        key: "priority",
                                        render: (rep) => (
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityColor(rep.priority_level)}`}>
                                                {rep.priority_level}
                                            </span>
                                        )
                                    },
                                    {
                                        header: "Location",
                                        key: "location",
                                        render: (rep) => (
                                            <span className="text-xs text-slate-600 block truncate max-w-[180px]">{rep.landmark || 'No landmark'}</span>
                                        )
                                    },
                                    {
                                        header: "Reported",
                                        key: "created_at",
                                        render: (rep) => (
                                            <span className="text-xs text-slate-500 whitespace-nowrap">
                                                <RelativeTimestamp date={rep.created_at} />
                                            </span>
                                        )
                                    },
                                    {
                                        header: "Submitted By",
                                        key: "reporter",
                                        render: (rep) => (
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-6 h-6 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0">
                                                    {rep.reporter_photo ? (
                                                        <img loading="lazy" decoding="async" src={getProfilePicture(rep.reporter_photo)} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                    ) : (
                                                        <span className="text-[10px] text-slate-500 font-bold">{(rep.reporter_name || 'U').charAt(0).toUpperCase()}</span>
                                                    )}
                                                </div>
                                                <span className="text-xs font-semibold text-slate-700 truncate">{rep.reporter_name || `User ${rep.user_id}`}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Action",
                                        key: "action",
                                        className: "text-right",
                                        render: (rep) => (
                                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                <ReportChatBadge
                                                    reportId={rep.report_id}
                                                    currentUserId={currentUser?.user_id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedChatReport(rep);
                                                        setIsChatOpen(true);
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/subd/history/${rep.report_id}`);
                                                    }}
                                                    className="h-9 px-3.5 text-xs font-black text-role-hover bg-role-soft border border-role-border/80 rounded-xl hover:bg-role hover:text-white transition-colors cursor-pointer"
                                                >
                                                    View
                                                </button>
                                            </div>
                                        )
                                    }
                                ]}
                            />
                        </div>

                        {/* About this page */}
                        <p className="text-[11px] text-slate-500 leading-relaxed px-1">
                            Closed and past incident reports in your subdivision: Resolved, Impounded, Dismissed (False Alarm), Deceased and Rejected. These records are read-only; open one to see its full details.
                        </p>
                    </div>
                </main>
                <SubdBottomNav />
            </div>

            {/* Case Chat Drawer */}
            <ReportChatDrawer
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                report={selectedChatReport as any}
                currentUser={currentUser}
            />
        </div>
    );
};

export default SubdHistoryReport;
