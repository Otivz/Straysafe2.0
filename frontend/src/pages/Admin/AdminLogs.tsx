import { useState, useEffect } from 'react';
import axios from 'axios';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import SummaryCard from '../../components/Cards/SummaryCard';
import DataTable from '../../components/DataTable';

const API_URL = 'http://localhost:8000/audit-logs/';

interface AuditLog {
    id: number;
    user: string;
    action: string;
    table: string;
    description: string;
    timestamp: string;
    ip: string;
    type: 'security' | 'operation' | 'system';
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
}

const AdminLogs = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
    const [typeFilter, setTypeFilter] = useState<'all' | 'security' | 'operation' | 'system'>('all');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'yesterday' | 'this_week'>('all');
    const [userFilter, setUserFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState(1);

    // Fetch real audit logs from the backend
    const fetchLogs = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get<AuditLog[]>(API_URL);
            setLogs(response.data);
        } catch (err: unknown) {
            console.error('Failed to fetch audit logs:', err);
            setError('Failed to load audit logs. Please ensure the backend server is running.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    // Date-range helper
    const matchesDate = (timestamp: string): boolean => {
        if (dateFilter === 'all') return true;
        const logDate = new Date(timestamp.replace(' ', 'T'));
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const startOfWeek = new Date(startOfToday);
        startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

        if (dateFilter === 'today') return logDate >= startOfToday;
        if (dateFilter === 'yesterday') return logDate >= startOfYesterday && logDate < startOfToday;
        if (dateFilter === 'this_week') return logDate >= startOfWeek;
        return true;
    };

    // Build unique sorted user list for the user dropdown
    const uniqueUsers = Array.from(
        new Set(logs.map(l => l.user).filter(u => u !== 'Unknown'))
    ).sort();

    // Filter Logic — search + type + date + user
    const filteredLogs = logs.filter(log => {
        const matchesSearch =
            log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || log.type === typeFilter;
        const matchesUser = userFilter === 'all' || log.user === userFilter;
        return matchesSearch && matchesType && matchesDate(log.timestamp) && matchesUser;
    });

    // Reset pagination to first page when any filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, typeFilter, dateFilter, userFilter]);

    // Pagination calculations
    const ITEMS_PER_PAGE = 10;
    const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);
    const paginatedLogs = filteredLogs.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Dynamic metrics calculations
    const totalActions = logs.length;
    const securityAlerts = logs.filter(l => l.type === 'security').length;
    const systemTasks = logs.filter(l => l.type === 'system').length;

    // Calculate most active user dynamically
    const userCounts = logs.reduce((acc, log) => {
        if (log.user !== 'System' && log.user !== 'Unknown') {
            acc[log.user] = (acc[log.user] || 0) + 1;
        }
        return acc;
    }, {} as Record<string, number>);

    let mostActiveUser = 'N/A';
    let maxCount = 0;
    Object.entries(userCounts).forEach(([user, count]) => {
        if (count > maxCount) {
            mostActiveUser = user;
            maxCount = count;
        }
    });

    // Export Handler
    const handleExportCSV = () => {
        if (filteredLogs.length === 0) {
            alert('No logs to export.');
            return;
        }
        const headers = ['ID', 'User', 'Action', 'Table', 'Description', 'Timestamp', 'IP Address', 'Type'];
        const rows = filteredLogs.map(log => [
            log.id,
            `"${log.user.replace(/"/g, '""')}"`,
            log.action,
            log.table,
            `"${log.description.replace(/"/g, '""')}"`,
            log.timestamp,
            log.ip,
            log.type
        ]);
        const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getActionBadge = (type: string) => {
        switch (type) {
            case 'security': return 'bg-red-500/10 text-red-500 border-red-500/20';
            case 'system': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
            default: return 'bg-teal-500/10 text-teal-500 border-teal-500/20';
        }
    };

    return (
        <div className="flex h-screen bg-[#F8F9FA] text-slate-800 font-sans">
            <AdminSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">System Audit Logs</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Track system activity, user logons, and operations</p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-gray-200">

                    {/* Error Banner */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
                            <svg className="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-xs text-red-700 font-medium">{error}</p>
                            <button onClick={fetchLogs} className="ml-auto text-xs font-black text-red-600 underline hover:no-underline">Retry</button>
                        </div>
                    )}

                    {/* Toolbar */}
                    <div className="flex flex-col gap-3 mb-8">
                        {/* Row 1 — Search + Action buttons */}
                        <div className="flex justify-between items-center">
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search logs..."
                                    className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1B4340] focus:border-transparent w-72 shadow-sm transition-all"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <svg className="w-4 h-4 absolute left-3 top-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={fetchLogs}
                                    className="bg-white border border-gray-200 p-2.5 rounded-xl hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
                                    title="Refresh Logs"
                                >
                                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                </button>
                                <button
                                    onClick={handleExportCSV}
                                    className="bg-white border border-gray-200 p-2.5 rounded-xl hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
                                    title="Export CSV"
                                >
                                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Row 2 — Date chips + Type + User dropdowns */}
                        <div className="flex items-center gap-3 flex-wrap">
                            {/* Date filter pill buttons */}
                            {([
                                { key: 'all',       label: 'All Time' },
                                { key: 'today',     label: 'Today' },
                                { key: 'yesterday', label: 'Yesterday' },
                                { key: 'this_week', label: 'This Week' },
                            ] as const).map(({ key, label }) => (
                                <button
                                    key={key}
                                    onClick={() => setDateFilter(key)}
                                    className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                                        dateFilter === key
                                            ? 'bg-[#1B4340] text-white border-[#1B4340] shadow-md shadow-teal-900/20'
                                            : 'bg-white text-gray-500 border-gray-200 hover:border-[#1B4340]/40 hover:text-[#1B4340]'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}

                            {/* Divider */}
                            <div className="h-5 w-px bg-gray-200" />

                            {/* Type filter */}
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                                className="h-9 bg-white border border-gray-200 rounded-xl px-3 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B4340] cursor-pointer shadow-sm transition-all"
                            >
                                <option value="all">All Types</option>
                                <option value="security">Security</option>
                                <option value="operation">Operation</option>
                                <option value="system">System</option>
                            </select>

                            {/* User filter */}
                            <select
                                value={userFilter}
                                onChange={(e) => setUserFilter(e.target.value)}
                                className="h-9 bg-white border border-gray-200 rounded-xl px-3 text-xs font-bold text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B4340] cursor-pointer shadow-sm transition-all max-w-[180px]"
                            >
                                <option value="all">All Users</option>
                                {uniqueUsers.map(u => (
                                    <option key={u} value={u}>{u}</option>
                                ))}
                            </select>

                            {/* Active filter count badge */}
                            {(dateFilter !== 'all' || typeFilter !== 'all' || userFilter !== 'all' || searchQuery) && (
                                <button
                                    onClick={() => { setDateFilter('all'); setTypeFilter('all'); setUserFilter('all'); setSearchQuery(''); }}
                                    className="ml-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100 transition-all"
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    Clear Filters
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Stats Overview */}
                    <div className="grid grid-cols-4 gap-6 mb-8">
                        <SummaryCard label="Total Actions" value={totalActions.toString()} variant="light" color="#1B4340" />
                        <SummaryCard label="Security Alerts" value={securityAlerts.toString()} variant="light" color="#EF4444" accentColor="#EF4444" />
                        <SummaryCard label="System Tasks" value={systemTasks.toString()} variant="light" color="#3B82F6" />
                        <SummaryCard label="Most Active" value={mostActiveUser} subValue="Admin" variant="dark" color="#F97316" />
                    </div>

                    {/* Logs Table Section */}
                    <div className="bg-white rounded-[2rem] shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                        <DataTable
                            loading={loading}
                            data={paginatedLogs}
                            onRowClick={(log) => setSelectedLog(log)}
                            emptyMessage="No audit logs found."
                            columns={[
                                {
                                    header: "Timestamp",
                                    key: "timestamp",
                                    render: (log) => (
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-700">{log.timestamp.split(' ')[1]}</span>
                                            <span className="text-[10px] font-medium text-gray-400 uppercase">{log.timestamp.split(' ')[0]}</span>
                                        </div>
                                    )
                                },
                                {
                                    header: "User / Actor",
                                    key: "user",
                                    render: (log) => (
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-[#1B4340]/5 flex items-center justify-center text-[#1B4340] font-black text-[10px]">
                                                {log.user.charAt(0)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-xs font-black text-gray-900">{log.user}</span>
                                                <span className="text-[9px] font-bold text-gray-400">{log.ip || '—'}</span>
                                            </div>
                                        </div>
                                    )
                                },
                                {
                                    header: "Action",
                                    key: "action",
                                    render: (log) => (
                                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black border uppercase ${getActionBadge(log.type)}`}>
                                            {log.action.replace(/_/g, ' ')}
                                        </span>
                                    )
                                },
                                {
                                    header: "Details",
                                    key: "details",
                                    render: (log) => (
                                        <p className="text-xs text-gray-600 font-medium max-w-md truncate">{log.description}</p>
                                    )
                                },
                                {
                                    header: "Reference",
                                    key: "reference",
                                    className: "text-right",
                                    render: (log) => (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedLog(log);
                                            }}
                                            className="px-4 py-1.5 rounded-lg border border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:bg-[#1B4340] hover:border-[#1B4340] hover:text-white transition-all shadow-sm"
                                        >
                                            View
                                        </button>
                                    )
                                }
                            ]}
                        />

                        {/* Pagination Controls */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-8 py-4 bg-gray-50 border-t border-gray-100 flex-wrap gap-4">
                                <span className="text-[10px] text-gray-500 font-black uppercase tracking-wider">
                                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredLogs.length)} of {filteredLogs.length} logs
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                            currentPage === 1
                                                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-[#1B4340] hover:text-[#1B4340] cursor-pointer'
                                        }`}
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                                        Prev
                                    </button>
                                    
                                    <div className="flex items-center gap-1">
                                        {Array.from({ length: totalPages }, (_, idx) => {
                                            const pageNum = idx + 1;
                                            const isFirst = pageNum === 1;
                                            const isLast = pageNum === totalPages;
                                            const isNearCurrent = Math.abs(pageNum - currentPage) <= 1;

                                            if (isFirst || isLast || isNearCurrent) {
                                                return (
                                                    <button
                                                        key={pageNum}
                                                        onClick={() => setCurrentPage(pageNum)}
                                                        className={`w-8 h-8 rounded-lg text-xs font-black transition-all cursor-pointer ${
                                                            currentPage === pageNum
                                                                ? 'bg-[#1B4340] text-white shadow-md shadow-teal-900/10'
                                                                : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1B4340] hover:text-[#1B4340]'
                                                        }`}
                                                    >
                                                        {pageNum}
                                                    </button>
                                                );
                                            }

                                            if (pageNum === 2 && currentPage > 3) {
                                                return <span key={pageNum} className="px-1 text-gray-400 text-xs font-black">...</span>;
                                            }
                                            if (pageNum === totalPages - 1 && currentPage < totalPages - 2) {
                                                return <span key={pageNum} className="px-1 text-gray-400 text-xs font-black">...</span>;
                                            }

                                            return null;
                                        })}
                                    </div>

                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                            currentPage === totalPages
                                                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                                                : 'bg-white border-gray-200 text-gray-600 hover:border-[#1B4340] hover:text-[#1B4340] cursor-pointer'
                                        }`}
                                    >
                                        Next
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Inspection Modal */}
                    {selectedLog && (
                        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
                            <div className="absolute inset-0 bg-[#1B4340]/40 backdrop-blur-md" onClick={() => setSelectedLog(null)}></div>
                            <div className="relative bg-white w-full max-w-2xl rounded-[2.5rem] shadow-3xl overflow-hidden border border-white/20 animate-in zoom-in-95 duration-200">
                                <div className="p-8 border-b border-gray-50 flex justify-between items-start">
                                    <div>
                                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black border uppercase mb-2 inline-block ${getActionBadge(selectedLog.type)}`}>
                                            {selectedLog.action}
                                        </span>
                                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Audit Inspection</h2>
                                        <p className="text-xs text-gray-400 font-medium mt-1">Log ID: #LOG-{selectedLog.id}</p>
                                    </div>
                                    <button onClick={() => setSelectedLog(null)} className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-gray-100 transition-all">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                {/* Details Row */}
                                <div className="px-8 pt-6 pb-2 grid grid-cols-2 gap-4 text-xs">
                                    <div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Actor</span>
                                        <span className="font-bold text-gray-800">{selectedLog.user}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Table</span>
                                        <span className="font-bold text-gray-800">{selectedLog.table || '—'}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Timestamp</span>
                                        <span className="font-bold text-gray-800">{selectedLog.timestamp}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">IP Address</span>
                                        <span className="font-bold text-gray-800">{selectedLog.ip || '—'}</span>
                                    </div>
                                </div>

                                <div className="p-8 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 p-4 rounded-2xl">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Old State</span>
                                            <pre className="text-[10px] font-mono text-gray-500 bg-white p-3 border border-gray-100 rounded-xl overflow-auto max-h-32">
                                                {JSON.stringify(selectedLog.oldValues || {}, null, 2)}
                                            </pre>
                                        </div>
                                        <div className="bg-[#1B4340]/5 p-4 rounded-2xl">
                                            <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest block mb-2">New State</span>
                                            <pre className="text-[10px] font-mono text-teal-700 bg-white p-3 border border-teal-100/20 rounded-xl overflow-auto max-h-32">
                                                {JSON.stringify(selectedLog.newValues || {}, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Description</span>
                                        <p className="text-xs text-gray-700 font-medium leading-relaxed">{selectedLog.description}</p>
                                    </div>
                                    <div className="p-4 bg-orange-50 border border-orange-100 rounded-2xl">
                                        <div className="flex gap-3">
                                            <svg className="w-5 h-5 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            <p className="text-[11px] text-orange-800 font-medium leading-relaxed">
                                                This record serves as an immutable audit trail. Any changes to the core system are logged with full metadata for security compliance.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="px-8 py-6 bg-gray-50/50 border-t border-gray-50 flex justify-end">
                                    <button
                                        onClick={() => setSelectedLog(null)}
                                        className="px-6 py-2 bg-[#1B4340] text-white text-xs font-black rounded-xl hover:shadow-lg hover:shadow-teal-900/20 transition-all"
                                    >
                                        Close Inspection
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};

export default AdminLogs;
