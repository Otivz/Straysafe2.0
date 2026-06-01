import { useState, useEffect } from 'react';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import DataTable from '../../components/DataTable';
import axios from 'axios';

interface EscalatedMission {
    mission_id: string;
    report_id: number;
    title: string;
    description: string;
    escalated_date: string;
    barangay_status: 'Pending' | 'In Progress' | 'Resolved' | 'Rejected';
    reporter: string;
    landmark: string;
}

const EscelatedMissions = () => {
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('All');
    const [missions, setMissions] = useState<EscalatedMission[]>([]);
    const [selectedMission, setSelectedMission] = useState<EscalatedMission | null>(null);

    // Mock Data for UI demonstration
    const mockMissions: EscalatedMission[] = [
        {
            mission_id: "MSN-2024-001",
            report_id: 1042,
            title: "Aggressive Stray near Park",
            description: "Requesting immediate rescue for a large aggressive dog near the central playground.",
            escalated_date: "2024-05-12 10:30 AM",
            barangay_status: "In Progress",
            reporter: "John Doe",
            landmark: "Central Park Playground"
        },
        {
            mission_id: "MSN-2024-002",
            report_id: 1039,
            title: "Injured Cat Rescue",
            description: "Calico cat with injured leg found near block 5 entrance.",
            escalated_date: "2024-05-11 02:15 PM",
            barangay_status: "Pending",
            reporter: "Jane Smith",
            landmark: "Block 5 Main Gate"
        },
        {
            mission_id: "MSN-2024-003",
            report_id: 1025,
            title: "Roaming Pack Alert",
            description: "Pack of 5-6 dogs roaming near the subdivision perimeter fence.",
            escalated_date: "2024-05-10 08:00 AM",
            barangay_status: "Resolved",
            reporter: "Mike Ross",
            landmark: "North Perimeter Wall"
        }
    ];

    const fetchMissions = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const response = await axios.get('http://localhost:8000/rescue-requests/');
            if (response.data && response.data.length > 0) {
                const mapped: EscalatedMission[] = response.data.map((m: any) => {
                    let friendlyStatus: 'Pending' | 'In Progress' | 'Resolved' | 'Rejected' = 'Pending';
                    const sid = m.status_id;
                    if (sid === 3) friendlyStatus = 'Rejected';
                    else if (sid === 4 || sid === 5) friendlyStatus = 'In Progress';
                    else if (sid === 6) friendlyStatus = 'Resolved';

                    const escDate = m.created_at ? new Date(m.created_at).toLocaleString('en-US', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    }) : 'N/A';

                    return {
                        mission_id: `MSN-2026-${m.rescue_id.toString().padStart(3, '0')}`,
                        report_id: m.report_id,
                        title: m.title || `Rescue Request #${m.rescue_id}`,
                        description: m.description || m.notes || 'No description provided.',
                        escalated_date: escDate,
                        barangay_status: friendlyStatus,
                        reporter: m.report?.reporter_name || m.leader_name || 'Subdivision Leader',
                        landmark: m.report?.landmark || 'Subdivision Boundary',
                        raw_data: m
                    };
                });
                setMissions(mapped);
            } else {
                setMissions(mockMissions);
            }
        } catch (error) {
            console.error('Error fetching escalated missions:', error);
            setMissions(mockMissions);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        fetchMissions(true);
        const interval = setInterval(() => fetchMissions(false), 5000);
        return () => clearInterval(interval);
    }, []);

    const filteredMissions = missions.filter(m => {
        const matchesSearch = searchQuery === '' ||
            m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.mission_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.reporter.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = selectedStatus === 'All' || m.barangay_status === selectedStatus;
        return matchesSearch && matchesStatus;
    });

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Pending': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'In Progress': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'Resolved': return 'bg-green-50 text-green-600 border-green-100';
            case 'Rejected': return 'bg-red-50 text-red-600 border-red-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const handleViewTracker = (mission: EscalatedMission) => {
        setSelectedMission(mission);
    };

    interface TimelineStep {
        label: string;
        status: 'Pending' | 'In Progress' | 'Resolved' | 'Not Started';
        timestamp: string;
        note?: string;
    }

    const getTimelineData = (mission: EscalatedMission) => {
        const raw = (mission as any).raw_data;
        if (!raw) {
            const steps: TimelineStep[] = [];
            let assignedTeam = 'N/A';

            steps.push({
                label: 'Report Received',
                status: 'Resolved',
                timestamp: '2024-05-10 08:30 AM',
                note: `Initial report registered successfully by ${mission.reporter}.`
            });

            if (mission.barangay_status === 'Pending') {
                steps.push({
                    label: 'Endorsed to Barangay',
                    status: 'Pending',
                    timestamp: mission.escalated_date,
                    note: 'Awaiting barangay acknowledgment and team assignment.'
                });
                steps.push({ label: 'Rescue Team Assigned', status: 'Not Started', timestamp: '-' });
                steps.push({ label: 'Rescue In Progress', status: 'Not Started', timestamp: '-' });
                steps.push({ label: 'Mission Resolved', status: 'Not Started', timestamp: '-' });
            } else if (mission.barangay_status === 'In Progress') {
                assignedTeam = 'Alpha Rescue Squad';
                steps.push({
                    label: 'Endorsed to Barangay',
                    status: 'Resolved',
                    timestamp: mission.escalated_date,
                    note: 'Endorsed to Barangay Operations Hub.'
                });
                steps.push({
                    label: 'Rescue Team Assigned',
                    status: 'Resolved',
                    timestamp: '2024-05-12 11:00 AM',
                    note: 'Dispatched Alpha Rescue Squad.'
                });
                steps.push({
                    label: 'Rescue In Progress',
                    status: 'In Progress',
                    timestamp: '2024-05-12 11:15 AM',
                    note: `Team has arrived at ${mission.landmark} and is conducting operations.`
                });
                steps.push({ label: 'Mission Resolved', status: 'Not Started', timestamp: '-' });
            } else if (mission.barangay_status === 'Resolved') {
                assignedTeam = 'Bravo Rescue Team';
                steps.push({
                    label: 'Endorsed to Barangay',
                    status: 'Resolved',
                    timestamp: mission.escalated_date,
                    note: 'Endorsed to Barangay Operations Hub.'
                });
                steps.push({
                    label: 'Rescue Team Assigned',
                    status: 'Resolved',
                    timestamp: '2024-05-10 09:00 AM',
                    note: 'Dispatched Bravo Rescue Team.'
                });
                steps.push({
                    label: 'Rescue In Progress',
                    status: 'Resolved',
                    timestamp: '2024-05-10 09:30 AM',
                    note: `Team conducted rescue operation near ${mission.landmark}.`
                });
                steps.push({
                    label: 'Mission Resolved',
                    status: 'Resolved',
                    timestamp: '2024-05-10 10:15 AM',
                    note: 'Mission resolved successfully. Animal relocated to safety.'
                });
            } else if (mission.barangay_status === 'Rejected') {
                steps.push({
                    label: 'Endorsed to Barangay',
                    status: 'Pending',
                    timestamp: mission.escalated_date,
                    note: 'Endorsement rejected. Review required.'
                });
                steps.push({ label: 'Rescue Team Assigned', status: 'Not Started', timestamp: '-' });
                steps.push({ label: 'Rescue In Progress', status: 'Not Started', timestamp: '-' });
                steps.push({ label: 'Mission Resolved', status: 'Not Started', timestamp: '-' });
            }

            return { steps, assignedTeam };
        }

        const steps: TimelineStep[] = [];
        const assignedTeam = raw.assigned_staff_name || 'Awaiting Dispatch';

        steps.push({
            label: 'Report Received',
            status: 'Resolved',
            timestamp: raw.report?.created_at ? new Date(raw.report.created_at).toLocaleString() : 'N/A',
            note: `Initial report registered successfully by ${mission.reporter}.`
        });

        steps.push({
            label: 'Endorsed to Barangay',
            status: 'Resolved',
            timestamp: mission.escalated_date,
            note: 'Official subdivision endorsement sent to Barangay.'
        });

        const currentStatus = raw.report?.status_id || raw.report?.current_status_id || raw.status_id || 4;
        const hasAssignment = !!raw.assigned_staff_name;
        const isResolved = currentStatus === 11 || currentStatus === 6 || raw.status_id === 6 || mission.barangay_status?.toLowerCase() === 'resolved';
        const isInProgress = currentStatus === 5 || raw.status_id === 5 || raw.status_id === 4 || mission.barangay_status?.toLowerCase() === 'in progress';
        const isTeamAssigned = hasAssignment || isResolved || isInProgress || currentStatus === 13 || (raw.assignments && raw.assignments.length > 0);

        steps.push({
            label: 'Rescue Team Assigned',
            status: isTeamAssigned ? 'Resolved' : (currentStatus === 4 ? 'Pending' : 'Not Started'),
            timestamp: raw.assignments && raw.assignments.length > 0 ? new Date(raw.assignments[0].assigned_at).toLocaleString() : '-',
            note: hasAssignment ? `Dispatched ${raw.assigned_staff_name}.` : (isResolved ? 'Rescue team dispatched and operation completed.' : 'Awaiting Barangay staff assignment.')
        });

        steps.push({
            label: 'Rescue In Progress',
            status: isResolved ? 'Resolved' : (isInProgress ? 'In Progress' : 'Not Started'),
            timestamp: '-',
            note: isInProgress ? `Barangay rescue squad dispatched and on-site at ${mission.landmark}.` : (isResolved ? 'Dispatched and operations completed.' : '-')
        });

        steps.push({
            label: 'Mission Resolved',
            status: isResolved ? 'Resolved' : 'Not Started',
            timestamp: '-',
            note: isResolved ? 'Incident resolved successfully. Relocated to safety.' : '-'
        });

        return { steps, assignedTeam };
    };

    const totalEscalated = missions.length;
    const pendingAction = missions.filter(m => m.barangay_status === 'Pending').length;
    const inProgress = missions.filter(m => m.barangay_status === 'In Progress').length;
    const resolved = missions.filter(m => m.barangay_status === 'Resolved').length;

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none">Escalated Missions</h1>
                            <p className="text-[11px] text-gray-400 font-semibold mt-1.5 leading-none">Track reports forwarded to Barangay operations for immediate rescue</p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">

                        {/* Stats Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            {[
                                { label: 'Total Escalated', value: totalEscalated.toString(), color: 'bg-orange-500' },
                                { label: 'Pending Action', value: pendingAction.toString(), color: 'bg-amber-500' },
                                { label: 'In Progress', value: inProgress.toString(), color: 'bg-blue-500' },
                                { label: 'Resolved', value: resolved.toString(), color: 'bg-green-500' },
                            ].map((stat, i) => (
                                <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`w-2 h-2 rounded-full ${stat.color}`}></div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</span>
                                    </div>
                                    <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Main Table Section */}
                        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
                            {/* Toolbar: Search + Status Filter */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 border-b border-gray-100">
                                {/* Search */}
                                <div className="relative flex-1 min-w-[180px] max-w-sm">
                                    <svg className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Quick find by title, mission ID, or reporter..."
                                        className="w-full pl-8 pr-3 py-2 text-xs font-medium bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 placeholder-gray-400 transition-colors"
                                    />
                                </div>

                                {/* Status dropdown */}
                                <div className="relative">
                                    <select
                                        value={selectedStatus}
                                        onChange={(e) => setSelectedStatus(e.target.value)}
                                        className="appearance-none pl-3 pr-7 py-2 text-xs font-semibold bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316]/40 text-gray-700 cursor-pointer transition-colors"
                                    >
                                        <option value="All">All Status</option>
                                        <option value="Pending">Pending</option>
                                        <option value="In Progress">In Progress</option>
                                        <option value="Resolved">Resolved</option>
                                        <option value="Rejected">Rejected</option>
                                    </select>
                                    <svg className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                        <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>

                                {/* Results count */}
                                <span className="text-xs text-gray-400 font-medium ml-auto shrink-0">
                                    {filteredMissions.length} of {missions.length} missions
                                </span>
                            </div>

                            <DataTable
                                loading={loading}
                                data={filteredMissions}
                                emptyMessage="No escalated missions found."
                                loadingMessage="Fetching mission status..."
                                columns={[
                                    {
                                        header: "Mission ID",
                                        key: "mission_id",
                                        render: (m) => (
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-900">{m.mission_id}</span>
                                                <span className="text-[10px] font-mono text-gray-400">Report #{m.report_id}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Mission Title",
                                        key: "title",
                                        render: (m) => (
                                            <div className="max-w-[200px]">
                                                <span className="text-sm font-semibold text-gray-800 truncate block">{m.title}</span>
                                                <span className="text-xs text-gray-400 truncate block">{m.landmark}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Escalated Date",
                                        key: "escalated_date",
                                        render: (m) => (
                                            <span className="text-xs text-gray-600 font-medium">{m.escalated_date}</span>
                                        )
                                    },
                                    {
                                        header: "Barangay Status",
                                        key: "barangay_status",
                                        render: (m) => (
                                            <div className="flex items-center space-x-2">
                                                {m.barangay_status === 'In Progress' && (
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                    </span>
                                                )}
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusStyle(m.barangay_status)}`}>
                                                    {m.barangay_status}
                                                </span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Reporter",
                                        key: "reporter",
                                        render: (m) => (
                                            <div className="flex items-center space-x-2">
                                                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px] text-gray-500 font-bold">
                                                    {m.reporter.charAt(0)}
                                                </div>
                                                <span className="text-xs font-semibold text-gray-700">{m.reporter}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Action",
                                        key: "action",
                                        render: (m) => (
                                            <button 
                                                onClick={() => handleViewTracker(m)}
                                                className="text-xs font-bold text-[#F97316] hover:text-[#EA580C] uppercase tracking-widest transition-colors"
                                            >
                                                View Tracker
                                            </button>
                                        )
                                    }
                                ]}
                            />
                        </div>

                        {/* Info Tip */}
                        <div className="mt-8 bg-blue-50/50 border border-blue-100 rounded-2xl p-6 flex items-start space-x-4">
                            <div className="bg-blue-500 p-2 rounded-lg text-white">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-blue-900">Mission Tracking Note</h4>
                                <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                                    Missions in this list have been officially endorsed to the Barangay. 
                                    Status updates are synchronized live from the Barangay's Operations Hub. 
                                    If a mission is "Rejected", please check your endorsement letter for missing details.
                                </p>
                            </div>
                        </div>

                    </div>
                </main>
            </div>

            {/* Mission Tracker Modal */}
            {selectedMission && (() => {
                const activeMission = missions.find(m => m.mission_id === selectedMission.mission_id) || selectedMission;
                const timeline = getTimelineData(activeMission);
                return (
                    <div 
                        onClick={() => setSelectedMission(null)}
                        className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300"
                    >
                        {/* Modal container */}
                        <div 
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300"
                        >
                            {/* Modal Header */}
                            <header className="px-8 py-6 border-b border-gray-50 flex items-center justify-between bg-white shrink-0">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black bg-orange-50 text-[#F97316] px-2 py-1 rounded-md uppercase tracking-widest">
                                            Mission Tracker
                                        </span>
                                        <span className="text-xs font-mono text-gray-400 font-bold">
                                            Report #{activeMission.report_id}
                                        </span>
                                    </div>
                                    <h2 className="text-xl font-black text-gray-900 mt-1 tracking-tight">
                                        {activeMission.mission_id}
                                    </h2>
                                </div>
                                <button 
                                    onClick={() => setSelectedMission(null)}
                                    className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#B35D25] hover:bg-orange-50/50 transition-all shrink-0"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </header>

                            {/* Modal Scrollable Body */}
                            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                                
                                {/* Info Cards Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Mission Title</p>
                                        <p className="text-sm font-bold text-gray-800 leading-tight">{activeMission.title}</p>
                                    </div>
                                    <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Report Location</p>
                                        <p className="text-sm font-bold text-gray-800 leading-tight">{activeMission.landmark}</p>
                                    </div>
                                    <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Reporter Name</p>
                                        <p className="text-sm font-bold text-gray-800 leading-tight">{activeMission.reporter}</p>
                                    </div>
                                    <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Escalated Date & Time</p>
                                        <p className="text-sm font-bold text-gray-800 leading-tight">{activeMission.escalated_date}</p>
                                    </div>
                                    <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Current Status</p>
                                        <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border mt-1 ${getStatusStyle(activeMission.barangay_status)}`}>
                                            {activeMission.barangay_status}
                                        </span>
                                    </div>
                                    <div className="bg-gray-50/50 border border-gray-100 p-5 rounded-2xl">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Assigned Rescue Team</p>
                                        <p className={`text-sm font-black mt-1 ${timeline.assignedTeam !== 'N/A' ? 'text-blue-600' : 'text-gray-400'}`}>
                                            {timeline.assignedTeam}
                                        </p>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="border-t border-gray-100/85"></div>

                                {/* Progress Timeline */}
                                <div className="space-y-6">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Mission Timeline</h3>
                                    <div className="pl-2">
                                        {timeline.steps.map((step, idx) => {
                                            const isLast = idx === timeline.steps.length - 1;
                                            const isCompleted = step.status === 'Resolved';
                                            const isInProgress = step.status === 'In Progress';
                                            const isPending = step.status === 'Pending';
                                            const isNotStarted = step.status === 'Not Started';

                                            let circleBg = 'bg-gray-50 border-gray-200 text-gray-400';
                                            let lineBg = 'bg-gray-100';

                                            if (isCompleted) {
                                                circleBg = 'bg-green-500 text-white border-green-500 shadow-lg shadow-green-500/20';
                                                lineBg = 'bg-green-500';
                                            } else if (isInProgress) {
                                                circleBg = 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20';
                                                lineBg = 'bg-gray-100';
                                            } else if (isPending) {
                                                circleBg = 'bg-[#F97316] text-white border-[#F97316] shadow-lg shadow-orange-500/20';
                                                lineBg = 'bg-gray-100';
                                            }

                                            return (
                                                <div key={idx} className="flex items-start relative pb-8 last:pb-0">
                                                    {/* Vertical Line */}
                                                    {!isLast && (
                                                        <div className={`absolute left-[15px] top-[30px] bottom-0 w-[2px] ${lineBg} transition-all duration-300`}></div>
                                                    )}

                                                    {/* Icon / Circle */}
                                                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center z-10 shrink-0 font-bold text-xs ${circleBg}`}>
                                                        {isCompleted ? (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                            </svg>
                                                        ) : isInProgress ? (
                                                            <span className="relative flex h-2 w-2">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px]">{idx + 1}</span>
                                                        )}
                                                    </div>

                                                    {/* Content */}
                                                    <div className="ml-4 flex-1">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                                                            <h4 className={`text-sm font-extrabold ${isNotStarted ? 'text-gray-400 font-semibold' : 'text-gray-900'}`}>{step.label}</h4>
                                                            {!isNotStarted && step.timestamp && (
                                                                <span className="text-[10px] font-bold text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">{step.timestamp}</span>
                                                            )}
                                                        </div>
                                                        {step.note && (
                                                            <p className={`text-xs leading-relaxed ${isNotStarted ? 'text-gray-300 font-medium' : 'text-gray-500 font-medium'}`}>{step.note}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                            </div>
                            
                            {/* Footer */}
                            <footer className="px-8 py-5 border-t border-gray-50 bg-gray-50/30 flex justify-end shrink-0">
                                <button 
                                    onClick={() => setSelectedMission(null)}
                                    className="px-6 py-2.5 bg-[#F97316] text-[#FAFAF9] hover:bg-[#EA580C] rounded-xl font-bold text-xs uppercase tracking-widest transition-all border border-orange-500/20"
                                >
                                    Close Tracker
                                </button>
                            </footer>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default EscelatedMissions;
