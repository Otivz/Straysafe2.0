import React, { useState } from 'react';
import { type PetRecord } from './types';
import Button from '../Button';

interface AddPetModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AddPetModal: React.FC<AddPetModalProps> = ({ isOpen, onClose }) => {
    const [step, setStep] = useState(1);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 sm:p-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-3xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300 bg-white overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <header className="shrink-0 z-30 bg-white/80 backdrop-blur-md px-8 py-6 flex items-center justify-between border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Register New Pet</h2>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Step {step} of 2 • {step === 1 ? 'Pet Details' : 'Owner Information'}</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    {step === 1 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                            
                            {/* Photo Upload */}
                            <div className="flex flex-col items-center justify-center w-full">
                                <div className="w-32 h-32 rounded-[2rem] border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:border-[#B35D25] hover:bg-orange-50 hover:text-[#B35D25] transition-all cursor-pointer group">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-2 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Upload Photo</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Pet Name</label>
                                    <input type="text" placeholder="e.g. Bella" className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Species</label>
                                    <select className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all appearance-none cursor-pointer">
                                        <option value="" disabled selected>Select Species...</option>
                                        <option value="Canine" className="text-gray-900">Canine (Dog)</option>
                                        <option value="Feline" className="text-gray-900">Feline (Cat)</option>
                                        <option value="Other" className="text-gray-900">Other</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Breed</label>
                                    <input type="text" placeholder="e.g. Golden Retriever" className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Age</label>
                                    <input type="text" placeholder="e.g. 2 Years" className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Gender</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button className="py-3.5 bg-white border-2 border-gray-100 hover:border-[#B35D25] rounded-2xl text-sm font-black text-gray-600 hover:text-[#B35D25] transition-all">Male</button>
                                        <button className="py-3.5 bg-white border-2 border-gray-100 hover:border-[#B35D25] rounded-2xl text-sm font-black text-gray-600 hover:text-[#B35D25] transition-all">Female</button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Weight (Optional)</label>
                                    <input type="text" placeholder="e.g. 15 kg" className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Vaccinated?</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button className="py-3.5 bg-white border-2 border-gray-100 hover:border-[#B35D25] rounded-2xl text-sm font-black text-gray-600 hover:text-[#B35D25] transition-all">Yes</button>
                                        <button className="py-3.5 bg-white border-2 border-gray-100 hover:border-[#B35D25] rounded-2xl text-sm font-black text-gray-600 hover:text-[#B35D25] transition-all">No</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                            
                            {/* Owner Photo Upload */}
                            <div className="flex flex-col items-center justify-center w-full">
                                <div className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:border-[#B35D25] hover:bg-orange-50 hover:text-[#B35D25] transition-all cursor-pointer group">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mb-1 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-center">Owner<br/>Photo</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="col-span-1 md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Owner Name</label>
                                    <input type="text" placeholder="e.g. Sarah Jenkins" className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Email Address</label>
                                    <input type="email" placeholder="sarah.j@example.com" className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Phone Number</label>
                                    <input type="tel" placeholder="+1 (555) 000-0000" className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" />
                                </div>
                                <div className="col-span-1 md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Residential Address</label>
                                    <textarea rows={3} placeholder="Full address within subdivision..." className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all resize-none"></textarea>
                                </div>

                            </div>
                        </div>
                    )}
                </div>

                {/* Footer / Actions */}
                <footer className="shrink-0 z-30 bg-gray-50 px-8 py-5 flex items-center justify-between border-t border-gray-100">
                    <button 
                        onClick={() => step > 1 ? setStep(step - 1) : onClose()} 
                        className="px-6 py-2.5 text-sm font-black text-gray-500 hover:text-gray-800 transition-colors"
                    >
                        {step === 1 ? 'Cancel' : 'Back'}
                    </button>
                    
                    {step === 1 ? (
                        <Button 
                            variant="primary" 
                            onClick={() => setStep(2)}
                            className="px-8 py-2.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-xl shadow-lg shadow-orange-900/10 font-black text-sm transition-all flex items-center gap-2"
                        >
                            Next Step
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                            </svg>
                        </Button>
                    ) : (
                        <Button 
                            variant="primary" 
                            onClick={onClose}
                            className="px-8 py-2.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-xl shadow-lg shadow-orange-900/10 font-black text-sm transition-all flex items-center gap-2"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            Complete Registration
                        </Button>
                    )}
                </footer>

            </div>
        </div>
    );
};

export default AddPetModal;
