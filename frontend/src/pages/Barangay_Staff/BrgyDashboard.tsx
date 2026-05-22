import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import MapComponent from '../../components/MapComponent';

const BrgyDashboard = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        if (!rawUser) {
            navigate('/staff/login');
            return;
        }

        try {
            const user = JSON.parse(rawUser);
            if (user.role_id !== 3) {
                navigate('/staff/login');
            }
        } catch {
            navigate('/staff/login');
        }
    }, [navigate]);

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            {/* LEFT SIDEBAR */}
            <BrgySidebar />

            {/* MAIN CONTENT */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <BrgyNavbar />

                {/* SCROLLABLE AREA */}
                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    <div className="flex flex-col lg:flex-row gap-8">
                        {/* LEFT SECTION: MAIN DASHBOARD */}
                        <div className="flex-1 flex flex-col space-y-8">
                            
                            {/* Header */}
                            <div className="flex justify-between items-end">
                                <div>
                                    <h1 className="text-3xl font-extrabold text-gray-900 mb-2">Barangay Operations</h1>
                                    <p className="text-gray-500 text-sm">Managing rescue requests and field operations for Brgy. San Vicente.</p>
                                </div>
                                <div className="hidden sm:flex items-center space-x-3">
                                    <button className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 shadow-sm hover:bg-gray-50 transition-all">
                                        Export Reports
                                    </button>
                                    <button className="px-4 py-2 bg-[#F97316] text-white rounded-xl text-xs font-bold shadow-md hover:bg-[#EA580C] transition-all">
                                        Dispatch Team
                                    </button>
                                </div>
                            </div>

                            {/* Stats Row */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Validated Reports */}
                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-lg">Pending</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 leading-none">12</p>
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Validated Requests</p>
                                    </div>
                                </div>

                                {/* Active Rescues */}
                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                                                <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg">In Field</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 leading-none">5</p>
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Active Rescues</p>
                                    </div>
                                </div>

                                {/* Completed Today */}
                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-lg">+3 Today</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 leading-none">28</p>
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Resolved This Month</p>
                                    </div>
                                </div>

                                {/* Avg Response Time */}
                                <div className="bg-[#1A4543] rounded-2xl p-5 shadow-lg shadow-teal-900/10 flex flex-col justify-between h-32 transition-all hover:scale-[1.02]">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center text-teal-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-teal-300 bg-white/10 px-1.5 py-0.5 rounded-lg">-15m</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-white leading-none">1.8h</p>
                                        <p className="text-[10px] font-bold text-teal-100/60 tracking-wider uppercase mt-1.5">Avg Rescue Time</p>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Rescue Requests Table */}
                            <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                                <div className="px-6 py-5 border-b border-gray-50 flex justify-between items-center">
                                    <h3 className="text-sm font-bold text-gray-900">Recent Rescue Requests</h3>
                                    <button className="text-[10px] font-bold text-[#F97316] uppercase tracking-widest hover:underline">View All</button>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-gray-50/50">
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Incident</th>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Location</th>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Priority</th>
                                                <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                                                <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            <tr className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center">
                                                        <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 mr-3">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-900">Injured Dog</p>
                                                            <p className="text-[10px] text-gray-400">#INC-2024-089</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-xs text-gray-600">Green Valley Subd.</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[10px] font-bold">High</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 text-[10px] font-bold">Validated</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button className="text-[10px] font-bold text-blue-600 hover:underline">Approve Rescue</button>
                                                </td>
                                            </tr>
                                            <tr className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center">
                                                        <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 mr-3">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-bold text-gray-900">Stray Cat Colony</p>
                                                            <p className="text-[10px] text-gray-400">#INC-2024-092</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-xs text-gray-600">Phase 3 Main Road</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">Medium</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold">Dispatched</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button className="text-[10px] font-bold text-gray-400 hover:underline">View Status</button>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Map Section */}
                            <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">Rescue Map</h3>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Live Team Tracking & Incident Locations</p>
                                    </div>
                                </div>
                                <div className="w-full h-[400px] rounded-2xl overflow-hidden relative border border-gray-100">
                                    <MapComponent 
                                        center={[14.8093, 121.0028]} 
                                        zoom={15} 
                                        markers={[{
                                            id: -1,
                                            lat: 14.8069,
                                            lng: 121.0039,
                                            title: "Barangay Hall HQ",
                                            category: "Barangay Office",
                                            time: "Base"
                                        }]}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* RIGHT SECTION: AI INSIGHTS & OPERATIONS */}
                        <div className="w-full lg:w-80 flex-shrink-0 flex flex-col gap-6">
                            
                            <div className="bg-[#EAE5DF] rounded-[2rem] p-6 pb-8">
                                <div className="flex items-center space-x-3 mb-6">
                                    <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-[#F97316] shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M11.3 1.047a1 1 0 00-1.6 0l-8.6 10.582a1 1 0 001.2 1.584l.622-.254a4.673 4.673 0 002.73 3.552 4.674 4.674 0 002.04 1.019c.147.402.432.733.797.943a1.5 1.5 0 001.822-.226l1.61-1.611a1.5 1.5 0 00.225-1.822c-.21-.365-.54-.65-.943-.797a4.674 4.674 0 00-1.019-2.04 4.673 4.673 0 00-3.552-2.73l.254-.622a1 1 0 00-1.584-1.2l-10.582 8.6a1 1 0 000 1.6l10.582 8.6a1 1 0 001.6 0l8.6-10.582a1 1 0 00-1.2-1.584l-.622.254a4.673 4.673 0 00-2.73-3.552 4.674 4.674 0 00-2.04-1.019c-.147-.402-.432-.733-.797-.943a1.5 1.5 0 00-1.822.226l-1.61 1.611a1.5 1.5 0 00-.225 1.822c.21.365.54.65.943.797a4.674 4.674 0 001.019 2.04 4.673 4.673 0 003.552 2.73l-.254.622a1 1 0 001.584 1.2l10.582-8.6a1 1 0 000-1.6l-10.582-8.6z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900">Rescue Insights</h3>
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">AI Response Optimization</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {/* Insight 1 */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-orange-600 uppercase mb-1">High Priority Alert</p>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    New high-priority report in <span className="font-bold">San Vicente East</span>. Immediate response recommended.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Insight 2 */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-[#1A4543] shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-[#1A4543] uppercase mb-1">Route Optimized</p>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    Rescue Team B route updated. Estimated arrival in <span className="font-bold text-teal-600">8 minutes</span>.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Insight 3 */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[9px] font-black text-blue-600 uppercase mb-1">Peak Time Warning</p>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    Historical data shows surge in sightings at <span className="font-bold text-gray-900">18:00</span>. Standby team ready.
                                                </p>
                                            </div>
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

export default BrgyDashboard;
