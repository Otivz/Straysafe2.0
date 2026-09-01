import { useState, useEffect } from 'react';
import axios from 'axios';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { useNavigate } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import DataTable from '../../components/DataTable';
import Select from '../../components/Dropdown';
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

const HISTORY_STATUSES = [11, 12, 3, 9, 10, 14]; // Resolved (11), Deceased (12), Rejected (3), Claimed by Owner (9), Released (10), False Alarm / Dismissed (14)

const SubdHistoryReport = () => {
    const navigate = useNavigate();

    const [reports, setReports] = useState<Report[]>(() => getCachedData<Report[]>('subd_history_reports') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<Report[]>('subd_history_reports'));
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
            const url = subId ? `http://localhost:8000/reports/?subdivision_id=${subId}` : 'http://localhost:8000/reports/';
            const response = await axios.get(url);
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

    // Only include history (closed) reports
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
        const matchesStatus = statusFilter === 'all' || statName.toLowerCase() === statusFilter.toLowerCase();

        return matchesSearch && matchesStatus;
    });

    // Metrics
    const totalHistory = historyReports.length;
    const resolvedCount = historyReports.filter(r => r.status_id === 11 || r.status_id === 9 || r.status_id === 10).length;
    const deceasedCount = historyReports.filter(r => r.status_id === 12).length;
    const dismissedCount = historyReports.filter(r => r.status_id === 14).length;
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
                return 'bg-green-50 text-green-600 border-green-100';
            case 'claimed by owner':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'released':
                return 'bg-teal-50 text-teal-700 border-teal-200';
            case 'deceased':
                return 'bg-gray-100 text-gray-600 border-gray-200';
            case 'false alarm / dismissed':
            case 'dismissed':
                return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'rejected':
                return 'bg-red-50 text-red-600 border-red-100';
            default:
                return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const getStatusIcon = (statusId: number) => {
        if (statusId === 11 || statusId === 9 || statusId === 10) return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
        );
        if (statusId === 12) return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
        );
        if (statusId === 14) return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524L13.477 14.89zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
            </svg>
        );
        // Rejected
        return (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
        );
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
            <SubdSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* TOP NAVIGATION */}
                <SubdNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">History Reports</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">All past and closed incident reports in your subdivision</p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-8">

                        {/* Metrics Row */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                            {metrics.map((metric, i) => (
                                <div
                                    key={i}
                                    className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-all"
                                >
                                    <div className={`w-11 h-11 rounded-xl ${metric.lightColor} ${metric.textColor} flex items-center justify-center shrink-0`}>
                                        {metric.icon}
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">{metric.label}</p>
                                        <p className="text-2xl font-black text-gray-900 mt-1 leading-none">{metric.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Search & Filters + Refresh */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="relative flex-1 max-w-md">
                                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search by category, landmark or reporter..."
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-200 outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-3">
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
                                    className="w-[140px]"
                                />
                                <button
                                    onClick={() => fetchReports(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-all"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh
                                </button>
                            </div>
                        </div>

                        {/* Data Table */}
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
                                        <span className="text-xs font-mono text-gray-400">#{rep.report_id.toString().padStart(4, '0')}</span>
                                    )
                                },
                                {
                                    header: "Category",
                                    key: "category",
                                    render: (rep) => (
                                        <div className="flex items-center space-x-2">
                                            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
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
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusColor(statusMap[rep.status_id] || '')}`}>
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
                                             <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0">
                                                 {rep.reporter_photo ? (
                                                     <img src={getProfilePicture(rep.reporter_photo)} alt={rep.reporter_name || 'Reporter'} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                 ) : (
                                                     <span className="text-[10px] text-gray-500 font-bold">{(rep.reporter_name || 'U').charAt(0).toUpperCase()}</span>
                                                 )}
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
                                                navigate(`/subd/history/${rep.report_id}`);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 rounded-lg hover:bg-purple-100 transition-all uppercase tracking-widest"
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

                        {/* Info Banner */}
                        <div className="bg-purple-50/60 border border-purple-100 rounded-2xl p-5 flex items-start gap-4">
                            <div className="w-9 h-9 rounded-xl bg-purple-500 text-white flex items-center justify-center shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-purple-900">History Archive</h4>
                                <p className="text-xs text-purple-700 mt-1 leading-relaxed">
                                    This page contains all closed and past incident reports — including Resolved, Dismissed (False Alarm), Deceased, and Rejected cases.
                                    These reports are read-only and cannot be modified. Click any row to view the full report details.
                                </p>
                            </div>
                        </div>

                    </div>
                </main>
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
