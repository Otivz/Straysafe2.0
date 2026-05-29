import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import MapComponent from '../../components/MapComponent';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';

interface Report {
    report_id: number;
    status_id: number;
    category_id: number;
    animal_type: string;
    landmark: string;
    reporter_name?: string;
    created_at: string;
    priority_level: string;
}

interface RescueRequest {
    rescue_id: number;
    status_id: number;
}

interface ActivityItem {
    id: number;
    text: string;
    sub: string;
    icon: 'report' | 'rescue' | 'verified';
}

const categoryMap: Record<number, string> = {
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed'
};

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} minute${mins > 1 ? 's' : ''} ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
}

const SubdDashboard = () => {
    const navigate = useNavigate();

    const [reports, setReports] = useState<Report[]>([]);
    const [rescues, setRescues] = useState<RescueRequest[]>([]);
    const [petCount, setPetCount] = useState<number>(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        if (rawUser) {
            try {
                const user = JSON.parse(rawUser);
                if (user.role_id !== 2) navigate('/staff/login');
            } catch {
                navigate('/staff/login');
            }
        } else {
            navigate('/staff/login');
        }
    }, [navigate]);

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            try {
                const [reportsRes, rescuesRes, petsRes] = await Promise.allSettled([
                    axios.get('http://localhost:8000/reports/'),
                    axios.get('http://localhost:8000/rescue-requests/'),
                    axios.get('http://localhost:8000/pets/'),
                ]);
                if (reportsRes.status === 'fulfilled') setReports(reportsRes.value.data || []);
                if (rescuesRes.status === 'fulfilled') setRescues(rescuesRes.value.data || []);
                if (petsRes.status === 'fulfilled') setPetCount((petsRes.value.data || []).length);
            } catch (err) {
                console.error('Dashboard fetch error:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchAll();
    }, []);

    // Derived stats
    const pendingCount = reports.filter(r => r.status_id === 1).length;
    const verifiedCount = reports.filter(r => r.status_id === 2 || r.status_id === 13).length;
    // Active rescues = status 1 (Pending), 2 (Approved), 4 (Started), 5 (Dispatched)
    const activeRescueCount = rescues.filter(r => r.status_id >= 1 && r.status_id <= 5).length;

    // Trend chart: last 7 days
    const trendData = (() => {
        const days: { label: string; count: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const label = d.toLocaleDateString('en-US', { weekday: 'short' });
            const dateStr = d.toISOString().slice(0, 10);
            const count = reports.filter(r => r.created_at?.slice(0, 10) === dateStr).length;
            days.push({ label, count });
        }
        return days;
    })();

    const maxTrend = Math.max(...trendData.map(d => d.count), 1);

    // Recent activity: last 5 reports sorted by date
    const recentReports = [...reports]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);

    const recentActivity: ActivityItem[] = recentReports.map(r => ({
        id: r.report_id,
        text: `#${r.report_id.toString().padStart(4, '0')} — ${categoryMap[r.category_id] || 'Incident'} ${r.landmark ? `at ${r.landmark}` : ''}`,
        sub: timeAgo(r.created_at),
        icon: r.status_id === 2 ? 'verified' : r.status_id >= 5 ? 'rescue' : 'report',
    }));

    const iconMap = {
        report: (
            <svg className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z" />
            </svg>
        ),
        verified: (
            <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
        ),
        rescue: (
            <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 110 20A10 10 0 0112 2z" />
            </svg>
        ),
    };

    const statCards = [
        {
            label: 'Pending Reports',
            value: pendingCount,
            icon: (
                <svg className="h-5 w-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            bg: 'bg-amber-50',
            border: 'border-amber-100',
            textColor: 'text-amber-600',
        },
        {
            label: 'Verified Reports',
            value: verifiedCount,
            icon: (
                <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            bg: 'bg-blue-50',
            border: 'border-blue-100',
            textColor: 'text-blue-600',
        },
        {
            label: 'Active Rescue',
            value: activeRescueCount,
            icon: (
                <svg className="h-5 w-5 text-[#F97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
            bg: 'bg-orange-50',
            border: 'border-orange-100',
            textColor: 'text-[#F97316]',
        },
        {
            label: 'Registered Pets',
            value: petCount,
            icon: (
                <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
            ),
            bg: 'bg-green-50',
            border: 'border-green-100',
            textColor: 'text-green-600',
        },
    ];

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <SubdSidebar />

            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <SubdNavbar />

                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 custom-scrollbar bg-[#FAFAF9]">
                    <div className="flex flex-col gap-8">

                        {/* Header */}
                        <div>
                            <h1 className="text-3xl font-extrabold text-gray-900 mb-1">Subdivision Dashboard</h1>
                            <p className="text-gray-500 text-sm">Overview of reports, rescue operations, and registered pets.</p>
                        </div>

                        {/* Stat Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {statCards.map((card) => (
                                <div key={card.label} className={`bg-white rounded-2xl p-5 border ${card.border} shadow-sm flex items-center gap-4`}>
                                    <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center shrink-0`}>
                                        {card.icon}
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{card.label}</p>
                                        {loading ? (
                                            <div className="h-7 w-12 bg-gray-100 rounded-lg animate-pulse mt-1" />
                                        ) : (
                                            <p className={`text-3xl font-black ${card.textColor} mt-0.5`}>{card.value}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Trend Chart */}
                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-6">Incident Report Trend — Last 7 Days</h3>
                            {loading ? (
                                <div className="h-48 bg-gray-50 rounded-2xl animate-pulse" />
                            ) : (
                                <div className="flex items-end gap-3 h-48">
                                    {trendData.map((day, i) => {
                                        const heightPct = maxTrend > 0 ? (day.count / maxTrend) * 100 : 0;
                                        return (
                                            <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                                <span className="text-xs font-bold text-gray-500">{day.count > 0 ? day.count : ''}</span>
                                                <div className="w-full rounded-xl bg-gray-100 overflow-hidden" style={{ height: '140px' }}>
                                                    <div
                                                        className="w-full rounded-xl transition-all duration-700"
                                                        style={{
                                                            height: `${Math.max(heightPct, day.count > 0 ? 4 : 0)}%`,
                                                            background: i === trendData.length - 1
                                                                ? 'linear-gradient(to top, #F97316, #fb923c)'
                                                                : 'linear-gradient(to top, #fdba74, #fed7aa)',
                                                            marginTop: 'auto',
                                                            display: 'block',
                                                            position: 'relative',
                                                            top: `${100 - Math.max(heightPct, day.count > 0 ? 4 : 0)}%`
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">{day.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Map + Recent Activity side by side */}
                        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                            {/* Map */}
                            <div className="xl:col-span-3 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Incident Intelligence Map</h3>
                                <div className="w-full h-[340px] rounded-2xl overflow-hidden border border-gray-100">
                                    <MapComponent center={[14.8093, 121.0028]} zoom={16} />
                                </div>
                            </div>

                            {/* Recent Activity */}
                            <div className="xl:col-span-2 bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-col">
                                <h3 className="text-lg font-bold text-gray-900 mb-5">Recent Activity</h3>
                                {loading ? (
                                    <div className="space-y-3">
                                        {[1, 2, 3].map(i => (
                                            <div key={i} className="h-16 bg-gray-50 rounded-2xl animate-pulse" />
                                        ))}
                                    </div>
                                ) : recentActivity.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-sm text-gray-400 italic">No recent activity</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3 flex-1 overflow-y-auto">
                                        {recentActivity.map((item) => (
                                            <div key={item.id} className="border border-gray-100 rounded-2xl p-4 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                                                <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                                                    {iconMap[item.icon]}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900 leading-snug truncate">{item.text}</p>
                                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">{item.sub}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
};

export default SubdDashboard;
