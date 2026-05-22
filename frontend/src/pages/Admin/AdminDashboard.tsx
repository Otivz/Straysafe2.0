import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
const AdminDashboard = () => {
    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            {/* LEFT SIDEBAR COMPONENT */}
            <AdminSidebar />

            {/* MAIN CONTENT DIV */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* TOP NAVIGATION */}
                <AdminNavbar />

                {/* SCROLLABLE AREA with Custom Scrollbar */}
                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">



                    {/* TWO COLUMN CONTENT SECTION BELOW MAP */}
                    <div className="flex gap-8">
                        {/* LEFT TWO-THIRDS */}
                        <div className="flex-1 flex flex-col space-y-8">

                            {/* Header Block */}
                            <div className="flex justify-between items-end">
                                <div>
                                    <h1 className="text-3xl font-extrabold text-gray-900 mb-2">System Overview</h1>
                                    <p className="text-gray-500 text-sm">Real-time surveillance and rescue coordination status.</p>
                                </div>
                                <div className="relative flex items-center">
                                    <span className="absolute left-3 text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Search operations..."
                                        className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#B45309] focus:border-transparent w-64 shadow-sm transition-all"
                                    />
                                </div>
                            </div>

                            {/* Top Stats Row */}
                            <div className="grid grid-cols-5 gap-4">
                                {/* ... cards ... */}
                                {/* Note: I'll include the actual cards in the replacement to ensure correct context, 
                                but I will focus on adding the second row below it. */}
                                {/* [I will use a simpler approach for the replacement content to avoid re-writing everything if possible, 
                                but since I'm replacing a block, I'll include the whole 1st row and then the 2nd row] */}

                                {/* (Actual cards as previously defined) */}
                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-lg">+12%</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 leading-none">346</p>
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Total Reports</p>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-lg">+8%</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 leading-none">135</p>
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Active Cases</p>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center text-red-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-lg">-5%</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 leading-none">23</p>
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">High Priority</p>
                                    </div>
                                </div>

                                <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-32 transition-all hover:shadow-md">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded-lg">-15%</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 leading-none">4.2h</p>
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Avg Response</p>
                                    </div>
                                </div>

                                <div className="bg-[#1A4543] rounded-2xl p-5 shadow-lg shadow-teal-900/10 flex flex-col justify-between h-32 transition-all hover:scale-[1.02] hover:shadow-xl">
                                    <div className="flex justify-between items-start">
                                        <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center text-teal-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                            </svg>
                                        </div>
                                        <span className="text-[10px] font-bold text-teal-300 bg-white/10 px-1.5 py-0.5 rounded-lg">+3%</span>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-white leading-none">87%</p>
                                        <p className="text-[10px] font-bold text-teal-100/60 tracking-wider uppercase mt-1.5">Resolution Rate</p>
                                    </div>
                                </div>
                            </div>

                            {/* Second Row: Charts */}
                            <div className="grid grid-cols-3 gap-6">
                                {/* Reports Over Time - Line Chart */}
                                <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-sm font-bold text-gray-900">Reports Over Time</h3>
                                        <div className="flex items-center space-x-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">
                                            <span>Apr 18 - Apr 24</span>
                                        </div>
                                    </div>
                                    <div className="relative h-40 w-full">
                                        <svg viewBox="0 0 400 150" className="w-full h-full">
                                            <defs>
                                                <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#F97316" stopOpacity="0.2" />
                                                    <stop offset="100%" stopColor="#F97316" stopOpacity="0" />
                                                </linearGradient>
                                            </defs>
                                            {/* Grid Lines */}
                                            <line x1="0" y1="0" x2="400" y2="0" stroke="#F1F5F9" strokeWidth="1" />
                                            <line x1="0" y1="50" x2="400" y2="50" stroke="#F1F5F9" strokeWidth="1" />
                                            <line x1="0" y1="100" x2="400" y2="100" stroke="#F1F5F9" strokeWidth="1" />
                                            <line x1="0" y1="150" x2="400" y2="150" stroke="#E2E8F0" strokeWidth="2" />

                                            {/* Area Fill */}
                                            <path d="M0,120 C40,60 80,100 120,40 C160,80 200,30 240,70 C280,110 320,20 360,50 L400,60 L400,150 L0,150 Z" fill="url(#lineGradient)" />

                                            {/* Line Path */}
                                            <path d="M0,120 C40,60 80,100 120,40 C160,80 200,30 240,70 C280,110 320,20 360,50 L400,60" fill="none" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />

                                            {/* Data Points */}
                                            <circle cx="0" cy="120" r="4" fill="white" stroke="#F97316" strokeWidth="2" />
                                            <circle cx="120" cy="40" r="4" fill="white" stroke="#F97316" strokeWidth="2" />
                                            <circle cx="200" cy="30" r="4" fill="white" stroke="#F97316" strokeWidth="2" />
                                            <circle cx="320" cy="20" r="4" fill="white" stroke="#F97316" strokeWidth="2" />
                                            <circle cx="400" cy="60" r="4" fill="white" stroke="#F97316" strokeWidth="2" />
                                        </svg>
                                        <div className="flex justify-between mt-2 text-[9px] font-bold text-gray-400 uppercase tracking-widest px-1">
                                            <span>Apr 18</span>
                                            <span>Apr 20</span>
                                            <span>Apr 22</span>
                                            <span>Apr 24</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Reports by Category - Donut Chart */}
                                <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col">
                                    <h3 className="text-sm font-bold text-gray-900 mb-6">Reports by Category</h3>
                                    <div className="flex-1 flex items-center justify-center relative">
                                        <svg viewBox="0 0 100 100" className="w-32 h-32 transform -rotate-90">
                                            {/* Injured Segment - Teal */}
                                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1A4543" strokeWidth="12" strokeDasharray="125.6 251.2" />
                                            {/* Aggressive Segment - Orange */}
                                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#F97316" strokeWidth="12" strokeDasharray="75.36 251.2" strokeDashoffset="-125.6" />
                                            {/* Sighting Segment - Blue */}
                                            <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3B82F6" strokeWidth="12" strokeDasharray="50.24 251.2" strokeDashoffset="-200.96" />
                                        </svg>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                            <span className="text-xl font-black text-gray-900 leading-none">346</span>
                                            <span className="text-[8px] font-bold text-gray-400 uppercase mt-1">Total</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-center space-x-4 mt-6">
                                        <div className="flex items-center space-x-1.5">
                                            <div className="w-2 h-2 rounded-full bg-[#1A4543]"></div>
                                            <span className="text-[10px] font-bold text-gray-500">Injured</span>
                                        </div>
                                        <div className="flex items-center space-x-1.5">
                                            <div className="w-2 h-2 rounded-full bg-[#F97316]"></div>
                                            <span className="text-[10px] font-bold text-gray-500">Aggressive</span>
                                        </div>
                                        <div className="flex items-center space-x-1.5">
                                            <div className="w-2 h-2 rounded-full bg-[#3B82F6]"></div>
                                            <span className="text-[10px] font-bold text-gray-500">Sighting</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Species Distribution - Bar Chart */}
                                <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100">
                                    <h3 className="text-sm font-bold text-gray-900 mb-8">Species Distribution</h3>
                                    <div className="flex items-end justify-around h-32 px-4 gap-8">
                                        <div className="flex flex-col items-center flex-1">
                                            <div className="text-[10px] font-bold text-gray-400 mb-2">204</div>
                                            <div className="w-full bg-[#1A4543] rounded-t-xl transition-all hover:bg-[#2a6b68]" style={{ height: '100%' }}></div>
                                            <div className="mt-3 text-[10px] font-bold text-gray-900 uppercase tracking-wider">Dog</div>
                                        </div>
                                        <div className="flex flex-col items-center flex-1">
                                            <div className="text-[10px] font-bold text-gray-400 mb-2">142</div>
                                            <div className="w-full bg-[#E2E8F0] rounded-t-xl transition-all hover:bg-gray-300" style={{ height: '70%' }}></div>
                                            <div className="mt-3 text-[10px] font-bold text-gray-900 uppercase tracking-wider">Cat</div>
                                        </div>
                                    </div>
                                </div>
                            </div>



                        </div>


                        {/* RIGHT SIDEBAR (AI Insights) */}
                        <div className="w-80 flex-shrink-0 flex flex-col gap-6">

                            <div className="bg-[#EAE5DF] rounded-[2rem] p-6 pb-8 flex-1">
                                <div className="flex items-center space-x-3 mb-6">
                                    <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-[#B45309] shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900">AI Smart Insights</h3>
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">Operational Intelligence</p>
                                    </div>
                                </div>

                                {/* Live Intelligence Feed */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between px-1">
                                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Live Intelligence</h4>
                                        <div className="flex items-center space-x-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"></span>
                                            <span className="text-[8px] font-black text-orange-600 uppercase">Live</span>
                                        </div>
                                    </div>

                                    {/* Item 1: Anomaly */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2 mb-1">
                                                    <span className="text-[9px] font-black text-red-600 uppercase tracking-tighter">Anomaly Detected</span>
                                                    <span className="text-[8px] text-gray-400">2m ago</span>
                                                </div>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    Unusual cluster of sighting reports in <span className="font-bold text-gray-900">Sector 7</span>. AI suggests potential stray colony migration.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Item 2: Efficiency */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-[#1A4543] shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                </svg>
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2 mb-1">
                                                    <span className="text-[9px] font-black text-[#1A4543] uppercase tracking-tighter">Efficiency Gain</span>
                                                    <span className="text-[8px] text-gray-400">1h ago</span>
                                                </div>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    Response time in West Zone improved by <span className="text-teal-600 font-bold">12.4%</span> following route optimization.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Item 3: Forecast */}
                                    <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-white/40 shadow-sm transition-all hover:shadow-md hover:bg-white/80 group">
                                        <div className="flex items-start space-x-3">
                                            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center text-orange-600 shrink-0 group-hover:scale-110 transition-transform">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <div className="flex items-center space-x-2 mb-1">
                                                    <span className="text-[9px] font-black text-orange-600 uppercase tracking-tighter">Predictive Forecast</span>
                                                    <span className="text-[8px] text-gray-400">Next 6h</span>
                                                </div>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    High report probability (85%) in <span className="font-bold text-gray-900">Downtown</span> between 17:00 - 20:00.
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

export default AdminDashboard;
