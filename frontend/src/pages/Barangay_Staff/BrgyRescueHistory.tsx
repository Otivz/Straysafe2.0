import { useState, useEffect } from 'react';
import axios from 'axios';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import MapComponent from '../../components/MapComponent';
import DataTable from '../../components/DataTable';

// --- Custom Components for the Command Center Aesthetic ---

const StatCard = ({ title, value, subtitle, icon, trend }: any) => (
    <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-xl hover:shadow-[#1B4340]/5 transition-all duration-500 group">
        <div className="flex justify-between items-start mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#1B4340]/5 text-[#1B4340] flex items-center justify-center group-hover:bg-[#F97316] group-hover:text-white transition-all duration-500">
                {icon}
            </div>
            {trend && (
                <span className={`text-[10px] font-black px-2 py-1 rounded-lg ${trend.startsWith('+') ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                    {trend}
                </span>
            )}
        </div>
        <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">{title}</p>
            <h3 className="text-2xl font-extrabold text-gray-900 tracking-tight">{value}</h3>
            <p className="text-[9px] text-gray-500 font-bold mt-1 uppercase tracking-widest">{subtitle}</p>
        </div>
    </div>
);

const StatusBadge = ({ status }: { status: string }) => {
    const configs: any = {
        'Pending': { bg: 'bg-yellow-50', text: 'text-yellow-600', dot: 'bg-yellow-500' },
        'Dispatched': { bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
        'Picked Up': { bg: 'bg-purple-50', text: 'text-purple-600', dot: 'bg-purple-500' },
        'Under Observation': { bg: 'bg-orange-50', text: 'text-orange-600', dot: 'bg-orange-500' },
        'Resolved': { bg: 'bg-green-50', text: 'text-green-600', dot: 'bg-green-500' },
        'Released': { bg: 'bg-teal-50', text: 'text-teal-600', dot: 'bg-teal-500' },
        'Failed Rescue': { bg: 'bg-red-50', text: 'text-red-600', dot: 'bg-red-500' },
        'default': { bg: 'bg-gray-50', text: 'text-gray-600', dot: 'bg-gray-500' }
    };
    const config = configs[status] || configs.default;
    return (
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${config.bg} ${config.text} text-[10px] font-bold uppercase tracking-widest border border-current/10`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot} animate-pulse`}></span>
            {status}
        </span>
    );
};

const BrgyRescueHistory = () => {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRescue, setSelectedRescue] = useState<any>(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [priorityFilter, setPriorityFilter] = useState('all');

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const response = await axios.get('http://localhost:8000/rescue-requests/');
            // ONLY show reports that ARE resolved (status 11)
            const resolvedReports = (response.data || []).filter((req: any) => req.report?.status_id === 11);
            setHistory(resolvedReports);
        } catch (error) {
            console.error('Error fetching history:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredHistory = history.filter(rescue => {
        const matchesSearch = 
            (rescue.rescue_id?.toString() || '').includes(searchQuery) ||
            (rescue.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
            (rescue.report?.landmark?.toLowerCase() || '').includes(searchQuery.toLowerCase());
        
        const matchesStatus = statusFilter === 'all' || rescue.status_id.toString() === statusFilter;
        const matchesPriority = priorityFilter === 'all' || (rescue.report?.priority_level || '').toLowerCase() === priorityFilter.toLowerCase();
        
        return matchesSearch && matchesStatus && matchesPriority;
    });

    const handleViewDetails = (rescue: any) => {
        setSelectedRescue(rescue);
        setIsDrawerOpen(true);
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC] text-gray-900 overflow-hidden font-sans">
            <BrgySidebar />

            <div className="flex-1 flex flex-col h-screen relative overflow-hidden">
                <BrgyNavbar />

                <main className="flex-1 overflow-y-auto custom-scrollbar p-10 bg-gradient-to-br from-[#F8FAFC] to-[#F1F5F9]">

                    {/* Header Section */}
                    <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 mb-10">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Rescue History</h1>
                            </div>
                            <p className="text-gray-500 text-sm">
                                Strategic Archive of Resolved Field Operations & Emergency Responses
                            </p>
                        </div>

                        <div className="flex items-center gap-3 ml-4 lg:ml-0">
                            <button className="px-8 py-4 bg-white border border-gray-100 text-[#1B4340] text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M16 9l-4-4m0 0L8 5m4-4v12" /></svg>
                                Export Records
                            </button>
                            <button className="px-8 py-4 bg-[#1B4340] text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-[#1B4340]/20 hover:bg-[#235854] hover:-translate-y-0.5 transition-all flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 17v-2a4 4 0 014-4h4m-4-4l4 4-4 4" /></svg>
                                Generate Report
                            </button>
                        </div>
                    </div>

                    {/* Analytics Overview Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 mb-10">
                        <StatCard
                            title="Resolved Rescues"
                            value={history.length.toLocaleString()}
                            subtitle="Total Archived Ops"
                            trend={`+${history.length}`}
                            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        />
                        <StatCard
                            title="Avg Response Time"
                            value="18.4m"
                            subtitle="Dispatch to Arrival"
                            trend="-4.2m"
                            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                        />
                        <StatCard
                            title="High Risk Managed"
                            value="42"
                            subtitle="Critical Operations"
                            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                        />
                        <StatCard
                            title="Field Personnel"
                            value="16"
                            subtitle="Active Duty Teams"
                            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                        />
                        <StatCard
                            title="Monthly Growth"
                            value="28%"
                            subtitle="Rescue Success rate"
                            trend="+2.1%"
                            icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                        />
                    </div>

                    {/* Filter Toolbar */}
                    <div className="bg-white/70 backdrop-blur-md rounded-[2.5rem] p-8 mb-10 border border-white shadow-xl shadow-gray-200/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                            <div className="relative group">
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Search Database</label>
                                <input
                                    type="text"
                                    placeholder="Rescue ID or Title..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl py-4 pl-12 pr-6 text-sm font-bold focus:ring-2 focus:ring-[#1B4340] outline-none transition-all"
                                />
                                <svg className="w-5 h-5 absolute left-4 bottom-4 text-gray-300 group-focus-within:text-[#1B4340]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>

                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">Operational Status</label>
                                <select 
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-[#1B4340] outline-none transition-all appearance-none cursor-pointer"
                                >
                                    <option value="all">All Resolved States</option>
                                    <option value="6">Resolved</option>
                                    <option value="5">Dispatched</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Priority Classification</label>
                                <select 
                                    value={priorityFilter}
                                    onChange={(e) => setPriorityFilter(e.target.value)}
                                    className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-[#1B4340] outline-none transition-all appearance-none cursor-pointer"
                                >
                                    <option value="all">All Risk Levels</option>
                                    <option value="High">High Priority</option>
                                    <option value="Medium">Medium Priority</option>
                                    <option value="Low">Low Priority</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Assigned Personnel</label>
                                <select className="w-full bg-gray-50/50 border border-gray-100 rounded-2xl py-4 px-6 text-sm font-bold focus:ring-2 focus:ring-[#1B4340] outline-none transition-all appearance-none cursor-pointer">
                                    <option>Filter by Responder...</option>
                                    <option>Officer Juan Dela Cruz</option>
                                    <option>Officer Maria Santos</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Data Table */}
                    {/* Mirrored Data Table Section */}
                    <DataTable
                        loading={loading}
                        data={filteredHistory}
                        onRowClick={handleViewDetails}
                        emptyMessage="No resolved rescue operations in the archive."
                        loadingMessage="Syncing with Operations Center..."
                        columns={[
                            {
                                header: "Request ID",
                                key: "rescue_id",
                                render: (rescue) => (
                                    <span className="text-xs font-mono text-gray-400">#REQ-{(rescue.rescue_id || 0).toString().padStart(4, '0')}</span>
                                )
                            },
                            {
                                header: "Title",
                                key: "title",
                                render: (rescue) => (
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{rescue.title || 'Rescue Operation'}</p>
                                        <p className="text-[10px] text-gray-400 truncate max-w-[200px]">{rescue.report?.landmark}</p>
                                    </div>
                                )
                            },
                            {
                                header: "Escalated By",
                                key: "leader",
                                render: (rescue) => (
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-600">
                                            {rescue.leader_name?.charAt(0) || 'L'}
                                        </div>
                                        <span className="text-xs text-gray-700">{rescue.leader_name || 'Subd Leader'}</span>
                                    </div>
                                )
                            },
                            {
                                header: "Assigned",
                                key: "assigned",
                                render: (rescue) => (
                                    rescue.assigned_staff_name ? (
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[8px] font-bold text-blue-600 border border-blue-200">
                                                {rescue.assigned_staff_name.charAt(0)}
                                            </div>
                                            <span className="text-[10px] font-bold text-gray-900">{rescue.assigned_staff_name}</span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] font-medium text-gray-400 italic">Not Assigned</span>
                                    )
                                )
                            },
                            {
                                header: "Date",
                                key: "date",
                                render: (rescue) => (
                                    <span className="text-xs text-gray-500">
                                        {new Date(rescue.resolved_at || rescue.updated_at || Date.now()).toLocaleDateString()}
                                    </span>
                                )
                            },
                            {
                                header: "Status",
                                key: "status",
                                render: (rescue) => (
                                    <StatusBadge status={rescue.status_id === 11 ? 'Resolved' : 'Dispatched'} />
                                )
                            },
                            {
                                header: "Action",
                                key: "action",
                                className: "text-right",
                                render: (rescue) => (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleViewDetails(rescue);
                                        }}
                                        className="text-[10px] font-bold text-[#F97316] hover:underline"
                                    >
                                        View Details
                                    </button>
                                )
                            }
                        ]}
                    />

                    {/* Monthly Rescue Operations Overview Chart Placeholder */}
                    <div className="mt-10 bg-white rounded-[3rem] p-10 border border-gray-50 shadow-2xl shadow-gray-200/40">
                        <div className="flex justify-between items-center mb-10">
                            <div>
                                <h4 className="text-xl font-black text-[#1B4340] uppercase tracking-tight">Monthly Rescue Activity Flow</h4>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1 italic">Real-time performance metrics and response frequency</p>
                            </div>
                            <div className="flex gap-2">
                                <span className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest"><span className="w-2 h-2 rounded-full bg-[#1B4340]"></span> Rescues</span>
                                <span className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase tracking-widest ml-4"><span className="w-2 h-2 rounded-full bg-[#F97316]"></span> Response Time</span>
                            </div>
                        </div>
                        <div className="w-full h-80 flex items-end justify-between gap-2 px-4 border-b border-l border-gray-100 relative">
                            {[45, 62, 38, 85, 54, 72, 92, 48, 65, 80, 58, 95].map((h, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center group relative cursor-pointer">
                                    <div
                                        className="w-full max-w-[20px] bg-[#1B4340]/10 group-hover:bg-[#F97316]/20 transition-all rounded-t-lg mb-0.5"
                                        style={{ height: `${h}%` }}
                                    ></div>
                                    <div
                                        className="w-full max-w-[20px] bg-[#1B4340] group-hover:bg-[#F97316] transition-all rounded-t-lg absolute bottom-0 shadow-lg shadow-[#1B4340]/10"
                                        style={{ height: `${h * 0.7}%` }}
                                    >
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1B4340] text-white text-[9px] font-black py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                            {h}
                                        </div>
                                    </div>
                                    <span className="absolute -bottom-6 text-[8px] font-black text-gray-400 uppercase tracking-tighter">Month {i + 1}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </main>
            </div>

            {/* Details Drawer Panel */}
            {isDrawerOpen && selectedRescue && (
                <>
                    <div className="fixed inset-0 z-[100] bg-[#1B4340]/40 backdrop-blur-md animate-in fade-in duration-500" onClick={() => setIsDrawerOpen(false)}></div>
                    <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-[#F8FAFC] z-[101] shadow-[-20px_0_60px_rgba(0,0,0,0.15)] animate-in slide-in-from-right duration-500 overflow-y-auto custom-scrollbar">

                        {/* Drawer Header */}
                        <div className="sticky top-0 bg-white/80 backdrop-blur-xl z-10 px-10 py-8 border-b border-gray-100 flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <span className="px-3 py-1 bg-orange-50 text-[#F97316] text-[9px] font-black uppercase tracking-[0.2em] rounded-lg border border-orange-100">Operation Log</span>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest font-mono italic">#{selectedRescue.rescue_id}</span>
                                </div>
                                <h2 className="text-3xl font-black text-[#1B4340] tracking-tight uppercase">Rescue Operational Summary</h2>
                            </div>
                            <button
                                onClick={() => setIsDrawerOpen(false)}
                                className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center shadow-sm"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-10 space-y-10 pb-20">
                            {/* 1. Incident Information */}
                            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#1B4340]/5 rounded-bl-[100px] -mr-8 -mt-8 group-hover:bg-[#F97316]/5 transition-all duration-700"></div>
                                <h4 className="text-[11px] font-black text-[#1B4340] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <span className="w-2 h-4 bg-[#F97316] rounded-full"></span> Incident Information
                                </h4>
                                <div className="grid grid-cols-2 gap-8">
                                    {[
                                        { label: 'Report ID', value: `#${selectedRescue.report_id || 'N/A'}` },
                                        { label: 'Reporter', value: selectedRescue.report?.reporter_name || 'Verified Citizen' },
                                        { label: 'Category', value: 'Aggressive Stray' },
                                        { label: 'Priority', value: selectedRescue.report?.priority_level || 'Normal', color: '#F97316' },
                                        { label: 'Visibility', value: 'Public' },
                                        { label: 'Date', value: new Date(selectedRescue.updated_at).toLocaleDateString() }
                                    ].map((item, i) => (
                                        <div key={i}>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{item.label}</p>
                                            <p className="text-sm font-black text-gray-900" style={{ color: item.color || '#111827' }}>{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 2. Animal Information */}
                            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                                <h4 className="text-[11px] font-black text-[#1B4340] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <span className="w-2 h-4 bg-[#F97316] rounded-full"></span> Biological Analysis
                                </h4>
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="col-span-3 flex gap-2 mb-2">
                                        {['High Risk', 'Active', 'Unvaccinated'].map(tag => (
                                            <span key={tag} className="px-3 py-1 bg-red-50 text-red-600 text-[8px] font-black uppercase tracking-widest rounded-lg border border-red-100">AI: {tag}</span>
                                        ))}
                                    </div>
                                    {[
                                        { label: 'Species', value: selectedRescue.report?.animal_type || 'Canine' },
                                        { label: 'Breed', value: selectedRescue.report?.breed || 'Mixed / Unknown' },
                                        { label: 'Est. Size', value: 'Medium' },
                                        { label: 'AI Risk', value: '78.4%', color: '#DC2626' },
                                        { label: 'Assessment', value: selectedRescue.report?.condition || 'Healthy' },
                                        { label: 'Count', value: selectedRescue.report?.animal_count || 1 }
                                    ].map((item, i) => (
                                        <div key={i}>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">{item.label}</p>
                                            <p className="text-xs font-black text-gray-900" style={{ color: item.color || '#111827' }}>{item.value}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 3. Rescue Location */}
                            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm overflow-hidden">
                                <h4 className="text-[11px] font-black text-[#1B4340] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <span className="w-2 h-4 bg-[#F97316] rounded-full"></span> Deployment Location
                                </h4>
                                <div className="flex flex-col gap-6">
                                    <div className="w-full h-48 rounded-[2rem] overflow-hidden border border-gray-50 bg-[#F1F5F9]">
                                        <MapComponent
                                            center={[parseFloat(selectedRescue.report?.latitude || '14.8069'), parseFloat(selectedRescue.report?.longitude || '121.0039')]}
                                            zoom={17}
                                            markers={[{
                                                id: selectedRescue.rescue_id,
                                                lat: parseFloat(selectedRescue.report?.latitude || '14.8069'),
                                                lng: parseFloat(selectedRescue.report?.longitude || '121.0039'),
                                                title: "Incident Site",
                                                category: "Stray Animal"
                                            }]}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-8">
                                        <div>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Verified Landmark</p>
                                            <p className="text-xs font-black text-[#1B4340] leading-relaxed uppercase tracking-tight">{selectedRescue.report?.landmark}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">GPS Coordinates</p>
                                            <p className="text-xs font-black text-gray-500 font-mono italic">{selectedRescue.report?.latitude}, {selectedRescue.report?.longitude}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 4. Assigned Rescue Personnel */}
                            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm relative">
                                <h4 className="text-[11px] font-black text-[#1B4340] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <span className="w-2 h-4 bg-[#F97316] rounded-full"></span> Operational Team
                                </h4>
                                <div className="flex items-center gap-6 p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                                    <div className="w-16 h-16 rounded-[1.5rem] bg-[#1B4340] text-white flex items-center justify-center text-xl font-black shadow-lg shadow-[#1B4340]/20 border-4 border-white">
                                        {selectedRescue.assigned_staff_name?.charAt(0) || 'S'}
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Assigned Unit</p>
                                        <p className="text-lg font-black text-gray-900">{selectedRescue.assigned_staff_name || 'Specialized Unit A'}</p>
                                        <div className="flex gap-4 mt-2">
                                            <span className="text-[8px] font-black text-[#F97316] uppercase tracking-widest bg-orange-50 px-2 py-1 rounded-lg border border-orange-100">Vehicle: SV-UNIT-04</span>
                                            <span className="text-[8px] font-black text-[#1B4340] uppercase tracking-widest bg-teal-50 px-2 py-1 rounded-lg border border-teal-100">Duty: Field Response</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 5. Rescue Timeline */}
                            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                                <h4 className="text-[11px] font-black text-[#1B4340] uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                                    <span className="w-2 h-4 bg-[#F97316] rounded-full"></span> Response Timeline
                                </h4>
                                <div className="relative pl-8 space-y-8 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
                                    {[
                                        { label: 'Incident Reported', time: '08:42 AM', status: 'done' },
                                        { label: 'Verification Complete', time: '08:50 AM', status: 'done' },
                                        { label: 'Team Dispatched', time: '08:55 AM', status: 'done' },
                                        { label: 'On-Site Arrival', time: '09:08 AM', status: 'done' },
                                        { label: 'Animal Secured', time: '09:22 AM', status: 'done' },
                                        { label: 'Final Resolution', time: '09:45 AM', status: 'done' }
                                    ].map((t, idx) => (
                                        <div key={idx} className="relative group">
                                            <div className={`absolute -left-8 top-1 w-6 h-6 rounded-full border-4 border-white shadow-sm flex items-center justify-center z-10 transition-all ${t.status === 'done' ? 'bg-green-500' : 'bg-gray-200 group-hover:bg-[#F97316]'}`}>
                                                {t.status === 'done' && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                            <div className="flex justify-between items-center bg-gray-50/50 p-4 rounded-2xl border border-gray-50 group-hover:border-white group-hover:bg-white group-hover:shadow-md transition-all">
                                                <p className="text-xs font-black text-[#1B4340] uppercase tracking-tight">{t.label}</p>
                                                <p className="text-[10px] font-mono text-gray-400 italic">{t.time}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 7. Outcome Summary */}
                            <div className="bg-[#1B4340] rounded-[2.5rem] p-10 text-white shadow-2xl shadow-[#1B4340]/40 relative overflow-hidden group">
                                <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-all duration-1000"></div>
                                <h4 className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                                    <span className="w-2 h-4 bg-[#F97316] rounded-full"></span> Outcome Analysis
                                </h4>
                                <div className="space-y-8 relative z-10">
                                    <div className="flex justify-between items-center p-6 bg-white/10 rounded-[2rem] border border-white/10 backdrop-blur-md">
                                        <div>
                                            <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-1">Final Result</p>
                                            <p className="text-2xl font-black italic uppercase tracking-tight text-[#F97316]">Successful Capture</p>
                                        </div>
                                        <div className="w-16 h-16 rounded-full bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/20">
                                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-6">
                                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                            <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Animal Status</p>
                                            <p className="text-xs font-black">Transferred to Shelter</p>
                                        </div>
                                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                            <p className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-1">Operation Rating</p>
                                            <div className="flex gap-1 mt-1 text-[#F97316]">
                                                {[1, 2, 3, 4, 5].map(s => <svg key={s} className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* 8. Evidence Gallery */}
                            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm">
                                <h4 className="text-[11px] font-black text-[#1B4340] uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
                                    <span className="w-2 h-4 bg-[#F97316] rounded-full"></span> Evidence Documentation
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    {[1, 2, 3, 4].map((n) => (
                                        <div key={n} className="aspect-square bg-gray-50 rounded-3xl border border-gray-100 overflow-hidden group cursor-pointer relative">
                                            <div className="absolute inset-0 bg-[#1B4340]/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-black uppercase text-[10px] tracking-widest z-10 backdrop-blur-sm">View High Res</div>
                                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-200">
                                                <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                <span className="text-[8px] font-black uppercase tracking-widest">Phase {n} Media</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 9. Operation Notes */}
                            <div className="bg-[#F1F5F9] rounded-[2.5rem] p-10 border border-gray-100">
                                <h4 className="text-[11px] font-black text-[#1B4340] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <span className="w-2 h-4 bg-[#F97316] rounded-full"></span> Command Remarks
                                </h4>
                                <div className="bg-white rounded-[2rem] p-8 shadow-inner shadow-gray-100 min-h-[150px] relative">
                                    <svg className="w-12 h-12 text-gray-50 absolute -top-4 -left-4" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21L14.017 18C14.017 16.8954 14.9124 16 16.017 16H19.017C19.5693 16 20.017 15.5523 20.017 15V9C20.017 8.44772 19.5693 8 19.017 8H15.017C14.4647 8 14.017 8.44772 14.017 9V15M3.017 21L3.017 18C3.017 16.8954 3.91243 16 5.017 16H8.017C8.56928 16 9.017 15.5523 9.017 15V9C9.017 8.44772 8.56928 8 8.017 8H4.017C3.46472 8 3.017 8.44772 3.017 9V15" /></svg>
                                    <p className="text-sm font-medium text-gray-600 leading-relaxed italic relative z-10">
                                        "The operation was executed following standard containment protocols. The stray animal (canine, medium size) showed initial signs of defensive aggression but was successfully secured using humane capture equipment. Post-rescue assessment revealed minor superficial abrasions, likely sustained prior to intervention. Transport to the San Vicente Animal Care Center was completed at 10:15 AM without incident. Case successfully closed."
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Drawer Footer */}
                        <div className="sticky bottom-0 bg-white p-10 border-t border-gray-100 flex gap-4">
                            <button className="flex-1 py-4 bg-[#1B4340] text-white text-[10px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-[#1B4340]/20 hover:bg-[#235854] transition-all">
                                Download Comprehensive Report
                            </button>
                            <button className="px-8 py-4 bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-gray-100 transition-all border border-gray-100">
                                Internal Audit Log
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default BrgyRescueHistory;
