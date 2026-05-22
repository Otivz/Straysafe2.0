import { useState } from 'react';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import StatCard from '../../components/PetRecords/StatCard';
import PetTable from '../../components/PetRecords/PetTable';
import { type PetRecord } from '../../components/PetRecords/types';
import Button from '../../components/Button';

const PetRecords = () => {
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800">
            {/* Sidebar */}
            <AdminSidebar />

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <AdminNavbar />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-10 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    {/* Header */}
                    <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 mb-2">Pet Registry</h1>
                            <p className="text-gray-500 text-sm font-medium">Manage and monitor all registered animals within the PetOps network.</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="relative flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search by name, breed or owner..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#B35D25] focus:border-transparent w-72 shadow-sm transition-all"
                                />
                            </div>
                            <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                </svg>
                                Filters
                            </button>
                            <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 shadow-sm hover:bg-gray-50 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Export
                            </button>
                            <Button 
                                variant="primary" 
                                className="px-6 py-2.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-xl shadow-lg shadow-orange-900/10 flex items-center gap-2 font-black text-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                Add New Pet
                            </Button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <StatCard 
                            label="Total Registered" 
                            value="1,284" 
                            badge="+12%" 
                            badgeVariant="warning"
                        />
                        <StatCard 
                            label="Fully Vaccinated" 
                            value="942" 
                            badge="73%" 
                            badgeVariant="info"
                        />
                        <StatCard 
                            label="Medical Alerts" 
                            value="42" 
                            badge="High Risk" 
                            badgeVariant="error"
                        />
                        <StatCard 
                            label="Pending Records" 
                            value="18" 
                            badge="Attention" 
                            badgeVariant="info"
                        />
                    </div>

                    {/* Table Section */}
                    <div className="flex flex-col gap-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-black text-gray-900">Active Records</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Showing 1-10 of 1,284</p>
                        </div>
                        <PetTable 
                            onSelectPet={setSelectedPet} 
                            selectedPetId={selectedPet?.id || null} 
                            searchTerm={searchTerm}
                        />
                    </div>

                    {/* Bottom Sections Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 pb-10">
                        {/* Registration Trends Placeholder */}
                        <div className="lg:col-span-2 bg-[#F9F7F5] rounded-[2.5rem] p-10 border border-orange-100/50">
                            <h3 className="text-2xl font-black text-gray-900 mb-2">Registration Trends</h3>
                            <p className="text-gray-500 text-sm font-medium mb-8">Registry volume has increased by 22% this quarter. AI models suggest potential seasonal peaks in vaccination renewals.</p>
                            
                            {/* Simple chart placeholder */}
                            <div className="h-48 w-full flex items-end justify-between gap-4 px-4">
                                {[40, 60, 45, 90, 65, 80, 50, 70, 85, 60].map((h, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center group">
                                        <div 
                                            className="w-full bg-[#B35D25]/10 group-hover:bg-[#B35D25]/20 rounded-t-xl transition-all" 
                                            style={{ height: `${h}%` }}
                                        ></div>
                                        <div className="h-1 w-full bg-[#B35D25] opacity-0 group-hover:opacity-100 transition-opacity rounded-full mt-1"></div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Quick Actions Placeholder */}
                        <div className="bg-white rounded-[2.5rem] p-10 shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col gap-8">
                            <div>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Quick Action</h3>
                                <div className="space-y-4">
                                    <button className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-2xl flex items-center justify-between transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#B35D25] shadow-sm">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                            <span className="text-sm font-bold text-gray-900">Bulk Renew</span>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300 group-hover:text-gray-600 transition-colors" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                    <button className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-2xl flex items-center justify-between transition-all group">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M15 8a3 3 0 11-6 0 3 3 0 016 0zM1.75 5.14a1 1 0 011.056.085l2.794 2.096a1 1 0 010 1.6l-2.794 2.096A1 1 0 011 10.14V5.14a1 1 0 01.75-.956z" />
                                                </svg>
                                            </div>
                                            <span className="text-sm font-bold text-gray-900">Print Records</span>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300 group-hover:text-gray-600 transition-colors" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
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

export default PetRecords;
