import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';

export interface ResolveLostPetModalProps {
    isOpen: boolean;
    onClose: () => void;
    pet: {
        pet_id: number;
        pet_name: string;
        photo_url?: string;
        breed?: string;
        pet_type?: string;
        species?: string;
    };
    reportId?: number | null;
    onSuccess?: (resolution: { choiceKey: string; petStatus: string; remarks: string }) => void;
}

type PrimaryChoiceKey = 'pet_found' | 'deceased' | 'not_found' | 'withdrawn';
type SubChoiceKey = 'returned_to_owner' | 'temporary_care' | 'owner_not_located';

export const ResolveLostPetModal: React.FC<ResolveLostPetModalProps> = ({
    isOpen,
    onClose,
    pet,
    reportId,
    onSuccess
}) => {
    const [primaryChoice, setPrimaryChoice] = useState<PrimaryChoiceKey>('pet_found');
    const [subChoice, setSubChoice] = useState<SubChoiceKey>('returned_to_owner');
    const [location, setLocation] = useState<string>('');
    const [remarks, setRemarks] = useState<string>('The lost pet was located alive and safely returned to the owner.');
    const [proofPhoto, setProofPhoto] = useState<File | null>(null);
    const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [activeReportId, setActiveReportId] = useState<number | null>(reportId || null);

    // Look for linked active report if reportId is not supplied
    useEffect(() => {
        if (!isOpen) return;

        if (reportId) {
            setActiveReportId(reportId);
            return;
        }

        const fetchPetReport = async () => {
            try {
                const res = await api.get('/reports/', { params: { limit: 50 } });
                const reports = res.data?.reports || res.data || [];
                const matchingReport = reports.find((r: any) => 
                    r.pet_id === pet.pet_id || 
                    (r.description && r.description.includes(`pet: ${pet.pet_name}`))
                );
                if (matchingReport) {
                    setActiveReportId(matchingReport.report_id);
                }
            } catch (err) {
                console.error("Failed to fetch linked report for pet:", err);
            }
        };

        fetchPetReport();
    }, [isOpen, reportId, pet.pet_id, pet.pet_name]);

    // Update remarks automatically when choices change
    const updateRemarks = (primary: PrimaryChoiceKey, sub: SubChoiceKey) => {
        if (primary === 'pet_found') {
            if (sub === 'returned_to_owner') {
                setRemarks('The lost pet was located alive and safely returned to the owner. Identity and ownership confirmed.');
            } else if (sub === 'temporary_care') {
                setRemarks('The pet was found alive and is currently under temporary care by a rescuer/shelter while coordinating with the owner.');
            } else if (sub === 'owner_not_located') {
                setRemarks('The pet was found alive in the neighborhood, but the owner has not been located or contacted yet.');
            }
        } else if (primary === 'deceased') {
            setRemarks('The lost pet was sadly confirmed deceased.');
        } else if (primary === 'not_found') {
            setRemarks('A neighborhood search was conducted but the pet could not be located. Active search broadcast concluded.');
        } else if (primary === 'withdrawn') {
            setRemarks('The lost pet report was withdrawn and closed upon request by the owner.');
        }
    };

    const handlePrimarySelect = (key: PrimaryChoiceKey) => {
        setPrimaryChoice(key);
        updateRemarks(key, subChoice);
    };

    const handleSubSelect = (key: SubChoiceKey) => {
        setSubChoice(key);
        updateRemarks('pet_found', key);
    };

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProofPhoto(file);
            setProofPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleClose = () => {
        if (isSubmitting) return;
        setProofPhoto(null);
        setProofPreviewUrl(null);
        setPrimaryChoice('pet_found');
        setSubChoice('returned_to_owner');
        onClose();
    };

    const getResolutionMeta = () => {
        if (primaryChoice === 'pet_found') {
            if (subChoice === 'returned_to_owner') {
                return {
                    choiceKey: 'returned_to_owner',
                    title: 'Returned to Owner',
                    petStatus: 'Active',
                    reportStatusId: 9, // Claimed by Owner / Reunited
                    badgeText: 'Reunited',
                    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                };
            } else if (subChoice === 'temporary_care') {
                return {
                    choiceKey: 'temporary_care',
                    title: 'Found — Under Temporary Care',
                    petStatus: 'Rescued',
                    reportStatusId: 7, // Under Observation / Care
                    badgeText: 'Temporary Care',
                    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
                };
            } else {
                return {
                    choiceKey: 'owner_not_located',
                    title: 'Found — Owner Not Yet Located',
                    petStatus: 'Found',
                    reportStatusId: 4, // In Progress
                    badgeText: 'Pending Owner',
                    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
                };
            }
        } else if (primaryChoice === 'deceased') {
            return {
                choiceKey: 'deceased',
                title: 'Confirmed Deceased',
                petStatus: 'Deceased',
                reportStatusId: 12, // Deceased
                badgeText: 'Deceased',
                badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
            };
        } else if (primaryChoice === 'not_found') {
            return {
                choiceKey: 'not_found_concluded',
                title: 'Not Found / Search Concluded',
                petStatus: 'Active',
                reportStatusId: 11, // Resolved
                badgeText: 'Search Concluded',
                badgeColor: 'bg-stone-100 text-stone-700 border-stone-300'
            };
        } else {
            return {
                choiceKey: 'withdrawn_by_owner',
                title: 'Report Withdrawn by Owner',
                petStatus: 'Active',
                reportStatusId: 11, // Resolved
                badgeText: 'Withdrawn',
                badgeColor: 'bg-gray-100 text-gray-700 border-gray-300'
            };
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const meta = getResolutionMeta();

        setIsSubmitting(true);
        try {
            // 1. Update pet status in DB
            await api.put(`/pets/${pet.pet_id}`, {
                status: meta.petStatus
            });

            // 2. Build full remarks including location & notes
            const finalRemarksParts: string[] = [remarks.trim()];
            if (location.trim()) {
                finalRemarksParts.push(`Location: ${location.trim()}`);
            }
            finalRemarksParts.push(`Resolution: ${meta.title}`);
            const finalRemarks = finalRemarksParts.join(' | ');

            // 3. Update report status if report ID is identified
            if (activeReportId) {
                try {
                    const userStr = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user') || localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
                    const currentUser = userStr ? JSON.parse(userStr) : null;
                    const statusRes = await api.patch(`/reports/${activeReportId}/status`, {
                        status_id: meta.reportStatusId,
                        remarks: finalRemarks,
                        user_id: currentUser?.user_id || currentUser?.id,
                        animal_condition: primaryChoice === 'deceased' ? 'Deceased' : 'Healthy'
                    });

                    // 4. Upload proof / reunion photo if provided
                    if (proofPhoto) {
                        const formData = new FormData();
                        formData.append('file', proofPhoto);
                        formData.append('is_evidence', 'true');
                        formData.append('status_id', meta.reportStatusId.toString());

                        const histories = statusRes.data?.history || [];
                        const latestHistory = histories[histories.length - 1];
                        if (latestHistory?.history_id) {
                            formData.append('history_id', latestHistory.history_id.toString());
                        }

                        await axios.post(`http://localhost:8000/reports/${activeReportId}/media`, formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });
                    }
                } catch (reportErr) {
                    console.error("Failed to update report status or upload proof photo:", reportErr);
                }
            }

            if (onSuccess) {
                onSuccess({
                    choiceKey: meta.choiceKey,
                    petStatus: meta.petStatus,
                    remarks: finalRemarks
                });
            }

            handleClose();
        } catch (error) {
            console.error("Failed to resolve lost pet report:", error);
            alert("Failed to submit resolution. Please check your connection and try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const currentMeta = getResolutionMeta();

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div 
                className="bg-white dark:bg-[#1A1A1A] w-full max-w-2xl rounded-[2.5rem] shadow-2xl border border-stone-200 dark:border-stone-800 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="p-6 sm:p-8 pb-4 border-b border-stone-100 dark:border-stone-800/80 flex items-start justify-between gap-4 bg-gradient-to-r from-orange-50/50 via-white to-transparent dark:from-stone-900/50 dark:to-transparent">
                    <div className="flex items-center gap-4">
                        <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-white shadow-md bg-stone-100 shrink-0">
                            <img 
                                src={getPetPicture(pet.photo_url)} 
                                alt={pet.pet_name} 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-red-100 text-red-700 border border-red-200">
                                    Lost Pet Case
                                </span>
                                {activeReportId && (
                                    <span className="text-[10px] font-bold text-gray-400">
                                        Report #{activeReportId}
                                    </span>
                                )}
                            </div>
                            <h2 className="text-xl sm:text-2xl font-black text-[#1a1208] dark:text-white uppercase tracking-tight mt-0.5">
                                Resolve Lost Report: {pet.pet_name}
                            </h2>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                {pet.breed || pet.pet_type || pet.species || 'Pet'}
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Modal Body / Form */}
                <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                    
                    {/* Primary Resolution Choices Grid */}
                    <div className="space-y-3">
                        <label className="text-[11px] font-black text-[#1a1208] dark:text-stone-200 uppercase tracking-widest flex items-center justify-between">
                            <span>Recommended "Resolve Lost Report" Choices <span className="text-red-500">*</span></span>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                                Select Outcome
                            </span>
                        </label>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* 1. 🟢 Pet Found */}
                            <div
                                onClick={() => handlePrimarySelect('pet_found')}
                                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                                    primaryChoice === 'pet_found'
                                        ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-md shadow-emerald-100/50'
                                        : 'border-stone-100 dark:border-stone-800 hover:border-stone-200 bg-white dark:bg-stone-900/60'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">🟢</span>
                                        <h4 className="text-xs font-black text-[#1a1208] dark:text-stone-100 tracking-tight">
                                            Pet Found
                                        </h4>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        Located Alive
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-gray-500 dark:text-stone-400 leading-snug">
                                    The lost pet was located alive in the community.
                                </p>
                            </div>

                            {/* 2. 🔴 Deceased */}
                            <div
                                onClick={() => handlePrimarySelect('deceased')}
                                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                                    primaryChoice === 'deceased'
                                        ? 'border-rose-500 bg-rose-50/40 dark:bg-rose-950/20 shadow-md shadow-rose-100/50'
                                        : 'border-stone-100 dark:border-stone-800 hover:border-stone-200 bg-white dark:bg-stone-900/60'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">🔴</span>
                                        <h4 className="text-xs font-black text-[#1a1208] dark:text-stone-100 tracking-tight">
                                            Deceased
                                        </h4>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-rose-100 text-rose-800 border border-rose-200">
                                        Confirmed
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-gray-500 dark:text-stone-400 leading-snug">
                                    The pet was confirmed deceased.
                                </p>
                            </div>

                            {/* 3. ⚫ Not Found / Search Concluded */}
                            <div
                                onClick={() => handlePrimarySelect('not_found')}
                                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                                    primaryChoice === 'not_found'
                                        ? 'border-stone-600 bg-stone-100/60 dark:bg-stone-800/40 shadow-md'
                                        : 'border-stone-100 dark:border-stone-800 hover:border-stone-200 bg-white dark:bg-stone-900/60'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">⚫</span>
                                        <h4 className="text-xs font-black text-[#1a1208] dark:text-stone-100 tracking-tight">
                                            Not Found / Search Concluded
                                        </h4>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-stone-200 text-stone-800 border border-stone-300">
                                        Concluded
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-gray-500 dark:text-stone-400 leading-snug">
                                    The search was conducted but the pet could not be located.
                                </p>
                            </div>

                            {/* 4. ⚪ Report Withdrawn by Owner */}
                            <div
                                onClick={() => handlePrimarySelect('withdrawn')}
                                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                                    primaryChoice === 'withdrawn'
                                        ? 'border-orange-500 bg-orange-50/40 dark:bg-orange-950/20 shadow-md shadow-orange-100/50'
                                        : 'border-stone-100 dark:border-stone-800 hover:border-stone-200 bg-white dark:bg-stone-900/60'
                                }`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xl">⚪</span>
                                        <h4 className="text-xs font-black text-[#1a1208] dark:text-stone-100 tracking-tight">
                                            Report Withdrawn by Owner
                                        </h4>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-gray-100 text-gray-700 border border-gray-300">
                                        Withdrawn
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-gray-500 dark:text-stone-400 leading-snug">
                                    The owner asks to close the report or handle recovery privately.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* FOLLOW-UP SUB-CHOICES (Shown when 🟢 Pet Found is selected) */}
                    {primaryChoice === 'pet_found' && (
                        <div className="p-5 rounded-3xl bg-emerald-50/50 dark:bg-emerald-950/20 border-2 border-emerald-200/80 dark:border-emerald-900 space-y-3.5 animate-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-widest">
                                    Follow-up: Current Custody & Status
                                </span>
                                <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider">
                                    Choose Follow-up
                                </span>
                            </div>

                            <div className="space-y-2.5">
                                {/* Sub 1: 🏠 Returned to Owner */}
                                <div
                                    onClick={() => handleSubSelect('returned_to_owner')}
                                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                        subChoice === 'returned_to_owner'
                                            ? 'bg-white dark:bg-stone-900 border-emerald-500 shadow-md ring-2 ring-emerald-400/20'
                                            : 'bg-white/60 dark:bg-stone-900/40 border-emerald-100 hover:border-emerald-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">🏠</span>
                                        <div>
                                            <h5 className="text-xs font-black text-emerald-950 dark:text-stone-100">
                                                Returned to Owner
                                            </h5>
                                            <p className="text-[10px] font-bold text-emerald-800/80 dark:text-stone-400">
                                                The pet was found and identity/ownership was confirmed.
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 shrink-0">
                                        Best Outcome
                                    </span>
                                </div>

                                {/* Sub 2: 🟡 Found — Under Temporary Care */}
                                <div
                                    onClick={() => handleSubSelect('temporary_care')}
                                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                        subChoice === 'temporary_care'
                                            ? 'bg-white dark:bg-stone-900 border-amber-500 shadow-md ring-2 ring-amber-400/20'
                                            : 'bg-white/60 dark:bg-stone-900/40 border-amber-100 hover:border-amber-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">🟡</span>
                                        <div>
                                            <h5 className="text-xs font-black text-amber-950 dark:text-stone-100">
                                                Found — Under Temporary Care
                                            </h5>
                                            <p className="text-[10px] font-bold text-amber-800/80 dark:text-stone-400">
                                                Pet was found alive but is currently cared for by a rescuer, barangay, or facility.
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 shrink-0">
                                        Under Foster/Care
                                    </span>
                                </div>

                                {/* Sub 3: 🔵 Found — Owner Not Yet Located */}
                                <div
                                    onClick={() => handleSubSelect('owner_not_located')}
                                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                        subChoice === 'owner_not_located'
                                            ? 'bg-white dark:bg-stone-900 border-blue-500 shadow-md ring-2 ring-blue-400/20'
                                            : 'bg-white/60 dark:bg-stone-900/40 border-blue-100 hover:border-blue-300'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">🔵</span>
                                        <div>
                                            <h5 className="text-xs font-black text-blue-950 dark:text-stone-100">
                                                Found — Owner Not Yet Located
                                            </h5>
                                            <p className="text-[10px] font-bold text-blue-800/80 dark:text-stone-400">
                                                Pet was found, but the owner hasn't been identified/contacted yet.
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest bg-blue-100 text-blue-800 shrink-0">
                                        Pending Owner
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Resulting Status Summary Banner */}
                    <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-900/80 border border-stone-200/80 dark:border-stone-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">📊</span>
                            <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Resulting Status</p>
                                <p className="font-extrabold text-[#1a1208] dark:text-stone-100 mt-0.5">
                                    Pet Status: <span className="text-[#F97316] uppercase">{currentMeta.petStatus}</span> • {currentMeta.title}
                                </p>
                            </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${currentMeta.badgeColor}`}>
                            {currentMeta.badgeText}
                        </span>
                    </div>

                    {/* Landmark / Location Found Input */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-[#1a1208] dark:text-stone-200 uppercase tracking-widest">
                            Location / Landmark <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span>
                        </label>
                        <input 
                            type="text"
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g. Near Block 5 Clubhouse / Home Gate"
                            className="w-full h-13 bg-[#FAFAF9] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl px-5 text-xs font-bold focus:outline-none focus:border-orange-300 transition-all text-[#1a1208] dark:text-stone-100"
                        />
                    </div>

                    {/* Resolution Notes / Remarks */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-[#1a1208] dark:text-stone-200 uppercase tracking-widest">
                            Resolution Remarks / Notes <span className="text-red-500">*</span>
                        </label>
                        <textarea 
                            rows={3}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Provide any helpful details regarding the recovery or closure..."
                            className="w-full bg-[#FAFAF9] dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-4 text-xs font-bold focus:outline-none focus:border-orange-300 transition-all text-[#1a1208] dark:text-stone-100 custom-scrollbar"
                            required
                        />
                    </div>

                    {/* Proof / Reunion Photo Upload (Optional) */}
                    <div className="space-y-2">
                        <label className="text-[11px] font-black text-[#1a1208] dark:text-stone-200 uppercase tracking-widest">
                            Reunion / Resolution Photo <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span>
                        </label>
                        <input 
                            type="file" 
                            accept="image/*"
                            onChange={handlePhotoChange}
                            className="w-full text-xs font-bold text-gray-400 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 transition-all cursor-pointer"
                        />
                        {proofPreviewUrl && (
                            <div className="mt-3 flex items-center gap-3 p-3 bg-stone-50 dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800">
                                <img 
                                    src={proofPreviewUrl} 
                                    alt="Resolution Proof Preview" 
                                    className="w-14 h-14 object-cover rounded-xl shadow-xs border"
                                />
                                <div>
                                    <p className="text-[10px] font-black text-[#F97316] uppercase tracking-wider">Attached Proof Image</p>
                                    <p className="text-xs font-bold text-gray-700 dark:text-stone-300 mt-0.5">{proofPhoto?.name}</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Form Action Buttons */}
                    <div className="pt-4 border-t border-stone-100 dark:border-stone-800/80 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={isSubmitting}
                            className="px-6 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-8 py-3.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-[#F97316] to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    <span>Updating...</span>
                                </>
                            ) : (
                                <span>Confirm Resolution</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ResolveLostPetModal;
