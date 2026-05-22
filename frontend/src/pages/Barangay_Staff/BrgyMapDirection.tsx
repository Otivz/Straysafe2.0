import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import MapComponent from '../../components/MapComponent';

const BrgyMapDirection = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const rescueData = location.state?.rescue;
    
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isNavigating, setIsNavigating] = useState(!!location.state?.source);
    const [navSource, setNavSource] = useState<'brgy' | 'current'>(location.state?.source || 'brgy');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const [navInfo, setNavInfo] = useState({
        distance: "Calculating...",
        eta: "...",
        destination: rescueData?.report?.landmark || "San Vicente Sector 4",
        address: "Phase 3, Block 12, Lot 5, San Vicente Subdivision"
    });

    const BRGY_OFFICE: [number, number] = [14.8069, 121.0039]; // R243+QH Santa Maria, Bulacan
    
    // Fallback if accessed directly without state
    useEffect(() => {
        if (!rescueData) {
            // navigate('/staff/rescue-requests');
        }
        
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);

        // Get user location if needed
        if (navSource === 'current') {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setUserLocation([position.coords.latitude, position.coords.longitude]);
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        setNavSource('brgy'); // Fallback
                    }
                );
            }
        }

        return () => clearInterval(timer);
    }, [rescueData, navigate, navSource]);

    // Remove mock static navInfo

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800 overflow-hidden">
            <BrgySidebar />

            <main className="flex-1 flex flex-col h-screen relative">
                <BrgyNavbar />

                {/* Map Layer - Takes full background */}
                <div className="absolute inset-0 z-0 pt-16">
                    <MapComponent 
                        center={[rescueData?.report?.latitude || 14.8093, rescueData?.report?.longitude || 121.0028]} 
                        zoom={17}
                        markers={[
                            ...(rescueData ? [{
                                id: rescueData.report_id,
                                lat: rescueData.report.latitude,
                                lng: rescueData.report.longitude,
                                title: rescueData.report.landmark,
                                priority: rescueData.report.priority_level,
                                category: "Rescue Site"
                            }] : []),
                            {
                                id: -1,
                                lat: BRGY_OFFICE[0],
                                lng: BRGY_OFFICE[1],
                                title: "Barangay Hall HQ",
                                category: "Barangay Office",
                                time: "Base"
                            },
                            ...(userLocation ? [{
                                id: -2,
                                lat: userLocation[0],
                                lng: userLocation[1],
                                title: "Your Location",
                                category: "User Location",
                                time: "Live"
                            }] : [])
                        ]}
                        routing={isNavigating ? {
                            start: navSource === 'brgy' ? BRGY_OFFICE : (userLocation || BRGY_OFFICE),
                            end: [rescueData?.report?.latitude || 14.8093, rescueData?.report?.longitude || 121.0028],
                            waypointNames: [navSource === 'brgy' ? "Barangay Office" : "Your Location", "Rescue Site"],
                            onRoutingUpdate: (data) => setNavInfo(prev => ({ ...prev, distance: data.distance, eta: data.time }))
                        } : undefined}
                    />
                </div>

                {/* Navigation Overlays */}
                <div className="relative z-10 flex-1 pointer-events-none p-6 md:p-10 flex flex-col justify-between">
                    
                    {/* Top Row: Navigation Context */}
                    <div className="flex justify-between items-start">
                        <div className="pointer-events-auto bg-white/90 backdrop-blur-xl border border-white/20 rounded-[2.5rem] p-8 shadow-2xl w-full max-w-sm animate-in slide-in-from-top-10 duration-700">
                            <div className="flex items-center gap-6 mb-6">
                                <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-xl shadow-orange-200">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 20l-5.447-2.724A2 2 0 013 15.382V5.618a2 2 0 011.447-1.817L9 2l6 3 5.447-2.724A2 2 0 0121 4.09V13.82a2 2 0 01-1.447 1.817L15 18l-6 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 4v16m6-16v16" /></svg>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Navigation</h2>
                                    <p className="text-[10px] font-black text-orange-600 uppercase tracking-[0.2em]">Active Rescue Mission</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Destination</p>
                                    <p className="text-lg font-black text-gray-900 leading-tight">{navInfo.destination}</p>
                                    <p className="text-xs font-bold text-gray-500 mt-1">{navInfo.address}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-2 mb-4 bg-gray-100 p-1 rounded-xl">
                                    <button 
                                        onClick={() => setNavSource('brgy')}
                                        className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase transition-all ${navSource === 'brgy' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'}`}
                                    >
                                        From Office
                                    </button>
                                    <button 
                                        onClick={() => setNavSource('current')}
                                        className={`py-2 px-3 rounded-lg text-[10px] font-black uppercase transition-all ${navSource === 'current' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500'}`}
                                    >
                                        From Me
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50/80 rounded-2xl p-4">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Distance</p>
                                        <p className="text-xl font-black text-gray-900">{navInfo.distance}</p>
                                    </div>
                                    <div className="bg-gray-50/80 rounded-2xl p-4">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Travel Time</p>
                                        <p className="text-xl font-black text-orange-600">{navInfo.eta}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Top: Mission Clock */}
                        <div className="pointer-events-auto bg-gray-900/90 backdrop-blur-xl rounded-3xl p-5 border border-white/10 shadow-2xl flex flex-col items-center min-w-[140px] animate-in slide-in-from-right-10 duration-700">
                            <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.2em] mb-1">Mission Time</p>
                            <p className="text-2xl font-mono font-black text-white">{currentTime.toLocaleTimeString([], { hour12: false })}</p>
                        </div>
                    </div>

                    {/* Bottom Row: Mission Intelligence & Controls */}
                    <div className="flex flex-col md:flex-row items-end justify-between gap-6">
                        
                        {/* Incident Intelligence */}
                        <div className="pointer-events-auto bg-white/95 backdrop-blur-xl border border-white/20 rounded-[2.5rem] p-8 shadow-2xl w-full max-w-md animate-in slide-in-from-bottom-10 duration-700">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Incident Intelligence</h3>
                                <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${rescueData?.report?.priority_level === 'High' ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-blue-50 text-blue-600 border border-blue-100'}`}>
                                    {rescueData?.report?.priority_level || 'Normal'} Priority
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-3 mb-6">
                                <div className="bg-orange-50/50 rounded-2xl p-3 border border-orange-100/50">
                                    <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1">Animal</p>
                                    <p className="text-[11px] font-black text-gray-900 uppercase truncate">{rescueData?.report?.animal_type || "Stray Dog"}</p>
                                </div>
                                <div className="bg-orange-50/50 rounded-2xl p-3 border border-orange-100/50">
                                    <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1">Count</p>
                                    <p className="text-[11px] font-black text-gray-900 uppercase">{rescueData?.report?.animal_count || "1"} sighted</p>
                                </div>
                                <div className="bg-orange-50/50 rounded-2xl p-3 border border-orange-100/50">
                                    <p className="text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1">Behavior</p>
                                    <p className="text-[11px] font-black text-gray-900 uppercase truncate">{rescueData?.report?.condition || "Active"}</p>
                                </div>
                            </div>

                            <div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">Reporter Note</p>
                                <p className="text-xs font-bold text-gray-600 leading-relaxed italic">
                                    "{rescueData?.report?.description || "No description provided. Proceed with caution and follow standard safety protocols."}"
                                </p>
                            </div>
                        </div>

                        {/* Navigation Controls */}
                        <div className="pointer-events-auto flex flex-col gap-4 w-full md:w-auto animate-in slide-in-from-right-10 duration-700">
                            <button 
                                onClick={() => setIsNavigating(!isNavigating)}
                                className={`w-full md:w-64 py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] transition-all shadow-2xl ${isNavigating ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-200' : 'bg-orange-600 text-white hover:bg-orange-700 shadow-orange-200'}`}
                            >
                                {isNavigating ? 'Stop Navigation' : 'Start Navigation'}
                            </button>
                            <button 
                                onClick={() => navigate('/staff/rescue-requests')}
                                className="w-full md:w-64 py-6 rounded-[2rem] bg-gray-900 text-white font-black text-xs uppercase tracking-[0.3em] hover:bg-black transition-all shadow-2xl"
                            >
                                Arrived at Site
                            </button>
                        </div>
                    </div>
                </div>

                {/* Direction Indicators (Floating) */}
                {isNavigating && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none animate-pulse">
                        <div className="w-32 h-32 rounded-full bg-orange-600/20 flex items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-orange-600 flex items-center justify-center text-white shadow-3xl">
                                <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default BrgyMapDirection;
