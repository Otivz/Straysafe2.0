import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';

const BrgyOperation = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        if (!rawUser) {
            navigate('/staff/login');
            return;
        }
    }, [navigate]);

    const incidents = [
        {
            id: 'R-2026-012',
            aiPriority: 'High',
            condition: 'Critical',
            species: 'Dog',
            status: 'Injured',
            location: 'Block 3-A',
            reportStatus: 'Validated'
        },
        {
            id: 'R-2026-011',
            aiPriority: 'High',
            condition: 'High',
            species: 'Cat',
            status: 'Aggressive',
            location: 'Block 7-B',
            reportStatus: 'Pending'
        },
        {
            id: 'R-2026-010',
            aiPriority: 'Medium',
            condition: 'Medium',
            species: 'Dog',
            status: 'Sick',
            location: 'Market Area',
            reportStatus: 'Validated'
        }
    ];

    const missions = [
        {
            id: 'M-001',
            team: 'K. Frias',
            area: 'Subdivision A',
            status: 'In Transit',
            progress: 40,
            stages: ['Reported', 'Verified', 'Dispatched', 'Picked Up', 'Impounded', 'Resolved'],
            currentStage: 2
        },
        {
            id: 'M-002',
            team: 'Team B',
            area: 'Block 7',
            status: 'On Site',
            progress: 70,
            stages: ['Reported', 'Verified', 'Dispatched', 'Picked Up', 'Impounded', 'Resolved'],
            currentStage: 3
        }
    ];

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <BrgySidebar />
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <BrgyNavbar />
                <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    <div className="flex flex-col gap-8">
                        {/* Header Section */}
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight">Operation Command Center</h1>
                                <p className="text-gray-500 font-medium">Real-time tactical oversight for Brgy. San Vicente</p>
                            </div>
                            <div className="flex gap-3">
                                <div className="px-4 py-2 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center gap-2">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                    <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Live System Active</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                            {/* Left Column: Incidents & Missions */}
                            <div className="lg:col-span-8 flex flex-col gap-8">
                                
                                {/* AI-Prioritized Incident Feed */}
                                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50">
                                    <div className="flex justify-between items-center mb-8">
                                        <div>
                                            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                                                AI-Prioritized Incident Feed
                                                <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[10px] font-black rounded-lg uppercase tracking-tighter">AI Core</span>
                                            </h2>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">DETECT → VALIDATE → RESCUE</p>
                                        </div>
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-green-500 bg-green-50 px-3 py-1.5 rounded-full uppercase tracking-widest">
                                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                            Live Updates
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        {incidents.map((incident) => (
                                            <div key={incident.id} className="group relative bg-[#FAFAFA] hover:bg-white hover:shadow-xl hover:shadow-orange-500/5 border border-transparent hover:border-orange-100 p-5 rounded-3xl transition-all duration-300">
                                                <div className="flex flex-wrap items-center justify-between gap-4">
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black text-sm ${
                                                            incident.aiPriority === 'High' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'
                                                        }`}>
                                                            <span className="text-[10px] uppercase opacity-60">AI</span>
                                                            {incident.aiPriority}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <span className="text-xs font-black text-gray-900">{incident.id}</span>
                                                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                                                    incident.condition === 'Critical' ? 'bg-red-600 text-white' : 
                                                                    incident.condition === 'High' ? 'bg-orange-500 text-white' : 
                                                                    'bg-amber-400 text-white'
                                                                }`}>
                                                                    {incident.condition}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm font-bold text-gray-700">
                                                                {incident.species} • {incident.status} • <span className="text-orange-600">{incident.location}</span>
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status:</span>
                                                                <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-md">{incident.reportStatus}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <button className="px-6 py-3 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-[#F97316] hover:shadow-lg hover:shadow-orange-500/20 transition-all active:scale-95">
                                                        DISPATCH NOW
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Active Mission Tracker */}
                                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50">
                                    <div className="flex justify-between items-center mb-8">
                                        <div>
                                            <h2 className="text-xl font-black text-gray-900">Active Mission Tracker</h2>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Real-time Field Updates</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {missions.map((mission) => (
                                            <div key={mission.id} className="bg-gray-50/50 border border-gray-100 p-6 rounded-[2rem]">
                                                <div className="flex justify-between items-start mb-6">
                                                    <div>
                                                        <h3 className="text-sm font-black text-gray-900">{mission.id} - {mission.team}</h3>
                                                        <p className="text-xs font-bold text-orange-600">{mission.area}</p>
                                                    </div>
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                        mission.status === 'In Transit' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                                                    }`}>
                                                        {mission.status}
                                                    </span>
                                                </div>

                                                <div className="mb-6">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Progress</span>
                                                        <span className="text-[10px] font-black text-gray-900">{mission.progress}%</span>
                                                    </div>
                                                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-orange-500 transition-all duration-500" 
                                                            style={{ width: `${mission.progress}%` }}
                                                        ></div>
                                                    </div>
                                                </div>

                                                <div className="flex justify-between relative mt-4">
                                                    <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-gray-200 -translate-y-1/2 z-0"></div>
                                                    {mission.stages.map((stage, idx) => (
                                                        <div key={stage} className="relative z-10 flex flex-col items-center">
                                                            <div className={`w-2.5 h-2.5 rounded-full border-2 border-white ${
                                                                idx <= mission.currentStage ? 'bg-orange-500' : 'bg-gray-300'
                                                            }`}></div>
                                                            <span className={`text-[7px] font-black uppercase tracking-tighter mt-2 ${
                                                                idx <= mission.currentStage ? 'text-orange-600' : 'text-gray-300'
                                                            }`}>
                                                                {stage}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                            </div>

                            {/* Right Column: Metrics & Analytics */}
                            <div className="lg:col-span-4 flex flex-col gap-8">
                                
                                {/* Resource Availability */}
                                <div className="bg-[#1A4543] text-white rounded-[2.5rem] p-8 shadow-xl shadow-teal-900/10">
                                    <h3 className="text-sm font-black uppercase tracking-widest mb-6 opacity-60">Resource Availability</h3>
                                    <div className="space-y-6">
                                        <div className="flex justify-between items-end border-b border-white/10 pb-4">
                                            <span className="text-xs font-bold opacity-80">Teams Available</span>
                                            <span className="text-4xl font-black leading-none">3</span>
                                        </div>
                                        <div className="flex justify-between items-end border-b border-white/10 pb-4">
                                            <span className="text-xs font-bold opacity-80">Teams in Field</span>
                                            <span className="text-4xl font-black text-teal-300 leading-none">2</span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <span className="text-xs font-bold opacity-80">Total Personnel</span>
                                            <span className="text-4xl font-black leading-none">5</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Response Metrics */}
                                <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Response Metrics</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-orange-50 rounded-2xl">
                                            <p className="text-[8px] font-black text-orange-600 uppercase mb-1">Avg Response</p>
                                            <p className="text-xl font-black text-gray-900 leading-none">18m</p>
                                        </div>
                                        <div className="p-4 bg-blue-50 rounded-2xl">
                                            <p className="text-[8px] font-black text-blue-600 uppercase mb-1">Today's Rescues</p>
                                            <p className="text-xl font-black text-gray-900 leading-none">4</p>
                                        </div>
                                        <div className="col-span-2 p-4 bg-green-50 rounded-2xl flex items-center justify-between">
                                            <div>
                                                <p className="text-[8px] font-black text-green-600 uppercase mb-1">Efficiency</p>
                                                <p className="text-xl font-black text-gray-900 leading-none">87%</p>
                                            </div>
                                            <div className="w-10 h-10 rounded-full border-4 border-green-500 border-t-transparent animate-spin-slow"></div>
                                        </div>
                                    </div>
                                </div>


                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default BrgyOperation;
