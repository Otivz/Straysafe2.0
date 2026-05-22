import { useState } from 'react';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import DataTable from '../../components/DataTable';

interface ObservedAnimal {
    id: string;
    animal_type: string;
    breed: string;
    capture_date: string;
    location: string;
    status: 'Observation' | 'Impounded' | 'Released' | 'Adopted';
    health: 'Healthy' | 'Needs Attention' | 'Critical';
    image_url?: string;
}

const BrgyMonitoring = () => {
    const [loading] = useState(false);

    const mockAnimals: ObservedAnimal[] = [
        {
            id: "ANM-001",
            animal_type: "Dog",
            breed: "Aspin",
            capture_date: "2024-05-12",
            location: "Selera Homes Phase 1",
            status: "Observation",
            health: "Healthy",
            image_url: "https://res.cloudinary.com/demo/image/upload/v1625211149/sample.jpg"
        },
        {
            id: "ANM-002",
            animal_type: "Cat",
            breed: "Stray",
            capture_date: "2024-05-10",
            location: "Public Market Perimeter",
            status: "Impounded",
            health: "Needs Attention",
            image_url: "https://res.cloudinary.com/demo/image/upload/v1625211149/sample.jpg"
        },
        {
            id: "ANM-003",
            animal_type: "Dog",
            breed: "German Shepherd Mix",
            capture_date: "2024-05-08",
            location: "North Creek Area",
            status: "Adopted",
            health: "Healthy",
            image_url: "https://res.cloudinary.com/demo/image/upload/v1625211149/sample.jpg"
        }
    ];

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'Observation': return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'Impounded': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'Released': return 'bg-gray-50 text-gray-600 border-gray-100';
            case 'Adopted': return 'bg-green-50 text-green-600 border-green-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const getHealthStyle = (health: string) => {
        switch (health) {
            case 'Healthy': return 'text-green-500';
            case 'Needs Attention': return 'text-amber-500';
            case 'Critical': return 'text-red-500';
            default: return 'text-gray-400';
        }
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <BrgySidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <BrgyNavbar />

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        
                        {/* Header Section */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Observation Hub</h1>
                                <p className="text-gray-500 text-sm mt-1">Manage and monitor captured strays currently in facility care.</p>
                            </div>
                            <div className="flex items-center space-x-3">
                                <button className="px-6 py-2.5 bg-gray-900 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-orange-600 transition-all shadow-lg shadow-gray-200">
                                    Register New Capture
                                </button>
                            </div>
                        </div>

                        {/* Facility Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            {[
                                { label: 'In Observation', value: '14', color: 'bg-blue-500' },
                                { label: 'Impounded', value: '28', color: 'bg-amber-500' },
                                { label: 'Ready for Adoption', value: '6', color: 'bg-green-500' },
                                { label: 'Critical Cases', value: '2', color: 'bg-red-500' },
                            ].map((stat, i) => (
                                <div key={i} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className={`w-2 h-2 rounded-full ${stat.color}`}></div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{stat.label}</span>
                                    </div>
                                    <div className="text-3xl font-black text-gray-900">{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Animals Table */}
                        <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
                            <DataTable
                                loading={loading}
                                data={mockAnimals}
                                emptyMessage="No animals currently in observation."
                                loadingMessage="Syncing facility records..."
                                columns={[
                                    {
                                        header: "Animal ID",
                                        key: "id",
                                        render: (a) => (
                                            <div className="flex items-center space-x-3">
                                                <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden border border-gray-200">
                                                    <img src={a.image_url} alt="" className="w-full h-full object-cover" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-gray-900">{a.id}</span>
                                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{a.animal_type} • {a.breed}</span>
                                                </div>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Capture Info",
                                        key: "capture",
                                        render: (a) => (
                                            <div className="flex flex-col">
                                                <span className="text-xs font-semibold text-gray-700">{a.capture_date}</span>
                                                <span className="text-[10px] text-gray-400 font-medium">{a.location}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Facility Status",
                                        key: "status",
                                        render: (a) => (
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusStyle(a.status)}`}>
                                                {a.status}
                                            </span>
                                        )
                                    },
                                    {
                                        header: "Health Condition",
                                        key: "health",
                                        render: (a) => (
                                            <div className="flex items-center space-x-2">
                                                <div className={`w-1.5 h-1.5 rounded-full bg-current ${getHealthStyle(a.health)}`}></div>
                                                <span className={`text-xs font-bold ${getHealthStyle(a.health)}`}>{a.health}</span>
                                            </div>
                                        )
                                    },
                                    {
                                        header: "Actions",
                                        key: "actions",
                                        render: () => (
                                            <div className="flex items-center space-x-4">
                                                <button className="text-[10px] font-black text-[#F97316] uppercase tracking-widest hover:underline">
                                                    Logs
                                                </button>
                                                <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline">
                                                    Edit
                                                </button>
                                            </div>
                                        )
                                    }
                                ]}
                            />
                        </div>

                    </div>
                </main>
            </div>
        </div>
    );
};

export default BrgyMonitoring;
