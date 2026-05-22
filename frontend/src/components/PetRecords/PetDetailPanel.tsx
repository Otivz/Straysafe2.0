import React, { useState } from 'react';
import Button from '../Button';
import { type PetRecord } from './types';

interface PetDetailPanelProps {
    pet: PetRecord | null;
    onClose?: () => void;
}

const PetDetailPanel: React.FC<PetDetailPanelProps> = ({ pet, onClose }) => {
    const [activeTab, setActiveTab] = useState<'vaccination' | 'case' | 'ownership'>('vaccination');

    if (!pet) return null;

    return (
        <div className="bg-[#F8FAFC] w-full h-full flex flex-col animate-in fade-in duration-500 overflow-hidden">
            {/* Header */}
            <header className="shrink-0 z-30 bg-white/80 backdrop-blur-md px-8 py-5 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-black text-[#B35D25] tracking-tight">Pet Information</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Content Area - Now internally scrollable */}
            <div className="flex-1 overflow-y-auto p-10 pt-12 space-y-12 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                {/* Hero Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                    {/* Hero Image */}
                    <div className="lg:col-span-2 relative h-[450px] rounded-[3rem] overflow-hidden shadow-2xl group cursor-pointer border-4 border-transparent hover:border-[#B35D25]/30 hover:shadow-[#B35D25]/20 transition-all duration-500">
                        <img 
                            src={pet.avatar} 
                            alt={pet.name} 
                            className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                        <div className="absolute inset-0 bg-[#B35D25]/0 group-hover:bg-[#B35D25]/20 transition-colors duration-700 mix-blend-overlay"></div>
                        <div className="absolute bottom-10 left-10 text-white">
                            <h2 className="text-6xl font-black mb-2 tracking-tighter">{pet.name}</h2>
                            <p className="text-lg font-bold text-gray-200 uppercase tracking-widest opacity-90">{pet.breed} • {pet.gender}</p>
                        </div>
                    </div>

                    {/* Vitals & AI Column */}
                    <div className="space-y-6">
                        {/* Vitals Card */}
                        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-gray-200/50 border-l-8 border-[#F97316]">
                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-8">Vital Statistics</h3>
                            <div className="space-y-6">
                                <div className="flex justify-between items-center">
                                    <span className="text-base font-bold text-gray-500">Age</span>
                                    <span className="text-lg font-black text-gray-900">{pet.age} Years</span>
                                </div>
                                <div className="border-t border-gray-50"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-base font-bold text-gray-500">Weight</span>
                                    <span className="text-lg font-black text-gray-900">{pet.weight || '32.5 kg'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Contact Button */}
                        <button className="w-full py-5 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-orange-900/10 flex items-center justify-center gap-3 transition-all">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            Contact Owner
                        </button>

                    </div>
                </div>

                {/* Tabs & Content */}
                <div className="space-y-10">
                    <div className="flex items-center gap-12 border-b border-gray-100">
                        {['Vaccination', 'Case History', 'Ownership'].map((tab) => (
                            <button 
                                key={tab}
                                onClick={() => setActiveTab(tab.toLowerCase().split(' ')[0] as any)}
                                className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${
                                    activeTab === tab.toLowerCase().split(' ')[0] ? 'text-[#B35D25]' : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                {tab}
                                {activeTab === tab.toLowerCase().split(' ')[0] && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#B35D25] rounded-t-full"></div>
                                )}
                            </button>
                        ))}
                    </div>

                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {activeTab === 'vaccination' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center text-green-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h4 className="text-2xl font-black text-gray-900 tracking-tight">Vaccination Status</h4>
                                </div>

                                <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 flex items-center justify-between">
                                    <div>
                                        <h5 className="text-lg font-black text-gray-900 mb-1">Rabies & Core Vaccines</h5>
                                        <p className="text-sm text-gray-500 font-medium">Status based on subdivision registry records.</p>
                                    </div>
                                    <div className={`px-6 py-3 rounded-xl font-black uppercase tracking-widest text-sm flex items-center gap-2 ${pet.status === 'VACCINATED' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                        {pet.status === 'VACCINATED' ? (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                </svg>
                                                Vaccinated
                                            </>
                                        ) : (
                                            <>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                                </svg>
                                                Not Vaccinated
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'case' && (
                            <div className="space-y-8">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <h4 className="text-2xl font-black text-gray-900 tracking-tight">Past Reports</h4>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 flex gap-6 items-center hover:shadow-md transition-shadow">
                                        <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h5 className="text-lg font-black text-gray-900 mb-1">Reported Found (Temporary)</h5>
                                            <p className="text-sm text-gray-500 font-medium mb-3">Briefly separated from owner at Oakwood Park. Scanning chip identified owner instantly.</p>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Case #4429 • Mar 20, 2022</p>
                                        </div>
                                    </div>

                                    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 flex gap-6 items-center hover:shadow-md transition-shadow">
                                        <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 shrink-0">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <h5 className="text-lg font-black text-gray-900 mb-1">Registration Updated</h5>
                                            <p className="text-sm text-gray-500 font-medium mb-3">Address and secondary emergency contact details updated in national database.</p>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Update #1105 • Jan 15, 2021</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'ownership' && (
                            <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                {/* Owner Profile Card */}
                                <div className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/50 border border-gray-100 flex flex-col md:flex-row p-8 gap-8 items-start">
                                    <div className="w-40 h-40 shrink-0">
                                        <img 
                                            src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&h=800&auto=format&fit=crop" 
                                            alt="Owner" 
                                            className="w-full h-full object-cover rounded-[1.5rem] shadow-md" 
                                        />
                                    </div>
                                    <div className="flex-1 space-y-8">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h3 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">{pet.ownerName}</h3>
                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm5 3h1a1 1 0 011 1v1H9v-1a1 1 0 011-1h1z" />
                                                    </svg>
                                                    Account #P-98421 • Member since May 2021
                                                </p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="flex gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-[#F97316] shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Phone</p>
                                                    <p className="text-sm font-black text-gray-900">+1 (555) 234-8901</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-[#F97316] shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 00-2 2z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Email</p>
                                                    <p className="text-sm font-black text-gray-900">{pet.ownerEmail}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-4 border-t border-gray-50 pt-8">
                                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-[#F97316] shrink-0">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                            </div>
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Residential Address</p>
                                                <p className="text-sm font-black text-gray-900 leading-relaxed">
                                                    742 Maplewood Avenue,<br />
                                                    Highland Park, IL 60035
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Registered Pets Section */}
                                <div className="space-y-8">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-2xl font-black text-gray-900 tracking-tight">Registered Pets</h4>
                                        <button className="text-[10px] font-black text-[#F97316] uppercase tracking-widest hover:underline flex items-center gap-2">
                                            <span>+</span> Register New Pet
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex gap-6 items-center hover:shadow-md transition-shadow">
                                            <img 
                                                src={pet.avatar} 
                                                alt="Other Pet" 
                                                className="w-20 h-20 rounded-2xl object-cover shrink-0" 
                                            />
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h5 className="text-lg font-black text-gray-900">{pet.name}</h5>
                                                </div>
                                                <p className="text-xs font-bold text-gray-400 mb-4">{pet.breed} • {pet.age} Years</p>
                                                <div className="flex justify-between items-center">
                                                    <div className="flex gap-1">
                                                        <div className="w-5 h-5 rounded-full bg-orange-50 text-[8px] font-black flex items-center justify-center text-[#F97316]">V</div>
                                                        <div className="w-5 h-5 rounded-full bg-blue-50 text-[8px] font-black flex items-center justify-center text-blue-600">C</div>
                                                    </div>
                                                    <p className="text-[8px] font-black text-gray-400 italic">Next visit: Oct 12, 2024</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 flex gap-6 items-center hover:shadow-md transition-shadow">
                                            <img 
                                                src="https://images.unsplash.com/photo-1513245543132-31f507417b26?q=80&w=400&h=400&auto=format&fit=crop" 
                                                alt="Other Pet" 
                                                className="w-20 h-20 rounded-2xl object-cover shrink-0" 
                                            />
                                            <div className="flex-1">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h5 className="text-lg font-black text-gray-900">Luna</h5>
                                                </div>
                                                <p className="text-xs font-bold text-gray-400 mb-4">Siamese Cat • 2 Years</p>
                                                <div className="flex justify-between items-center">
                                                    <div className="w-5 h-5 rounded-full bg-red-50 text-[8px] font-black flex items-center justify-center text-red-600">M</div>
                                                    <p className="text-[8px] font-black text-gray-400 italic">Refill due in 3 days</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PetDetailPanel;
