import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';

interface Alert {
    id: string;
    title: string;
    message: string;
    type: 'warning' | 'danger' | 'info';
    area: string;
    date: string;
    status: 'active' | 'resolved' | 'expired';
}

const BrgyCommunityAlerts = () => {
    const navigate = useNavigate();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    const [alerts] = useState<Alert[]>([
        {
            id: 'ALR-001',
            title: 'Stray Dog Pack Sighting',
            message: 'Multiple stray dogs spotted near the elementary school area. Residents advised to be cautious.',
            type: 'warning',
            area: 'Block 3-A, Near School Zone',
            date: '2026-05-26',
            status: 'active'
        },
        {
            id: 'ALR-002',
            title: 'Rabies Vaccination Drive',
            message: 'Free rabies vaccination for pets this weekend at the Barangay Hall. Bring your pets for vaccination.',
            type: 'info',
            area: 'Barangay Hall',
            date: '2026-05-25',
            status: 'active'
        },
        {
            id: 'ALR-003',
            title: 'Aggressive Animal Report',
            message: 'An aggressive stray cat has been reported in the market area. Animal control team has been dispatched.',
            type: 'danger',
            area: 'Market Area',
            date: '2026-05-24',
            status: 'resolved'
        }
    ]);

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

    const getTypeBadge = (type: string) => {
        switch (type) {
            case 'danger':
                return <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest">Danger</span>;
            case 'warning':
                return <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[10px] font-black uppercase tracking-widest">Warning</span>;
            case 'info':
                return <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest">Info</span>;
            default:
                return null;
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-600 text-[10px] font-black uppercase tracking-widest">Active</span>;
            case 'resolved':
                return <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 text-[10px] font-black uppercase tracking-widest">Resolved</span>;
            case 'expired':
                return <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-400 text-[10px] font-black uppercase tracking-widest">Expired</span>;
            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <BrgySidebar 
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />
            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
                <BrgyNavbar
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Community Alerts</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Broadcast safety alerts and advisories to the community</p>
                        </div>
                    }
                />
                <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    <div className="flex flex-col gap-8">

                        {/* Header */}
                        <div className="flex justify-end items-center">
                            <button className="px-5 py-2.5 bg-[#F97316] text-white rounded-xl text-xs font-bold shadow-md hover:bg-[#EA580C] transition-all">
                                + New Alert
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-28 transition-all hover:shadow-md">
                                <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center text-green-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-gray-900 leading-none">{alerts.filter(a => a.status === 'active').length}</p>
                                    <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1">Active Alerts</p>
                                </div>
                            </div>
                            <div className="bg-white rounded-2xl p-5 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col justify-between h-28 transition-all hover:shadow-md">
                                <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-gray-900 leading-none">{alerts.filter(a => a.type === 'danger').length}</p>
                                    <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1">Danger Alerts</p>
                                </div>
                            </div>
                            <div className="bg-[#1A4543] rounded-2xl p-5 shadow-lg shadow-teal-900/10 flex flex-col justify-between h-28 transition-all hover:scale-[1.02]">
                                <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center text-teal-300">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                    </svg>
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-white leading-none">{alerts.filter(a => a.status === 'resolved').length}</p>
                                    <p className="text-[10px] font-bold text-teal-100/60 tracking-wider uppercase mt-1">Resolved</p>
                                </div>
                            </div>
                        </div>

                        {/* Alerts List */}
                        <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                            <div className="px-6 py-5 border-b border-gray-50 flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-900">All Community Alerts</h3>
                                <div className="flex items-center gap-2">
                                    <button className="px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold uppercase tracking-widest">Active</button>
                                    <button className="px-3 py-1.5 text-gray-400 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-gray-50">All</button>
                                </div>
                            </div>
                            <div className="divide-y divide-gray-50">
                                {alerts.map((alert) => (
                                    <div key={alert.id} className="px-6 py-5 hover:bg-gray-50/50 transition-colors group">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-4 flex-1">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                    alert.type === 'danger' ? 'bg-red-100 text-red-600' :
                                                    alert.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                                                    'bg-blue-100 text-blue-600'
                                                }`}>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                        <path fillRule="evenodd" d="M18 3a1 1 0 00-1.447-.894L8.763 6H5a3 3 0 000 6h.28l1.771 5.316A1 1 0 008 18h1a1 1 0 001-1v-4.382l6.553 3.276A1 1 0 0018 15V3z" clipRule="evenodd" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[10px] font-bold text-gray-400">{alert.id}</span>
                                                        {getTypeBadge(alert.type)}
                                                        {getStatusBadge(alert.status)}
                                                    </div>
                                                    <h4 className="text-sm font-bold text-gray-900 mb-1">{alert.title}</h4>
                                                    <p className="text-xs text-gray-500 leading-relaxed mb-2">{alert.message}</p>
                                                    <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                        <span className="flex items-center gap-1">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                                            </svg>
                                                            {alert.area}
                                                        </span>
                                                        <span>{alert.date}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <button className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 text-[10px] font-bold text-orange-600 uppercase tracking-widest hover:bg-orange-50 rounded-lg">
                                                View
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
};

export default BrgyCommunityAlerts;
