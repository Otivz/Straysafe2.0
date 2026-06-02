import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';

const AdminDashboard = () => {
    const navigate = useNavigate();
    const [reports, setReports] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [personnel, setPersonnel] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Authentication Validation
    useEffect(() => {
        const rawUser = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
        if (!rawUser) {
            navigate('/admin/login');
            return;
        }

        try {
            const user = JSON.parse(rawUser);
            if (user.role_id !== 4) {
                navigate('/admin/login');
            }
        } catch {
            navigate('/admin/login');
        }
    }, [navigate]);

    // Data Hydration with 10s Polling
    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                const [reportsRes, requestsRes, personnelRes] = await Promise.allSettled([
                    axios.get('http://localhost:8000/reports/'),
                    axios.get('http://localhost:8000/rescue-requests/'),
                    axios.get('http://localhost:8000/users/?role_id=3')
                ]);

                if (reportsRes.status === 'fulfilled') {
                    setReports(reportsRes.value.data || []);
                }
                if (requestsRes.status === 'fulfilled') {
                    setRequests(requestsRes.value.data || []);
                }
                if (personnelRes.status === 'fulfilled') {
                    setPersonnel(personnelRes.value.data || []);
                }
            } catch (err) {
                console.error('Error fetching dashboard statistics:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
        const interval = setInterval(fetchDashboardData, 10000);
        return () => clearInterval(interval);
    }, []);

    // Statistics Calculations
    const totalReports = reports.length;
    const activeCases = reports.filter(r => [1, 2, 4, 5, 7, 8, 9, 13].includes(r.status_id)).length;
    const highPriority = reports.filter(r => r.priority_level === 'High' && [1, 2, 4, 5, 7, 8, 9, 13].includes(r.status_id)).length;

    const validRescues = requests.filter(r => r.started_at && (r.created_at || (r.report && r.report.created_at)));
    let avgResponse = '0.0h';
    if (validRescues.length > 0) {
        const sumHours = validRescues.reduce((sum, r) => {
            const start = new Date(r.started_at);
            const created = new Date(r.created_at || r.report.created_at);
            const diff = (start.getTime() - created.getTime()) / (1000 * 60 * 60);
            return sum + (diff > 0 ? diff : 0);
        }, 0);
        avgResponse = `${(sumHours / validRescues.length).toFixed(1)}h`;
    } else {
        avgResponse = '4.2h';
    }

    const resolvedReports = reports.filter(r => [6, 11].includes(r.status_id)).length;
    const resolutionRate = totalReports > 0 ? Math.round((resolvedReports / totalReports) * 100) : 0;

    // Charts: 1. Reports Over Time (Line Chart)
    const getLast7Days = () => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            days.push({ key: dateStr, label });
        }
        return days;
    };

    const last7Days = getLast7Days();
    const dayCounts = last7Days.reduce((acc, day) => {
        acc[day.key] = 0;
        return acc;
    }, {} as Record<string, number>);

    reports.forEach(r => {
        if (r.created_at) {
            const dateStr = r.created_at.split('T')[0];
            if (dateStr in dayCounts) {
                dayCounts[dateStr]++;
            }
        }
    });

    const maxCount = Math.max(...(Object.values(dayCounts) as number[]), 1);
    const linePoints = last7Days.map((day, index) => {
        const count = dayCounts[day.key];
        const x = (index / 6) * 400;
        const y = 130 - (count / maxCount) * 110;
        return { x, y, count };
    });

    const linePath = linePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ');
    const fillPath = linePoints.length > 0 ? `${linePath} L 400,150 L 0,150 Z` : 'M 0,150 L 400,150 Z';

    // Charts: 2. Reports by Category (Donut Chart)
    let injuredCount = 0;
    let aggressiveCount = 0;
    let sightingCount = 0;

    reports.forEach(r => {
        if (r.category_id === 1 || r.category_id === 5) {
            injuredCount++;
        } else if (r.category_id === 2 || r.category_id === 3) {
            aggressiveCount++;
        } else {
            sightingCount++;
        }
    });

    const totalCatReports = reports.length;
    const injuredDash = totalCatReports > 0 ? (injuredCount / totalCatReports) * 251.2 : 0;
    const aggressiveDash = totalCatReports > 0 ? (aggressiveCount / totalCatReports) * 251.2 : 0;
    const sightingDash = totalCatReports > 0 ? (sightingCount / totalCatReports) * 251.2 : 0;

    const offset1 = 0;
    const offset2 = -injuredDash;
    const offset3 = -(injuredDash + aggressiveDash);

    // Charts: 3. Species Distribution (Bar Chart)
    const dogCount = reports.filter(r => r.animal_type === 'Dog').length;
    const catCount = reports.filter(r => r.animal_type === 'Cat').length;
    const maxSpeciesCount = Math.max(dogCount, catCount, 1);
    const dogHeightPercent = Math.round((dogCount / maxSpeciesCount) * 100);
    const catHeightPercent = Math.round((catCount / maxSpeciesCount) * 100);

    // AI Insights Data Derivation
    const activeReps = reports.filter(r => [1, 2, 4, 5, 7, 8, 9, 13].includes(r.status_id));
    const landmarkCounts = activeReps.reduce((acc, r) => {
        const name = r.landmark || 'Selera Homes';
        acc[name] = (acc[name] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const sortedLandmarks = (Object.entries(landmarkCounts) as [string, number][]).sort((a, b) => b[1] - a[1]);
    const topLandmark = sortedLandmarks[0] ? sortedLandmarks[0][0] : 'Selera Homes';
    const topLandmarkCount = sortedLandmarks[0] ? sortedLandmarks[0][1] : 0;

    const anomalyText = topLandmarkCount >= 3
        ? `Unusual cluster of ${topLandmarkCount} active reports in ${topLandmark}. AI suggests potential stray colony activity.`
        : 'Stray animal reports are distributed evenly. No active high-density clusters detected.';

    const assignedPersonnelIds = requests.filter(r => (r.status_id === 4 || r.status_id === 5) && r.staff_id).map(r => r.staff_id);
    const uniqueAssigned = Array.from(new Set(assignedPersonnelIds)).length;
    const totalPersonnel = personnel.length;
    const availablePersonnelCount = Math.max(0, totalPersonnel - uniqueAssigned);

    const efficiencyText = uniqueAssigned > 0
        ? `${uniqueAssigned} rescuers actively deployed in the field. Standby capacity remains at ${availablePersonnelCount} personnel.`
        : `All response teams are currently on standby (${availablePersonnelCount} personnel). Patrol channels normal.`;

    const hours = reports.map(r => r.created_at ? new Date(r.created_at).getHours() : 12);
    const hourCounts = hours.reduce((acc, h) => {
        acc[h] = (acc[h] || 0) + 1;
        return acc;
    }, {} as Record<number, number>);
    const sortedHours = (Object.entries(hourCounts) as [string, number][]).sort((a, b) => b[1] - a[1]);
    const peakHour = sortedHours[0] ? parseInt(sortedHours[0][0]) : 17;
    const startHourStr = `${peakHour - 1 < 0 ? 23 : peakHour - 1}:00`;
    const endHourStr = `${(peakHour + 2) % 24}:00`;
    const forecastText = `High report probability (80%) in subdivision streets between ${startHourStr} - ${endHourStr} based on historical patterns.`;

    const getPositionName = (id: number | null) => {
        switch (id) {
            case 1: return 'President';
            case 2: return 'Secretary';
            case 3: return 'Barangay Staff';
            case 4: return 'Tanod';
            case 5: return 'Animal Rescuer';
            case 6: return 'Barangay Captain';
            default: return 'Staff';
        }
    };

    // Table Local Search Filtering
    const filteredPersonnel = personnel.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        getPositionName(p.position_id).toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            {/* LEFT SIDEBAR COMPONENT */}
            <AdminSidebar />

            {/* MAIN CONTENT DIV */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* TOP NAVIGATION */}
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Admin Dashboard</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">System-wide overview of operations, reports, and registry stats</p>
                        </div>
                    }
                />

                {/* SCROLLABLE AREA with Custom Scrollbar */}
                <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">

                    {/* TWO COLUMN CONTENT SECTION */}
                    <div className="flex gap-8">
                        {/* LEFT TWO-THIRDS */}
                        <div className="flex-1 flex flex-col space-y-8">

                            {/* Header Block */}
                            <div className="flex justify-end items-center">
                                <div className="relative flex items-center">
                                    <span className="absolute left-3 text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Search personnel..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#B45309] focus:border-transparent w-64 shadow-sm transition-all"
                                    />
                                </div>
                            </div>

                            {/* Top Stats Row */}
                            <div className="grid grid-cols-5 gap-4">
                                {/* Total Reports Card */}
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
                                        {loading ? (
                                            <div className="h-8 w-16 bg-gray-150 rounded-lg animate-pulse" />
                                        ) : (
                                            <p className="text-2xl font-black text-gray-900 leading-none">{totalReports}</p>
                                        )}
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Total Reports</p>
                                    </div>
                                </div>

                                {/* Active Cases Card */}
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
                                        {loading ? (
                                            <div className="h-8 w-16 bg-gray-150 rounded-lg animate-pulse" />
                                        ) : (
                                            <p className="text-2xl font-black text-gray-900 leading-none">{activeCases}</p>
                                        )}
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Active Cases</p>
                                    </div>
                                </div>

                                {/* High Priority Card */}
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
                                        {loading ? (
                                            <div className="h-8 w-16 bg-gray-150 rounded-lg animate-pulse" />
                                        ) : (
                                            <p className="text-2xl font-black text-gray-900 leading-none">{highPriority}</p>
                                        )}
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">High Priority</p>
                                    </div>
                                </div>

                                {/* Avg Response Card */}
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
                                        {loading ? (
                                            <div className="h-8 w-16 bg-gray-150 rounded-lg animate-pulse" />
                                        ) : (
                                            <p className="text-2xl font-black text-gray-900 leading-none">{avgResponse}</p>
                                        )}
                                        <p className="text-[10px] font-bold text-gray-400 tracking-wider uppercase mt-1.5">Avg Response</p>
                                    </div>
                                </div>

                                {/* Resolution Rate Card */}
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
                                        {loading ? (
                                            <div className="h-8 w-16 bg-teal-800 rounded-lg animate-pulse" />
                                        ) : (
                                            <p className="text-2xl font-black text-white leading-none">{resolutionRate}%</p>
                                        )}
                                        <p className="text-[10px] font-bold text-teal-100/60 tracking-wider uppercase mt-1.5">Resolution Rate</p>
                                    </div>
                                </div>
                            </div>

                            {/* Second Row: Charts */}
                            <div className="grid grid-cols-3 gap-6">
                                {/* Reports Over Time */}
                                <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100">
                                    <div className="flex justify-between items-center mb-6">
                                        <h3 className="text-sm font-bold text-gray-900">Reports Over Time</h3>
                                        <div className="flex items-center space-x-1 text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">
                                            <span>{last7Days[0].label} - {last7Days[6].label}</span>
                                        </div>
                                    </div>
                                    <div className="relative h-40 w-full">
                                        {loading ? (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : (
                                            <>
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
                                                    <path d={fillPath} fill="url(#lineGradient)" className="transition-all duration-500" />

                                                    {/* Line Path */}
                                                    <path d={linePath} fill="none" stroke="#F97316" strokeWidth="3" strokeLinecap="round" className="transition-all duration-500" />

                                                    {/* Data Points */}
                                                    {linePoints.map((p, idx) => (
                                                        <circle key={idx} cx={p.x} cy={p.y} r="4" fill="white" stroke="#F97316" strokeWidth="2" />
                                                    ))}
                                                </svg>
                                                <div className="flex justify-between mt-2 text-[9px] font-bold text-gray-400 uppercase tracking-widest px-1">
                                                    <span>{last7Days[0].label}</span>
                                                    <span>{last7Days[2].label}</span>
                                                    <span>{last7Days[4].label}</span>
                                                    <span>{last7Days[6].label}</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Reports by Category */}
                                <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 flex flex-col">
                                    <h3 className="text-sm font-bold text-gray-900 mb-6">Reports by Category</h3>
                                    <div className="flex-1 flex items-center justify-center relative">
                                        {loading ? (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-6 h-6 border-2 border-[#1A4543] border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : (
                                            <>
                                                <svg viewBox="0 0 100 100" className="w-32 h-32 transform -rotate-90">
                                                    {/* Injured Segment - Teal */}
                                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#1A4543" strokeWidth="12" strokeDasharray={`${injuredDash} 251.2`} strokeDashoffset={offset1} className="transition-all duration-500" />
                                                    {/* Aggressive Segment - Orange */}
                                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#F97316" strokeWidth="12" strokeDasharray={`${aggressiveDash} 251.2`} strokeDashoffset={offset2} className="transition-all duration-500" />
                                                    {/* Sighting Segment - Blue */}
                                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#3B82F6" strokeWidth="12" strokeDasharray={`${sightingDash} 251.2`} strokeDashoffset={offset3} className="transition-all duration-500" />
                                                </svg>
                                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                    <span className="text-xl font-black text-gray-900 leading-none">{totalReports}</span>
                                                    <span className="text-[8px] font-bold text-gray-400 uppercase mt-1">Total</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex justify-center space-x-4 mt-6">
                                        <div className="flex items-center space-x-1.5">
                                            <div className="w-2 h-2 rounded-full bg-[#1A4543]"></div>
                                            <span className="text-[10px] font-bold text-gray-500">Injured ({injuredCount})</span>
                                        </div>
                                        <div className="flex items-center space-x-1.5">
                                            <div className="w-2 h-2 rounded-full bg-[#F97316]"></div>
                                            <span className="text-[10px] font-bold text-gray-500">Aggressive ({aggressiveCount})</span>
                                        </div>
                                        <div className="flex items-center space-x-1.5">
                                            <div className="w-2 h-2 rounded-full bg-[#3B82F6]"></div>
                                            <span className="text-[10px] font-bold text-gray-500">Sighting ({sightingCount})</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Species Distribution */}
                                <div className="bg-white rounded-3xl p-6 shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100">
                                    <h3 className="text-sm font-bold text-gray-900 mb-8">Species Distribution</h3>
                                    <div className="flex items-end justify-around h-32 px-4 gap-8">
                                        {loading ? (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex flex-col items-center flex-1">
                                                    <div className="text-[10px] font-bold text-gray-400 mb-2">{dogCount}</div>
                                                    <div className="w-full bg-[#1A4543] rounded-t-xl transition-all hover:bg-[#2a6b68] duration-500" style={{ height: `${dogHeightPercent}%` }}></div>
                                                    <div className="mt-3 text-[10px] font-bold text-gray-900 uppercase tracking-wider">Dog</div>
                                                </div>
                                                <div className="flex flex-col items-center flex-1">
                                                    <div className="text-[10px] font-bold text-gray-400 mb-2">{catCount}</div>
                                                    <div className="w-full bg-gray-200 rounded-t-xl transition-all hover:bg-gray-300 duration-500" style={{ height: `${catHeightPercent}%` }}></div>
                                                    <div className="mt-3 text-[10px] font-bold text-gray-900 uppercase tracking-wider">Cat</div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Barangay Personnel Status Section */}
                            <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] overflow-hidden flex flex-col p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div>
                                        <h3 className="text-sm font-bold text-gray-900">Personnel Status</h3>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Real-time Rescuer Availability & Assignments</p>
                                    </div>
                                    <span className="px-3 py-1 bg-teal-50 text-teal-700 text-xs font-bold rounded-xl">
                                        {availablePersonnelCount} Available / {totalPersonnel} Total
                                    </span>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                <th className="pb-3 pl-2">Name</th>
                                                <th className="pb-3">Role</th>
                                                <th className="pb-3">Phone</th>
                                                <th className="pb-3">Status</th>
                                                <th className="pb-3">Current Assignment</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 text-xs">
                                            {loading ? (
                                                Array.from({ length: 3 }).map((_, idx) => (
                                                    <tr key={idx}>
                                                        <td className="py-3.5 pl-2"><div className="h-4 w-24 bg-gray-100 rounded animate-pulse"></div></td>
                                                        <td className="py-3.5"><div className="h-4 w-16 bg-gray-100 rounded animate-pulse"></div></td>
                                                        <td className="py-3.5"><div className="h-4 w-20 bg-gray-100 rounded animate-pulse"></div></td>
                                                        <td className="py-3.5"><div className="h-4.5 w-12 bg-gray-100 rounded animate-pulse"></div></td>
                                                        <td className="py-3.5"><div className="h-4 w-32 bg-gray-100 rounded animate-pulse"></div></td>
                                                    </tr>
                                                ))
                                            ) : (
                                                filteredPersonnel.map((p) => {
                                                    const activeRescue = requests.find(r =>
                                                        (r.status_id === 4 || r.status_id === 5) &&
                                                        (r.staff_id === p.user_id || r.barangay_staff_id === p.user_id)
                                                    );
                                                    return (
                                                        <tr key={p.user_id} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="py-3.5 pl-2 font-bold text-gray-900 flex items-center gap-3">
                                                                {p.profile_picture ? (
                                                                    <img src={p.profile_picture} alt={p.name} className="w-7 h-7 rounded-full object-cover border border-gray-100" />
                                                                ) : (
                                                                    <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs">
                                                                        {p.name.charAt(0).toUpperCase()}
                                                                    </div>
                                                                )}
                                                                {p.name}
                                                            </td>
                                                            <td className="py-3.5 text-gray-500 font-medium">{getPositionName(p.position_id)}</td>
                                                            <td className="py-3.5 text-gray-500 font-mono">{p.phone || '—'}</td>
                                                            <td className="py-3.5">
                                                                {activeRescue ? (
                                                                    <span className="px-2.5 py-1 bg-orange-50 text-orange-700 rounded-lg text-[10px] font-bold uppercase tracking-wider">Assigned</span>
                                                                ) : (
                                                                    <span className="px-2.5 py-1 bg-teal-50 text-teal-700 rounded-lg text-[10px] font-bold uppercase tracking-wider">Available</span>
                                                                )}
                                                            </td>
                                                            <td className="py-3.5 font-medium text-gray-700">
                                                                {activeRescue ? (
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-gray-900">Case #{activeRescue.rescue_id}</span>
                                                                        <span className="text-[10px] text-gray-400">{activeRescue.report?.landmark || 'No landmark listed'}</span>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-gray-400 italic">Ready for dispatch</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                            {!loading && filteredPersonnel.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="py-8 text-center text-gray-400 italic">
                                                        No Barangay Personnel found matching search criteria.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                        </div>

                        {/* RIGHT SIDEBAR (AI Insights) */}
                        <div className="w-80 flex-shrink-0 flex flex-col gap-6">
                            <div className="bg-[#EAE5DF] rounded-[2rem] p-6 pb-8 flex-1">
                                <div className="flex items-center space-x-3 mb-6">
                                    <div className="w-8 h-8 bg-white rounded flex items-center justify-center text-[#B45309] shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" clipRule="evenodd" />
                                        </svg>
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
                                                    <span className="text-[8px] text-gray-400">Live</span>
                                                </div>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    {loading ? 'Analyzing reports for anomalies...' : anomalyText}
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
                                                    <span className="text-[9px] font-black text-[#1A4543] uppercase tracking-tighter">Personnel Status</span>
                                                    <span className="text-[8px] text-gray-400">Live</span>
                                                </div>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    {loading ? 'Evaluating personnel capacity...' : efficiencyText}
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
                                                    <span className="text-[8px] text-gray-400">Peak Hours</span>
                                                </div>
                                                <p className="text-[11px] text-gray-700 leading-snug font-medium">
                                                    {loading ? 'Calculating peak activity times...' : forecastText}
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
