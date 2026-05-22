import { useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import SummaryCard from '../../components/Cards/SummaryCard';

interface AuditLog {
    id: number;
    user: string;
    action: string;
    table: string;
    description: string;
    timestamp: string;
    ip: string;
    type: 'security' | 'operation' | 'system';
    oldValues?: any;
    newValues?: any;
}

import DataTable from '../../components/DataTable';

const AdminLogs = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    // Mock Audit Logs based on updated DB schema
    const logs: AuditLog[] = [
        { 
            id: 1, 
            user: 'Admin Sarah', 
            action: 'DELETE_USER', 
            table: 'users', 
            description: 'Deleted inactive user account: user_452', 
            timestamp: '2024-05-04 14:20:12', 
            ip: '192.168.1.45', 
            type: 'security',
            oldValues: { id: 452, name: 'John Doe', status: 'Inactive' },
            newValues: null
        },
        { 
            id: 2, 
            user: 'System', 
            action: 'AUTO_ARCHIVE', 
            table: 'reports', 
            description: 'Archived resolved reports older than 30 days', 
            timestamp: '2024-05-04 12:00:00', 
            ip: '127.0.0.1', 
            type: 'system' 
        },
        { 
            id: 3, 
            user: 'Staff Mike', 
            action: 'UPDATE_STATUS', 
            table: 'reports', 
            description: 'Changed status to "Rescued" for Report #882', 
            timestamp: '2024-05-04 11:45:30', 
            ip: '110.54.128.22', 
            type: 'operation',
            oldValues: { status: 'In Action' },
            newValues: { status: 'Rescued' }
        },
        { 
            id: 4, 
            user: 'Leader Anna', 
            action: 'VERIFY_REPORT', 
            table: 'report_verifications', 
            description: 'Verified stray pack sighting at Zone 4', 
            timestamp: '2024-05-04 09:12:05', 
            ip: '122.2.145.10', 
            type: 'operation' 
        },
        { 
            id: 5, 
            user: 'Unknown', 
            action: 'FAILED_LOGIN', 
            table: 'auth', 
            description: 'Multiple failed login attempts detected', 
            timestamp: '2024-05-04 08:30:15', 
            ip: '203.111.45.2', 
            type: 'security' 
        }
    ];

    const filteredLogs = logs.filter(log => 
        log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

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
                <AdminNavbar />

                <main className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-gray-200">
                    {/* Header Section */}
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Audit Surveillance</h1>
                            <p className="text-gray-500 text-sm font-medium">Real-time system activity and security tracking.</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="relative">
                                <input 
                                    type="text" 
                                    placeholder="Search logs..." 
                                    className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#1B4340] focus:border-transparent w-64 shadow-sm transition-all"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <svg className="w-4 h-4 absolute left-3 top-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <button className="bg-white border border-gray-200 p-2.5 rounded-xl hover:bg-gray-50 transition-all shadow-sm">
                                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </button>
                        </div>
                    </div>

                    {/* Stats Overview */}
                    <div className="grid grid-cols-4 gap-6 mb-8">
                        <SummaryCard label="Total Actions" value="1,284" variant="light" color="#1B4340" />
                        <SummaryCard label="Security Alerts" value="12" variant="light" color="#EF4444" accentColor="#EF4444" />
                        <SummaryCard label="System Tasks" value="85" variant="light" color="#3B82F6" />
                        <SummaryCard label="Most Active" value="Sarah" subValue="Admin" variant="dark" color="#F97316" />
                    </div>

                    {/* Logs Table Section */}
                    <div className="bg-white rounded-[2rem] shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                        <DataTable
                            loading={false}
                            data={filteredLogs}
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
                                                <span className="text-[9px] font-bold text-gray-400">{log.ip}</span>
                                            </div>
                                        </div>
                                    )
                                },
                                {
                                    header: "Action",
                                    key: "action",
                                    render: (log) => (
                                        <span className={`px-2.5 py-1 rounded-md text-[9px] font-black border uppercase ${getActionBadge(log.type)}`}>
                                            {log.action.replace('_', ' ')}
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
                    </div>

                    {/* Inspection Modal (Diff Viewer) */}
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
                                        <p className="text-xs text-gray-400 font-medium mt-1">Transaction ID: #LOG-{selectedLog.id}88{selectedLog.id}</p>
                                    </div>
                                    <button onClick={() => setSelectedLog(null)} className="p-2 rounded-xl bg-gray-50 text-gray-400 hover:bg-gray-100 transition-all">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                                <div className="p-8 space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 p-4 rounded-2xl">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Old State</span>
                                            <pre className="text-[10px] font-mono text-gray-500 bg-white p-3 border border-gray-100 rounded-xl">
                                                {JSON.stringify(selectedLog.oldValues || {}, null, 2)}
                                            </pre>
                                        </div>
                                        <div className="bg-[#1B4340]/5 p-4 rounded-2xl">
                                            <span className="text-[10px] font-black text-teal-600 uppercase tracking-widest block mb-2">New State</span>
                                            <pre className="text-[10px] font-mono text-teal-700 bg-white p-3 border border-teal-100/20 rounded-xl">
                                                {JSON.stringify(selectedLog.newValues || {}, null, 2)}
                                            </pre>
                                        </div>
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
