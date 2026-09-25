import { useState, useEffect } from 'react';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { useNavigate } from 'react-router-dom';
import { Sparkles, MapPin, Search, ArrowRight } from 'lucide-react';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import DataTable from '../../components/DataTable';
import Select from '../../components/Dropdown';
import { REPORT_STATUS_MAP } from '../../utils/reportStatus';
import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import ReportChatBadge from '../../components/Chat/ReportChatBadge';
import { api } from '../../utils/api';

interface Report {
    report_id: number;
    category_id: number;
    status_id: number;
    priority_level: string;
    landmark: string;
    animal_type: string;
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    reporter_name?: string;
    media?: any[];
    history?: any[];
}

const statusMap = REPORT_STATUS_MAP;

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed',
    6: 'Lost Pet',
};

const BrgyHistoryReports = () => {
    const navigate = useNavigate();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Chat Drawer state
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [selectedChatReport, setSelectedChatReport] = useState<Report | null>(null);

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!userStr) {
            navigate('/staff/login');
        } else {
            try {
                if (currentUser.role_id !== 3) {
                    navigate('/staff/login');
                }
            } catch {
                navigate('/staff/login');
            }
        }
    }, [navigate]);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const params: any = { escalated_only: true };
            if (currentUser?.barangay_id) {
                params.barangay_id = currentUser.barangay_id;
            }
            const response = await api.get('/reports/', { params });
            const sorted = (response.data || []).sort((a: any, b: any) => b.report_id - a.report_id);
            setReports(sorted);
        } catch (error) {
            console.error('Error fetching reports:', error);
            setReports([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const isReportEscalated = (rep: any) => {
        if (!rep) return false;
        if ([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18].includes(rep.status_id)) return true;
        if (rep.endorsement_letter) return true;
        if (rep.rescue_id || (rep.rescues && rep.rescues.length > 0)) return true;
        if (rep.history?.some((h: any) => [4, 5, 6, 7, 8, 13].includes(h.report_status_id) || h.rescue_id)) return true;
        return false;
    };

    const historyReports = reports.filter(rep => 
        isReportEscalated(rep) && (
            rep.status_id === 11 || 
            rep.status_id === 9 ||
            rep.status_id === 10 ||
            rep.status_id === 12 || 
            rep.status_id === 14 ||
            rep.status_id === 17 ||
            rep.status_id === 18 ||
            (rep.status_id === 3 && rep.history?.some((h: any) => [4, 5, 6, 7, 8, 13].includes(h.report_status_id)))
        )
    );

    const filteredReports = historyReports.filter(rep => {
        const catName = categoryMap[rep.category_id]?.toLowerCase() || '';
        const land = (rep.landmark || '').toLowerCase();
        const reporter = (rep.reporter_name || '').toLowerCase();
        const desc = (rep.description || '').toLowerCase();
        const q = searchTerm.toLowerCase();
        const matchesSearch =
            catName.includes(q) ||
            land.includes(q) ||
            reporter.includes(q) ||
            desc.includes(q) ||
            rep.report_id.toString().includes(q);

        const statName = (statusMap[rep.status_id] || '').toLowerCase();
        let matchesStatus = true;
        if (statusFilter !== 'all') {
            const sf = statusFilter.toLowerCase();
            if (sf === 'resolved') {
                matchesStatus = [11, 9, 10].includes(rep.status_id);
            } else if (sf === 'dismissed' || sf.includes('dismissed') || sf.includes('false alarm')) {
                matchesStatus = [14, 17].includes(rep.status_id);
            } else if (sf === 'deceased') {
                matchesStatus = rep.status_id === 12;
            } else if (sf === 'rejected') {
                matchesStatus = rep.status_id === 3;
            } else {
                matchesStatus = statName.includes(sf);
            }
        }

        return matchesSearch && matchesStatus;
    });

    const totalHistory = historyReports.length;
    const resolvedCount = historyReports.filter(r => r.status_id === 11 || r.status_id === 9 || r.status_id === 10).length;
    const deceasedCount = historyReports.filter(r => r.status_id === 12).length;
    const dismissedCount = historyReports.filter(r => r.status_id === 14 || r.status_id === 17).length;
    const rejectedCount = historyReports.filter(r => r.status_id === 3).length;

    const getPriorityColor = (priority: string) => {
        switch ((priority || '').toLowerCase()) {
            case 'emergency':
            case 'high': return 'bg-red-50 text-red-600 border-red-100';
            case 'regular':
            case 'medium': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'low': return 'bg-blue-50 text-blue-600 border-blue-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const getStatusColor = (status: string) => {
        const s = (status || '').toLowerCase();
        if (s.includes('resolved')) return 'bg-green-50 text-green-600 border-green-100';
        if (s.includes('claimed')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        if (s.includes('released')) return 'bg-teal-50 text-teal-700 border-teal-200';
        if (s.includes('deceased')) return 'bg-gray-100 text-gray-600 border-gray-200';
        if (s.includes('cannot be found')) return 'bg-amber-50 text-amber-800 border-amber-200';
        if (s.includes('false alarm') || s.includes('dismissed')) return 'bg-amber-50 text-amber-700 border-amber-200';
        if (s.includes('merged')) return 'bg-stone-100 text-stone-700 border-stone-200';
        if (s.includes('rejected')) return 'bg-red-50 text-red-600 border-red-100';
        return 'bg-gray-50 text-gray-600 border-gray-100';
    };

    const getStatusIcon = (statusId: number) => {
        if (statusId === 11 || statusId === 9 || statusId === 10) return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
        );
        if (statusId === 12) return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
        );
        if (statusId === 14 || statusId === 17) return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524L13.477 14.89zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
            </svg>
        );
        return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
        );
    };

    const metrics = [
        {
            label: 'Total History',
            value: totalHistory,
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
            lightColor: 'bg-green-50',
            textColor: 'text-green-600',
            icon: (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
            )
        },
        {
            label: 'Dismissed',
            value: dismissedCount,
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
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <BrgySidebar
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />

            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
                <BrgyNavbar
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Report History</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">All closed and archived incident reports</p>
                        </div>
                    }
                />

                <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-32 lg:pb-8 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    <div className="max-w-7xl mx-auto w-full space-y-8">

                        {/* ─── MOBILE HERO BANNER (block md:hidden) ─── */}
                        <div className="block md:hidden relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1E293B] via-[#334155] to-[#475569] p-5 shadow-lg shadow-slate-900/10 text-white animate-in fade-in slide-in-from-top-3 duration-300">
                            {/* Glowing decorative backdrops */}
                            <div className="absolute -right-8 -top-8 w-36 h-36 bg-orange-500/20 rounded-full blur-2xl pointer-events-none" />
                            <div className="absolute right-10 -bottom-8 w-32 h-32 bg-amber-400/15 rounded-full blur-xl pointer-events-none" />
                            <div className="absolute right-3 top-3 text-3xl opacity-85 select-none animate-bounce duration-1000">
                                📜
                            </div>

                            <div className="relative z-10 space-y-3.5">
                                <div>
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md text-[10px] font-black uppercase tracking-wider text-slate-200 border border-white/20 shadow-2xs mb-1.5">
                                        <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                                        Official Records
                                    </div>
                                    <h1 className="text-xl font-black tracking-tight leading-tight text-white">
                                        Archived Reports
                                    </h1>
                                    <p className="text-xs font-semibold text-slate-300 mt-1 leading-relaxed max-w-[260px]">
                                        Review resolved, closed, and finalized barangay animal incident logs.
                                    </p>
                                </div>

                                {/* Quick stat counters pill grid */}
                                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/15">
                                    <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-2xl border border-white/20 text-center">
                                        <div className="text-[9px] font-extrabold text-slate-300 uppercase tracking-wider">Total</div>
                                        <div className="text-base font-black text-white mt-0.5 leading-tight">{totalHistory}</div>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-2xl border border-white/20 text-center">
                                        <div className="text-[9px] font-extrabold text-emerald-300 uppercase tracking-wider">Resolved</div>
                                        <div className="text-base font-black text-emerald-200 mt-0.5 leading-tight">{resolvedCount}</div>
                                    </div>
                                    <div className="bg-white/10 backdrop-blur-md p-2.5 rounded-2xl border border-white/20 text-center">
                                        <div className="text-[9px] font-extrabold text-amber-300 uppercase tracking-wider">Closed</div>
                                        <div className="text-base font-black text-amber-200 mt-0.5 leading-tight">{dismissedCount + deceasedCount}</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Metrics Row (Desktop: hidden on mobile since hero banner displays it) */}
                        <div className="hidden md:grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-4">
                            {metrics.map((metric, i) => (
                                <div key={i} className={`bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 flex items-center gap-3 sm:gap-4 hover:shadow-xs transition-all ${i === metrics.length - 1 && metrics.length % 2 !== 0 ? 'col-span-2 sm:col-span-1' : ''}`}>
                                    <div className={`w-9 h-9 sm:w-11 sm:h-11 rounded-xl ${metric.lightColor} ${metric.textColor} flex items-center justify-center shrink-0`}>
                                        {metric.icon}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-wider truncate leading-tight">{metric.label}</p>
                                        <p className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 leading-none">{metric.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ─── MOBILE QUICK FILTER CHIPS (block md:hidden) ─── */}
                        <div className="block md:hidden overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
                            <div className="flex items-center gap-1.5 min-w-max">
                                {[
                                    { id: 'all', label: 'All Cases', count: totalHistory, icon: '📋' },
                                    { id: 'Resolved', label: 'Resolved', count: resolvedCount, icon: '✅' },
                                    { id: 'False Alarm / Dismissed', label: 'Dismissed', count: dismissedCount, icon: '🛡️' },
                                    { id: 'Deceased', label: 'Deceased', count: deceasedCount, icon: '🕊️' },
                                    { id: 'Rejected', label: 'Rejected', count: rejectedCount, icon: '✕' },
                                ].map((tab) => {
                                    const isActive = statusFilter === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setStatusFilter(tab.id)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer shadow-2xs ${
                                                isActive
                                                    ? 'bg-[#F97316] text-white shadow-orange-500/25 scale-[1.02]'
                                                    : 'bg-white text-slate-600 border border-slate-200/80 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className="text-xs">{tab.icon}</span>
                                            <span>{tab.label}</span>
                                            <span className={`px-1.5 py-0.2 text-[9.5px] rounded-full font-black ${
                                                isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                                {tab.count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Search & Filters */}
                        <div className="bg-white rounded-2xl shadow-2xs border border-slate-200/90 p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="relative flex-1 max-w-md w-full">
                                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                    <Search className="h-4 w-4" />
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search category, landmark, or reporter..."
                                    className="w-full pl-10 pr-8 py-2 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-xs"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                )}
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 justify-between md:justify-end">
                                <Select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Status' },
                                        { value: 'Resolved', label: 'Resolved' },
                                        { value: 'False Alarm / Dismissed', label: 'Dismissed' },
                                        { value: 'Deceased', label: 'Deceased' },
                                        { value: 'Rejected', label: 'Rejected' },
                                    ]}
                                    className="flex-1 sm:flex-initial sm:w-[150px]"
                                />
                                <button
                                    type="button"
                                    onClick={fetchReports}
                                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-2xs shrink-0 cursor-pointer"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh
                                </button>
                            </div>
                        </div>

                        {/* ─── MOBILE CARD VIEW ─── */}
                        <div className="block md:hidden space-y-3.5">
                            {loading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <div key={i} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs animate-pulse space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="h-4 w-24 bg-slate-100 rounded-lg" />
                                            <div className="h-5 w-16 bg-slate-100 rounded-full" />
                                        </div>
                                        <div className="h-32 w-full bg-slate-100 rounded-2xl" />
                                        <div className="h-4 w-3/4 bg-slate-100 rounded" />
                                        <div className="h-3 w-1/2 bg-slate-50 rounded" />
                                    </div>
                                ))
                            ) : filteredReports.length === 0 ? (
                                <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center shadow-xs space-y-2">
                                    <div className="w-14 h-14 mx-auto bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 text-2xl shadow-2xs">
                                        📜
                                    </div>
                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">No History Reports Found</h4>
                                    <p className="text-xs text-slate-500 font-semibold">Try adjusting your search keyword or quick status filter</p>
                                </div>
                            ) : (
                                filteredReports.map((rep) => {
                                    const statText = statusMap[rep.status_id] || 'Unknown';
                                    const isResolved = [11, 9, 10].includes(rep.status_id);
                                    const isDeceased = rep.status_id === 12;

                                    const mediaList = rep.media || [];
                                    const firstMedia = mediaList.find((m: any) =>
                                        m.media_type !== 'Document' &&
                                        !m.file_url?.toLowerCase().endsWith('.pdf') &&
                                        !m.file_url?.toLowerCase().endsWith('.docx') &&
                                        !m.file_url?.toLowerCase().endsWith('.doc')
                                    );
                                    const isVideo = firstMedia?.media_type === 'Video' || firstMedia?.file_url?.toLowerCase().match(/\.(mp4|mov|webm)$/i);
                                    const mediaCount = mediaList.length;

                                    const accentBarColor = isResolved 
                                        ? 'bg-emerald-500' 
                                        : isDeceased 
                                        ? 'bg-slate-500' 
                                        : 'bg-amber-500';

                                    return (
                                        <div
                                            key={rep.report_id}
                                            onClick={() => navigate(`/brgy/history/${rep.report_id}`)}
                                            className="bg-white rounded-3xl p-4 border border-slate-200/90 shadow-sm hover:shadow-md hover:border-orange-300 transition-all duration-300 space-y-3.5 cursor-pointer relative overflow-hidden group active:scale-[0.99] animate-in fade-in slide-in-from-bottom-2"
                                        >
                                            {/* Accent colored top line */}
                                            <div className={`absolute top-0 left-0 right-0 h-1 ${accentBarColor}`} />

                                            {/* Header Row: ID, Category, Priority Badge */}
                                            <div className="flex items-start justify-between gap-2 pt-1">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-[10px] font-mono font-black text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
                                                            #{rep.report_id.toString().padStart(4, '0')}
                                                        </span>
                                                        <span className="text-sm font-black text-slate-900 truncate leading-snug group-hover:text-orange-600 transition-colors">
                                                            {categoryMap[rep.category_id] || 'Other Incident'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${getPriorityColor(rep.priority_level)}`}>
                                                    {rep.priority_level}
                                                </span>
                                            </div>

                                            {/* Animal Photo Preview (if available) */}
                                            {firstMedia && (
                                                <div className="w-full h-36 rounded-2xl overflow-hidden bg-slate-100 border border-slate-100 relative group-hover:shadow-inner transition-all">
                                                    {isVideo ? (
                                                        <video src={firstMedia.file_url} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <img
                                                            src={firstMedia.file_url}
                                                            alt="Incident media"
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        />
                                                    )}
                                                    {mediaCount > 1 && (
                                                        <span className="absolute bottom-2 right-2 bg-black/65 backdrop-blur-md text-white text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-white/20 shadow-xs">
                                                            +{mediaCount - 1} photos
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Status Badge & Case Chat Row */}
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={isResolved ? 'text-emerald-500' : isDeceased ? 'text-slate-500' : 'text-amber-500'}>
                                                        {getStatusIcon(rep.status_id)}
                                                    </span>
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider ${getStatusColor(statText)}`}>
                                                        {statText}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                    <ReportChatBadge
                                                        reportId={rep.report_id}
                                                        currentUserId={currentUser?.user_id}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedChatReport(rep);
                                                            setIsChatOpen(true);
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* Location & Details Box */}
                                            <div className="bg-slate-50/90 rounded-2xl p-3 border border-slate-100 text-xs space-y-1.5">
                                                <div className="flex items-center gap-1.5 text-slate-700 font-bold text-[11px]">
                                                    <MapPin className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                                                    <span className="truncate">{rep.landmark || 'No landmark specified'}</span>
                                                </div>
                                                {rep.description && (
                                                    <p className="text-slate-500 text-[11px] line-clamp-2 leading-relaxed font-medium">
                                                        {rep.description}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Reporter & Action Row */}
                                            <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-black shrink-0 border border-orange-200">
                                                        {(rep.reporter_name || 'U').charAt(0).toUpperCase()}
                                                    </div>
                                                    <span className="text-[11px] font-bold text-slate-700 truncate">
                                                        {rep.reporter_name || `User ${rep.user_id}`}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-medium shrink-0">
                                                        • <RelativeTimestamp date={rep.created_at} />
                                                    </span>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        navigate(`/brgy/history/${rep.report_id}`);
                                                    }}
                                                    className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F97316] font-black text-[10.5px] rounded-xl border border-orange-200 uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-2xs group-hover:bg-[#F97316] group-hover:text-white group-hover:border-orange-500 cursor-pointer shrink-0"
                                                >
                                                    <span>View</span>
                                                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* ─── DESKTOP DATA TABLE ─── */}
                        <div className="hidden md:block">
                            <DataTable
                                loading={loading}
                                data={filteredReports}
                                emptyMessage="No history reports found."
                                loadingMessage="Loading history reports..."
                                onRowClick={(rep) => navigate(`/brgy/history/${rep.report_id}`)}
                                columns={[
                                    {
                                        header: "ID",
                                        key: "report_id",
                                        render: (rep) => (
                                            <span className="text-xs font-mono text-gray-400">#{rep.report_id.toString().padStart(4, '0')}</span>
                                        )
                                    },
                                    {
                                        header: "Category",
                                        key: "category",
                                        render: (rep) => (
                                            <div className="flex items-center space-x-2">
                                                <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                                                <span className="text-sm font-bold text-gray-900">{categoryMap[rep.category_id] || 'Other'}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Priority",
                                        key: "priority",
                                        render: (rep) => (
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getPriorityColor(rep.priority_level)}`}>
                                                {rep.priority_level}
                                            </span>
                                        )
                                    },
                                    {
                                        header: "Location",
                                        key: "location",
                                        render: (rep) => (
                                            <div className="flex items-center space-x-1.5 text-gray-500">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <span className="text-xs truncate max-w-[150px]">{rep.landmark || 'No landmark'}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Outcome Status",
                                        key: "status",
                                        render: (rep) => (
                                            <div className="flex items-center gap-2">
                                                <ReportChatBadge
                                                    reportId={rep.report_id}
                                                    currentUserId={currentUser?.user_id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedChatReport(rep);
                                                        setIsChatOpen(true);
                                                    }}
                                                />
                                                <span className={`${[11, 9, 10].includes(rep.status_id) ? 'text-green-500' : rep.status_id === 12 ? 'text-gray-500' : 'text-red-500'}`}>
                                                    {getStatusIcon(rep.status_id)}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusColor(statusMap[rep.status_id] || '')}`}>
                                                    {statusMap[rep.status_id] || 'Unknown'}
                                                </span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Reported",
                                        key: "created_at",
                                        render: (rep) => (
                                            <span className="text-xs text-gray-400">
                                                <RelativeTimestamp date={rep.created_at} />
                                            </span>
                                        )
                                    },
                                    {
                                        header: "Submitted By",
                                        key: "reporter",
                                        render: (rep) => (
                                            <div className="flex items-center space-x-2">
                                                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-500 font-bold border border-gray-200">
                                                    {(rep.reporter_name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <span className="text-xs font-semibold text-gray-700">{rep.reporter_name || `User ${rep.user_id}`}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Action",
                                        key: "action",
                                        className: "text-right",
                                        render: (rep) => (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/brgy/history/${rep.report_id}`);
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-100 rounded-lg hover:bg-orange-100 transition-all uppercase tracking-widest cursor-pointer"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                                View
                                            </button>
                                        )
                                    }
                                ]}
                            />
                        </div>

                        {/* Info Banner */}
                        <div className="bg-orange-50/60 border border-orange-100 rounded-2xl p-5 flex items-start gap-4">
                            <div className="w-9 h-9 rounded-xl bg-[#F97316] text-white flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-orange-900">History Archive</h4>
                                <p className="text-xs text-orange-700 mt-1 leading-relaxed">
                                    This page contains all closed and past incident reports — including Resolved, Dismissed (False Alarm), Deceased, and Rejected cases.
                                    These records are read-only and cannot be modified.
                                </p>
                            </div>
                        </div>

                    </div>
                </div>

                <BrgyBottomNav />
            </main>

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

export default BrgyHistoryReports;
