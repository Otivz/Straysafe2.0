import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';

const AdminPetManagement = () => {
    const navigate = useNavigate();
    const [pets, setPets] = useState([
        {
            id: 1,
            name: 'Buddy',
            type: 'Dog',
            breed: 'Golden Retriever',
            owner: 'Juan Dela Cruz',
            status: 'Active',
            lastSeen: 'Selera Homes - Block 1',
            health: 'Healthy'
        },
        {
            id: 2,
            name: 'Luna',
            type: 'Cat',
            breed: 'Persian',
            owner: 'Maria Clara',
            status: 'Lost',
            lastSeen: 'Market Area',
            health: 'Needs Checkup'
        },
        {
            id: 3,
            name: 'Max',
            type: 'Dog',
            breed: 'Aspin',
            owner: 'Ricardo Dalisay',
            status: 'Active',
            lastSeen: 'Phase 3',
            health: 'Vaccinated'
        }
    ]);

    useEffect(() => {
        const adminUser = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
        if (!adminUser) {
            navigate('/admin/login');
        }
    }, [navigate]);

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <AdminSidebar />
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <AdminNavbar />
                <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    <div className="flex flex-col gap-8">
                        {/* Header */}
                        <div className="flex justify-between items-end">
                            <div>
                                <h1 className="text-3xl font-black text-gray-900 mb-2">Pet Management</h1>
                                <p className="text-gray-500 text-sm">Overseeing all registered pets within the StraySafe ecosystem.</p>
                            </div>
                            <div className="flex gap-3">
                                <button className="px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-black text-gray-600 shadow-sm hover:bg-gray-50 transition-all uppercase tracking-widest">
                                    Export List
                                </button>
                                <button className="px-6 py-2.5 bg-[#F97316] text-white rounded-xl text-xs font-black shadow-md hover:bg-[#EA580C] transition-all uppercase tracking-widest">
                                    Register Pet
                                </button>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-50">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Pets</p>
                                <p className="text-3xl font-black text-gray-900">1,248</p>
                                <p className="text-[10px] font-bold text-green-500 mt-2">+12 this week</p>
                            </div>
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-50">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Lost Reports</p>
                                <p className="text-3xl font-black text-red-600">14</p>
                                <p className="text-[10px] font-bold text-red-400 mt-2">Requires Attention</p>
                            </div>
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-50">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Vaccinated</p>
                                <p className="text-3xl font-black text-blue-600">82%</p>
                                <p className="text-[10px] font-bold text-blue-400 mt-2">Compliance Rate</p>
                            </div>
                            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-50">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Active Rescues</p>
                                <p className="text-3xl font-black text-orange-500">5</p>
                                <p className="text-[10px] font-bold text-orange-400 mt-2">In Progress</p>
                            </div>
                        </div>

                        {/* Pet Table */}
                        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-50 overflow-hidden">
                            <div className="px-8 py-6 border-b border-gray-50 flex justify-between items-center bg-white">
                                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Registered Pets Registry</h3>
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            placeholder="Search pets, owners, or breeds..." 
                                            className="pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-xs w-64 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                                        />
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50/50">
                                            <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pet Info</th>
                                            <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Owner</th>
                                            <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Last Seen / Location</th>
                                            <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                            <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {pets.map((pet) => (
                                            <tr key={pet.id} className="hover:bg-gray-50/50 transition-colors group">
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600 font-black text-xs">
                                                            {pet.name[0]}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-gray-900 group-hover:text-[#F97316] transition-colors">{pet.name}</p>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{pet.type} • {pet.breed}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <p className="text-xs font-bold text-gray-700">{pet.owner}</p>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <p className="text-xs text-gray-500 font-medium">{pet.lastSeen}</p>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                        pet.status === 'Active' ? 'bg-green-50 text-green-600' : 
                                                        pet.status === 'Lost' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                                    }`}>
                                                        {pet.status}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-5 text-right">
                                                    <button className="text-[10px] font-black text-gray-400 hover:text-gray-900 uppercase tracking-widest transition-colors">
                                                        View Profile
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="px-8 py-4 bg-gray-50/30 border-t border-gray-50 flex justify-between items-center">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Showing 3 of 1,248 pets</p>
                                <div className="flex gap-2">
                                    <button className="p-2 bg-white border border-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-all">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    <button className="p-2 bg-white border border-gray-100 rounded-lg text-gray-400 hover:text-gray-900 transition-all">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
};

export default AdminPetManagement;
