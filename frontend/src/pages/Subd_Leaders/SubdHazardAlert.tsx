import { useState } from 'react';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import Button from '../../components/Button';

interface RecentAlert {
    id: number;
    title: string;
    description: string;
    priority: 'Low' | 'Medium' | 'Urgent';
    date: string;
}

const SubdHazardAlert = () => {
    const [hazardType, setHazardType] = useState('Aggressive Dog');
    const [priority, setPriority] = useState<'Low' | 'Medium' | 'Urgent'>('Medium');
    const [message, setMessage] = useState('');
    const [showSuccess, setShowSuccess] = useState(false);
    
    const [alerts, setAlerts] = useState<RecentAlert[]>([
        {
            id: 1,
            title: "Aggressive Canine near Block 4",
            description: "Aggressive dog spotted near Block 4. Residents are advised to avoid the area.",
            priority: "Urgent",
            date: "2 hours ago"
        },
        {
            id: 2,
            title: "Stray Dog roaming near Clubhouse",
            description: "Stray Dog roaming near Clubhouse. Medium priority alert.",
            priority: "Medium",
            date: "5 hours ago"
        },
        {
            id: 3,
            title: "Dog Bite Incident near Main Gate",
            description: "Dog Bite Incident near Main Gate. Medical response and rescue team dispatched.",
            priority: "Urgent",
            date: "1 day ago"
        },
        {
            id: 4,
            title: "Injured Husky rescued near Park Area",
            description: "Injured Husky rescued near Park Area. Relocated to safety.",
            priority: "Low",
            date: "3 days ago"
        }
    ]);

    // Dynamic placeholders based on hazard type
    const getPlaceholderText = () => {
        switch (hazardType) {
            case 'Aggressive Dog':
                return "Aggressive dog spotted near Block 4. Residents are advised to avoid the area.";
            case 'Roaming Pack':
                return "Roaming pack reported near the playground. Keep pets and children indoors.";
            case 'Rabid Dog Suspected':
                return "Possible rabid dog seen near Gate 2. Barangay rescue team has been notified.";
            case 'Stray Dog':
                return "Stray dog roaming near clubhouse. Resident caution is advised.";
            case 'Dog Bite Incident':
                return "Dog bite incident reported near Block 2. Stay alert and keep distance from unknown stray animals.";
            case 'Injured Dog':
                return "Injured dog spotted near subdivision park. Care team has been dispatched to assist.";
            default:
                return "Please provide a clear and concise warning message for the residents.";
        }
    };

    const handleBroadcast = (e: React.FormEvent) => {
        e.preventDefault();
        
        const finalMessage = message.trim() || getPlaceholderText();
        
        const newAlert: RecentAlert = {
            id: Date.now(),
            title: `${hazardType} near Subdivision`,
            description: finalMessage,
            priority: priority,
            date: "Just now"
        };

        setAlerts([newAlert, ...alerts]);
        setShowSuccess(true);
        
        // Reset message field
        setMessage('');
        
        // Hide success message after 4 seconds
        setTimeout(() => {
            setShowSuccess(false);
        }, 4000);
    };

    const handleClear = () => {
        setMessage('');
        setHazardType('Aggressive Dog');
        setPriority('Medium');
    };

    const getPriorityPillStyle = (lvl: 'Low' | 'Medium' | 'Urgent') => {
        switch (lvl) {
            case 'Urgent': return 'bg-red-50 text-red-600 border-red-100';
            case 'Medium': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'Low': return 'bg-gray-50 text-gray-400 border-gray-100';
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#B35D25]/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-orange-50/50 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>

            {/* Sidebar */}
            <div className="z-10 flex shrink-0">
                <SubdSidebar />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <SubdNavbar />

                {/* Scrollable Content Area */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-10 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent relative">
                    
                    {/* Floating Success Notification */}
                    {showSuccess && (
                        <div className="fixed top-24 right-10 z-50 max-w-sm w-full bg-green-500 text-white rounded-2xl shadow-xl shadow-green-500/20 p-5 flex items-start gap-4 border border-green-400/20 animate-in slide-in-from-top-10 duration-300">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white shrink-0 font-bold">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div className="flex-1">
                                <h4 className="font-extrabold text-sm tracking-tight mb-0.5">Broadcast Successful!</h4>
                                <p className="text-xs text-white/90 font-medium">The emergency hazard alert has been pushed to all active subdivision devices.</p>
                            </div>
                        </div>
                    )}

                    {/* Header */}
                    <div className="flex flex-col mb-2 shrink-0">
                        <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">Broadcast Hazard Alert</h1>
                        <p className="text-gray-500 text-sm font-medium">Instant notification for all subdivision residents.</p>
                    </div>

                    {/* Form Layout Card */}
                    <div className="bg-white rounded-[2.5rem] p-10 border border-gray-100 shadow-sm relative overflow-hidden shrink-0">
                        <div className="absolute top-0 left-0 w-2 h-full bg-[#F97316]"></div>
                        
                        <form onSubmit={handleBroadcast} className="space-y-8">
                            <div className="flex flex-col gap-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Hazard Type Dropdown */}
                                    <div className="flex flex-col gap-2.5">
                                        <label htmlFor="hazard-type" className="text-xs font-black uppercase text-gray-400 tracking-wider">Hazard Type</label>
                                        <div className="relative">
                                            <select 
                                                id="hazard-type"
                                                value={hazardType}
                                                onChange={(e) => setHazardType(e.target.value)}
                                                className="w-full pl-5 pr-10 py-4 bg-gray-50/50 hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-2xl text-sm font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-all appearance-none cursor-pointer"
                                            >
                                                <option value="Aggressive Dog">Aggressive Dog</option>
                                                <option value="Stray Dog">Stray Dog</option>
                                                <option value="Dog Bite Incident">Dog Bite Incident</option>
                                                <option value="Roaming Pack">Roaming Pack</option>
                                                <option value="Injured Dog">Injured Dog</option>
                                                <option value="Rabid Dog Suspected">Rabid Dog Suspected</option>
                                            </select>
                                            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Priority Level Selection */}
                                    <div className="flex flex-col gap-2.5">
                                        <span className="text-xs font-black uppercase text-gray-400 tracking-wider">Priority Level</span>
                                        <div className="grid grid-cols-3 gap-3">
                                            {(['Low', 'Medium', 'Urgent'] as const).map((lvl) => {
                                                const isActive = priority === lvl;
                                                let btnClass = "border-gray-200 text-gray-500 hover:bg-gray-50";
                                                
                                                if (isActive) {
                                                    if (lvl === 'Low') btnClass = "bg-gray-100 border-gray-300 text-gray-700 shadow-inner";
                                                    if (lvl === 'Medium') btnClass = "bg-orange-50 border-orange-200 text-[#F97316] shadow-inner";
                                                    if (lvl === 'Urgent') btnClass = "bg-red-50 border-red-200 text-red-600 shadow-inner";
                                                }

                                                return (
                                                    <button
                                                        key={lvl}
                                                        type="button"
                                                        onClick={() => setPriority(lvl)}
                                                        className={`py-3.5 border-2 rounded-2xl text-xs font-black uppercase tracking-wider transition-all ${btnClass}`}
                                                    >
                                                        {lvl}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Alert Message Textarea */}
                                <div className="flex flex-col gap-2.5">
                                    <label htmlFor="alert-message" className="text-xs font-black uppercase text-gray-400 tracking-wider">Alert Message</label>
                                    <textarea
                                        id="alert-message"
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                        placeholder={getPlaceholderText()}
                                        className="w-full p-5 bg-gray-50/50 hover:bg-gray-50 border border-gray-200 hover:border-gray-300 rounded-2xl text-sm font-bold text-gray-700 placeholder-gray-400/75 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-all resize-none min-h-[140px] leading-relaxed"
                                    ></textarea>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-gray-50 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                {/* Broadcast Footer Info */}
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#F97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                    </svg>
                                    <span>Reaching 452 Active Residents</span>
                                </div>

                                {/* Form Action Buttons */}
                                <div className="flex items-center gap-3">
                                    <Button
                                        type="button"
                                        variant="light"
                                        onClick={handleClear}
                                        className="px-6 py-2.5 rounded-xl border border-gray-200 hover:border-gray-300 text-gray-600 font-black text-xs uppercase tracking-widest transition-all"
                                    >
                                        Clear Draft
                                    </Button>
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        className="px-8 py-2.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-xl shadow-lg shadow-orange-950/15 font-black text-xs uppercase tracking-widest transition-all"
                                    >
                                        Broadcast Now
                                    </Button>
                                </div>
                            </div>
                        </form>
                    </div>

                    {/* Recent Operations Alerts Section */}
                    <div className="flex flex-col gap-6 shrink-0">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-gray-900 tracking-tight">Recent Operations Alerts</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Active warnings history</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {alerts.map((alert) => (
                                <div 
                                    key={alert.id} 
                                    className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-[200px]"
                                >
                                    <div>
                                        <div className="flex justify-between items-start mb-3">
                                            <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border ${getPriorityPillStyle(alert.priority)}`}>
                                                {alert.priority}
                                            </span>
                                            <span className="text-[9px] font-bold text-gray-400 font-mono">{alert.date}</span>
                                        </div>
                                        <h3 className="text-sm font-black text-gray-900 leading-tight mb-2 truncate-2-lines">{alert.title}</h3>
                                        <p className="text-xs text-gray-500 font-semibold leading-relaxed line-clamp-3">{alert.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default SubdHazardAlert;
