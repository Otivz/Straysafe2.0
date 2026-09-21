import React, { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import { getLandmarkCategory } from '../../utils/landmarkIcons';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIconRetina,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const RecenterMap = ({ position }: { position: [number, number] | null }) => {
    const map = useMap();
    useEffect(() => {
        if (position && position[0] && position[1]) {
            map.flyTo(position, 16, { animate: true, duration: 0.8 });
        }
        const timer = setTimeout(() => {
            map.invalidateSize();
        }, 250);
        return () => clearTimeout(timer);
    }, [position, map]);
    return null;
};

const createFacilityMarkerIcon = (fac: any, isSelected: boolean) => {
    const cat = getLandmarkCategory(fac?.category, fac?.is_holding_facility ?? true);
    const borderColor = isSelected ? '#f59e0b' : cat.color;
    const shadow = isSelected 
        ? 'box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.45), 0 4px 14px rgba(0,0,0,0.35);' 
        : `box-shadow: 0 3px 10px rgba(0,0,0,0.25), 0 0 0 2px ${cat.color};`;
    const transform = isSelected ? 'transform: scale(1.15);' : '';

    return L.divIcon({
        className: 'custom-facility-pin',
        html: `
            <div style="
                display: flex;
                align-items: center;
                justify-content: center;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: white;
                ${shadow}
                border: 2px solid ${borderColor};
                font-size: 18px;
                cursor: pointer;
                ${transform}
                transition: transform 0.15s ease;
            ">
                <span>${cat.emoji}</span>
            </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
        popupAnchor: [0, -20]
    });
};

export interface ResolveLostPetModalProps {
    isOpen: boolean;
    onClose: () => void;
    pet?: {
        pet_id?: number;
        pet_name?: string;
        photo_url?: string;
        breed?: string;
        pet_type?: string;
        species?: string;
    };
    reportId?: number | null;
    isEscalated?: boolean;
    subdivisionName?: string;
    report?: any;
    onSuccess?: (resolution: { choiceKey: string; petStatus: string; remarks: string }) => void;
}

type PrimaryChoiceKey = 'pet_found' | 'deceased' | 'not_found' | 'withdrawn';
type SubChoiceKey = 'returned_to_owner' | 'temporary_care' | 'owner_not_located';

const isSecuredAnimal = (rep: any): boolean => {
    if (!rep) return false;
    if ([9, 10, 11, 12, 3, 14, 18].includes(rep.status_id)) return false;
    return Boolean(
        rep.status_id === 7 || // Under Observation
        rep.status_id === 8 || // Impounded
        rep.facility_id != null ||
        rep.facility != null ||
        rep.custody_status === 'In Subdivision Facility' ||
        rep.custody_status === 'Secured in Facility' ||
        rep.custody_status === 'In Barangay Facility' ||
        rep.custody_status === 'Secured' ||
        rep.custody_status === 'In Custody' ||
        (typeof rep.custody_status === 'string' && (
            rep.custody_status.toLowerCase().includes('facility') ||
            rep.custody_status.toLowerCase().includes('secured') ||
            rep.custody_status.toLowerCase().includes('custody')
        )) ||
        (rep.status?.status_name && (
            rep.status.status_name.toLowerCase().includes('observation') ||
            rep.status.status_name.toLowerCase().includes('impound')
        ))
    );
};

export const ResolveLostPetModal: React.FC<ResolveLostPetModalProps> = ({
    isOpen,
    onClose,
    pet,
    reportId,
    isEscalated,
    subdivisionName,
    report,
    onSuccess
}) => {
    const hasRegisteredPet = Boolean(pet?.pet_id && pet.pet_id > 0);
    const animalName = pet?.pet_name && pet.pet_name !== 'Pet' && pet.pet_name !== 'Animal' 
        ? pet.pet_name 
        : (pet?.species || pet?.pet_type || 'Animal');

    const [reportDetails, setReportDetails] = useState<any>(report || null);
    const initiallySecured = isSecuredAnimal(report);

    const [primaryChoice, setPrimaryChoice] = useState<PrimaryChoiceKey>('pet_found');
    const [subChoice, setSubChoice] = useState<SubChoiceKey>(initiallySecured ? 'temporary_care' : 'returned_to_owner');
    const [location, setLocation] = useState<string>('');
    const [remarks, setRemarks] = useState<string>(
        initiallySecured
            ? 'The animal was secured alive and is currently held at the Subdivision holding area / facility while coordinating next steps.'
            : (hasRegisteredPet
                ? 'The lost pet was located alive and safely returned to the owner.'
                : 'The animal was located alive and safely reunited with or returned to the owner / caregiver.')
    );
    const [proofPhoto, setProofPhoto] = useState<File | null>(null);
    const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [activeReportId, setActiveReportId] = useState<number | null>(reportId || report?.report_id || null);
    const [facilities, setFacilities] = useState<any[]>([]);
    const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(report?.facility_id || null);
    const [isLoadingFacilities, setIsLoadingFacilities] = useState<boolean>(false);
    const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);

    useEffect(() => {
        if (report) {
            setReportDetails(report);
            if (report.facility_id) {
                setSelectedFacilityId(report.facility_id);
            }
        }
    }, [report]);

    // Fetch holding facilities when modal opens
    useEffect(() => {
        if (!isOpen) return;
        const fetchFacilities = async () => {
            setIsLoadingFacilities(true);
            try {
                const currentRep = report || reportDetails;
                const subdId = currentRep?.subdivision_id || (currentRep?.subdivision?.subdivision_id) || undefined;
                const res = await api.get('/landmarks', {
                    params: {
                        is_holding_facility: true,
                        subdivision_id: subdId
                    }
                });
                const facList = res.data || [];
                setFacilities(facList);

                const existingFacId = currentRep?.facility_id;
                if (existingFacId && facList.some((f: any) => f.landmark_id === existingFacId)) {
                    setSelectedFacilityId(existingFacId);
                } else if (facList.length > 0 && !selectedFacilityId) {
                    const subdFac = facList.find((f: any) => f.subdivision_id != null);
                    setSelectedFacilityId(subdFac ? subdFac.landmark_id : facList[0].landmark_id);
                }
            } catch (err) {
                console.warn("Could not fetch holding facilities:", err);
            } finally {
                setIsLoadingFacilities(false);
            }
        };
        fetchFacilities();
    }, [isOpen, report?.subdivision_id, reportDetails?.subdivision_id, report?.facility_id]);

    // Look for linked active report if reportId is not supplied
    useEffect(() => {
        if (!isOpen) return;

        if (reportId || report?.report_id) {
            setActiveReportId(reportId || report?.report_id);
            return;
        }

        if (!pet?.pet_id && !pet?.pet_name) return;

        const fetchPetReport = async () => {
            try {
                const res = await api.get('/reports/', { params: { limit: 50 } });
                const reports = res.data?.reports || res.data || [];
                const matchingReport = reports.find((r: any) => 
                    (pet?.pet_id && r.pet_id === pet.pet_id) || 
                    (pet?.pet_name && r.description && r.description.includes(`pet: ${pet.pet_name}`))
                );
                if (matchingReport) {
                    setActiveReportId(matchingReport.report_id);
                }
            } catch (err) {
                console.error("Failed to fetch linked report for animal:", err);
            }
        };

        fetchPetReport();
    }, [isOpen, reportId, report?.report_id, pet?.pet_id, pet?.pet_name]);

    // Fetch report details to dynamically know escalation / subdivision context
    useEffect(() => {
        if (!isOpen || !activeReportId) return;
        const fetchDetails = async () => {
            try {
                const res = await api.get(`/reports/${activeReportId}`);
                if (res.data) {
                    setReportDetails(res.data);
                    if (!report && isSecuredAnimal(res.data)) {
                        setPrimaryChoice('pet_found');
                        setSubChoice('temporary_care');
                        if (res.data.facility_id) {
                            setSelectedFacilityId(res.data.facility_id);
                        }
                    }
                }
            } catch (err) {
                console.warn("Could not fetch detailed report for resolution modal:", err);
            }
        };
        fetchDetails();
    }, [isOpen, activeReportId]);

    const targetReport = report || reportDetails;

    const isEscalatedEffective = Boolean(
        isEscalated ||
        targetReport?.endorsement_letter ||
        targetReport?.status_id === 4 ||
        targetReport?.status_id === 5 ||
        (targetReport?.status?.status_name && targetReport.status.status_name.toLowerCase().includes('escalat'))
    );

    const effectiveSubdivisionName = subdivisionName || targetReport?.subdivision?.subdivision_name || targetReport?.subdivision_name;
    const selectedFacility = facilities.find(f => f.landmark_id === selectedFacilityId) || (facilities.length > 0 ? facilities[0] : null);

    const isBrgyFacility = selectedFacility 
        ? selectedFacility.subdivision_id == null 
        : isEscalatedEffective;

    const facilityTitle = isBrgyFacility
        ? 'Barangay Holding Facility / Shelter'
        : 'Subdivision Facility / Shelter';
    const facilityBadge = isBrgyFacility ? 'In Brgy Facility' : 'In Subd Facility';

    // Synchronize initial choices whenever the modal opens or report details change
    useEffect(() => {
        if (!isOpen) return;
        const currentRep = report || reportDetails;
        if (isSecuredAnimal(currentRep)) {
            setPrimaryChoice('pet_found');
            setSubChoice('temporary_care');
            if (currentRep?.facility_id) {
                setSelectedFacilityId(currentRep.facility_id);
            }
            const facName = currentRep?.facility?.name || (isBrgyFacility ? 'Barangay Holding Facility' : 'Subdivision Holding Facility');
            setRemarks(`The animal was secured alive and is currently held at ${facName} while coordinating next steps.`);
        } else {
            setPrimaryChoice('pet_found');
            setSubChoice('returned_to_owner');
            setRemarks(
                hasRegisteredPet
                    ? 'The lost pet was located alive and safely returned to the owner.'
                    : 'The animal was located alive and safely reunited with or returned to the owner / caregiver.'
            );
        }
    }, [isOpen, report?.status_id, report?.custody_status, report?.facility_id]);

    // Update remarks automatically when choices change
    const updateRemarks = (primary: PrimaryChoiceKey, sub: SubChoiceKey, facObj: any = selectedFacility) => {
        if (primary === 'pet_found') {
            if (sub === 'returned_to_owner') {
                setRemarks(hasRegisteredPet 
                    ? 'The lost pet was located alive and safely returned to the owner. Identity and ownership confirmed.'
                    : 'The animal was located alive and safely reunited with or returned to the owner / caregiver.');
            } else if (sub === 'temporary_care') {
                const facName = facObj?.name || (isBrgyFacility ? 'Barangay Holding Facility' : 'Subdivision Holding Facility');
                const caretakerInfo = facObj?.contact_person ? ` (Caretaker: ${facObj.contact_person}${facObj.contact_number ? `, ${facObj.contact_number}` : ''})` : '';
                setRemarks(`The animal was secured alive and is currently held at ${facName}${caretakerInfo} while coordinating next steps.`);
            } else if (sub === 'owner_not_located') {
                setRemarks('The animal was found and secured by a resident in the community. Awaiting responder / team pickup.');
            }
        } else if (primary === 'deceased') {
            setRemarks('The animal was sadly confirmed deceased.');
        } else if (primary === 'not_found') {
            setRemarks('A neighborhood inspection and search was conducted but the animal could not be located. Case concluded.');
        } else if (primary === 'withdrawn') {
            setRemarks('The report was withdrawn and closed upon request.');
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
        const currentRep = report || reportDetails;
        if (isSecuredAnimal(currentRep)) {
            setPrimaryChoice('pet_found');
            setSubChoice('temporary_care');
        } else {
            setPrimaryChoice('pet_found');
            setSubChoice('returned_to_owner');
        }
        onClose();
    };

    const getResolutionMeta = () => {
        if (primaryChoice === 'pet_found') {
            if (subChoice === 'returned_to_owner') {
                return {
                    choiceKey: 'returned_to_owner',
                    title: 'Returned to Owner / Reunited',
                    petStatus: 'Active',
                    reportStatusId: 9, // Claimed by Owner / Reunited
                    badgeText: 'Reunited',
                    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                };
            } else if (subChoice === 'temporary_care') {
                return {
                    choiceKey: 'temporary_care',
                    title: `Secured in ${facilityTitle}`,
                    petStatus: 'Rescued',
                    reportStatusId: isEscalatedEffective ? (reportDetails?.status_id === 5 ? 5 : 4) : 7, // Keep Escalated status if already escalated, else Under Observation
                    badgeText: facilityBadge,
                    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
                };
            } else {
                return {
                    choiceKey: 'owner_not_located',
                    title: 'Secured by Resident (Awaiting Pickup)',
                    petStatus: 'Found',
                    reportStatusId: isEscalatedEffective ? (reportDetails?.status_id === 5 ? 5 : 4) : 7, // Keep Escalated status if already escalated
                    badgeText: 'Awaiting Pickup',
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
                title: 'Not Located / Search Concluded',
                petStatus: 'Active',
                reportStatusId: 11, // Resolved
                badgeText: 'Search Concluded',
                badgeColor: 'bg-stone-100 text-stone-700 border-stone-300'
            };
        } else {
            return {
                choiceKey: 'withdrawn_by_owner',
                title: 'Report Withdrawn / Closed',
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
            // 1. Update pet status in DB only if a registered pet exists
            if (pet?.pet_id && pet.pet_id > 0) {
                try {
                    await api.put(`/pets/${pet.pet_id}`, {
                        status: meta.petStatus
                    });
                } catch (petErr) {
                    console.warn("Could not update registered pet status:", petErr);
                }
            }

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
                    
                    const existingCond = reportDetails?.condition || (reportDetails?.description?.toLowerCase().includes('injured') ? 'Injured' : undefined);
                    const payload: any = {
                        status_id: meta.reportStatusId,
                        remarks: finalRemarks,
                        user_id: currentUser?.user_id || currentUser?.id,
                        ...(primaryChoice === 'deceased' ? { animal_condition: 'Deceased' } : (existingCond ? { animal_condition: existingCond } : {}))
                    };

                    // If moving to facility, include facility metadata & coordinates
                    if (subChoice === 'temporary_care' && selectedFacility) {
                        payload.facility_id = selectedFacility.landmark_id;
                        payload.latitude = parseFloat(selectedFacility.latitude);
                        payload.longitude = parseFloat(selectedFacility.longitude);
                        payload.landmark = selectedFacility.name;
                        payload.custody_status = selectedFacility.subdivision_id == null ? 'In Barangay Facility' : 'In Subdivision Facility';
                    } else if (subChoice === 'owner_not_located') {
                        payload.custody_status = 'Secured by Resident';
                    } else if (subChoice === 'returned_to_owner') {
                        payload.custody_status = 'Reunited';
                    }

                    const statusRes = await api.patch(`/reports/${activeReportId}/status`, payload);

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
            console.error("Failed to update animal status:", error);
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
                                src={getPetPicture(pet?.photo_url)} 
                                alt={animalName} 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                            />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                    hasRegisteredPet 
                                        ? 'bg-red-100 text-red-700 border border-red-200' 
                                        : 'bg-orange-100 text-orange-700 border border-orange-200'
                                }`}>
                                    {hasRegisteredPet ? 'Lost Pet Case' : 'Animal Status Update'}
                                </span>
                                {activeReportId && (
                                    <span className="text-[10px] font-bold text-gray-400">
                                        Report #{activeReportId}
                                    </span>
                                )}
                            </div>
                            <h2 className="text-xl sm:text-2xl font-black text-[#1a1208] dark:text-white uppercase tracking-tight mt-0.5">
                                {hasRegisteredPet 
                                    ? `Resolve Lost Report: ${animalName}` 
                                    : (animalName && animalName !== 'Animal' ? `Update Animal Status: ${animalName}` : 'Update Animal Status')}
                            </h2>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                {pet?.breed || pet?.pet_type || pet?.species || 'Animal Case'}
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
                            <span>Recommended Status & Outcome Choices <span className="text-red-500">*</span></span>
                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                                Select Outcome
                            </span>
                        </label>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* 1. 🟢 Animal Found / Secured */}
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
                                            {hasRegisteredPet ? 'Pet Found' : 'Animal Found / Secured'}
                                        </h4>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 border border-emerald-200">
                                        Located Alive
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-gray-500 dark:text-stone-400 leading-snug">
                                    The animal was located alive or secured in the community.
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
                                    The animal was confirmed deceased.
                                </p>
                            </div>

                            {/* 3. ⚫ Not Located / Search Concluded */}
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
                                            Not Located / Concluded
                                        </h4>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-stone-200 text-stone-800 border border-stone-300">
                                        Concluded
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-gray-500 dark:text-stone-400 leading-snug">
                                    The search was conducted but the animal could not be located.
                                </p>
                            </div>

                            {/* 4. ⚪ Report Withdrawn / Closed */}
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
                                            Report Withdrawn / Closed
                                        </h4>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-gray-100 text-gray-700 border border-gray-300">
                                        Withdrawn
                                    </span>
                                </div>
                                <p className="text-[10px] font-bold text-gray-500 dark:text-stone-400 leading-snug">
                                    The report was withdrawn or requested to be closed.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* FOLLOW-UP SUB-CHOICES (Shown when 🟢 Animal Found / Secured is selected) */}
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
                                                Returned to Owner / Reunited
                                            </h5>
                                            <p className="text-[10px] font-bold text-emerald-800/80 dark:text-stone-400">
                                                The animal was found and reunited with or returned to the owner / caregiver.
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 shrink-0">
                                        Best Outcome
                                    </span>
                                </div>

                                {/* Sub 2: 🟡 Secured in Facility / Shelter */}
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
                                                Secured in {facilityTitle}
                                            </h5>
                                            <p className="text-[10px] font-bold text-amber-800/80 dark:text-stone-400">
                                                {isBrgyFacility
                                                    ? 'Animal was secured and is currently held at the Barangay Holding Facility.'
                                                    : 'Animal was secured and is currently held at the Subdivision holding area / facility.'}
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-800 shrink-0">
                                        {facilityBadge}
                                    </span>
                                </div>

                                {/* Facility Picker Card (Shown when Secured in Facility is selected) */}
                                {subChoice === 'temporary_care' && (
                                    <div className="p-4 rounded-2xl bg-amber-100/60 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-3 animate-in fade-in duration-200">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-amber-950 dark:text-amber-200 uppercase tracking-widest flex items-center gap-1.5">
                                                <span>🏢</span> Select Holding Facility / Shelter
                                            </span>
                                            <span className="text-[9px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                                                {isLoadingFacilities ? 'Loading...' : `${facilities.length} available`}
                                            </span>
                                        </div>

                                        {facilities.length > 0 ? (
                                            <div className="space-y-2">
                                                <select
                                                    value={selectedFacilityId || ''}
                                                    onChange={(e) => {
                                                        const id = Number(e.target.value);
                                                        setSelectedFacilityId(id);
                                                        const facObj = facilities.find(f => f.landmark_id === id);
                                                        updateRemarks('pet_found', 'temporary_care', facObj);
                                                    }}
                                                    className="w-full px-3.5 py-2.5 bg-white dark:bg-stone-900 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-bold text-stone-900 dark:text-stone-100 focus:ring-2 focus:ring-amber-400 outline-none"
                                                >
                                                    {facilities.map((fac) => {
                                                        const cat = getLandmarkCategory(fac.category, fac.is_holding_facility);
                                                        return (
                                                            <option key={fac.landmark_id} value={fac.landmark_id}>
                                                                {cat.emoji} {fac.name} {fac.contact_person ? `(Caretaker: ${fac.contact_person})` : ''}
                                                            </option>
                                                        );
                                                    })}
                                                </select>

                                                {selectedFacility && (
                                                    <div className="p-3 bg-white/80 dark:bg-stone-900/80 rounded-xl border border-amber-200/80 dark:border-amber-800/80 text-[11px] text-stone-700 dark:text-stone-300 space-y-2">
                                                        <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-300">
                                                            <span>{getLandmarkCategory(selectedFacility.category, selectedFacility.is_holding_facility).emoji} {selectedFacility.name}</span>
                                                            {selectedFacility.capacity && (
                                                                <span className="text-[9px] px-2 py-0.5 bg-amber-100 text-amber-800 rounded-md font-extrabold">
                                                                    Cap: {selectedFacility.capacity}
                                                                </span>
                                                            )}
                                                        </div>
                                                        {selectedFacility.contact_person && (
                                                            <p className="text-[10px] text-stone-600 dark:text-stone-400">
                                                                👤 Caretaker: <strong className="text-stone-900 dark:text-stone-200">{selectedFacility.contact_person}</strong>
                                                                {selectedFacility.contact_number && ` • 📞 ${selectedFacility.contact_number}`}
                                                            </p>
                                                        )}

                                                        {/* Facility Interactive Map */}
                                                        {selectedFacility.latitude && selectedFacility.longitude && !isNaN(parseFloat(String(selectedFacility.latitude))) && !isNaN(parseFloat(String(selectedFacility.longitude))) && (
                                                            <div className="space-y-1.5 pt-1">
                                                                <div className="h-44 w-full rounded-xl overflow-hidden border border-amber-300 dark:border-amber-700 relative z-0 shadow-inner group">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setIsMapExpanded(true);
                                                                        }}
                                                                        className="absolute top-2 right-2 z-[400] px-2.5 py-1 bg-white/95 dark:bg-stone-900/95 hover:bg-white text-stone-700 dark:text-stone-200 text-[10px] font-bold rounded-lg shadow-md border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 transition-all hover:scale-105 cursor-pointer backdrop-blur-sm"
                                                                        title="Expand Map"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                                                        </svg>
                                                                        <span>Expand</span>
                                                                    </button>
                                                                    <MapContainer
                                                                        center={[parseFloat(String(selectedFacility.latitude)), parseFloat(String(selectedFacility.longitude))]}
                                                                        zoom={16}
                                                                        scrollWheelZoom={false}
                                                                        className="h-full w-full"
                                                                    >
                                                                        <TileLayer
                                                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                                        />
                                                                        <RecenterMap
                                                                            position={[parseFloat(String(selectedFacility.latitude)), parseFloat(String(selectedFacility.longitude))]}
                                                                        />
                                                                        {facilities.map((fac) => {
                                                                            const lat = fac.latitude ? parseFloat(String(fac.latitude)) : null;
                                                                            const lng = fac.longitude ? parseFloat(String(fac.longitude)) : null;
                                                                            if (lat === null || isNaN(lat) || lng === null || isNaN(lng)) return null;
                                                                            const isSelected = fac.landmark_id === selectedFacility.landmark_id;
                                                                            const facCat = getLandmarkCategory(fac.category, fac.is_holding_facility);
                                                                            return (
                                                                                <Marker
                                                                                    key={fac.landmark_id}
                                                                                    position={[lat, lng]}
                                                                                    icon={createFacilityMarkerIcon(fac, isSelected)}
                                                                                    eventHandlers={{
                                                                                        click: () => {
                                                                                            setSelectedFacilityId(fac.landmark_id);
                                                                                            updateRemarks('pet_found', 'temporary_care', fac);
                                                                                        }
                                                                                    }}
                                                                                >
                                                                                    <Popup>
                                                                                        <div className="p-1 text-center text-xs min-w-[130px]">
                                                                                            <p className="font-bold text-amber-800 dark:text-amber-300">
                                                                                                {facCat.emoji} {fac.name}
                                                                                            </p>
                                                                                            {fac.contact_person && (
                                                                                                <p className="text-[10px] text-stone-600 mt-0.5">
                                                                                                    Caretaker: {fac.contact_person}
                                                                                                </p>
                                                                                            )}
                                                                                            {fac.capacity && (
                                                                                                <p className="text-[10px] text-amber-700 font-semibold">
                                                                                                    Capacity: {fac.capacity}
                                                                                                </p>
                                                                                            )}
                                                                                            {isSelected && (
                                                                                                <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">
                                                                                                    ✓ Selected
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </Popup>
                                                                                </Marker>
                                                                            );
                                                                        })}
                                                                    </MapContainer>
                                                                </div>
                                                                <div className="flex items-center justify-between text-[9px] text-amber-900/70 dark:text-amber-300/70 px-1 font-mono">
                                                                    <span>Lat: {parseFloat(String(selectedFacility.latitude)).toFixed(5)}</span>
                                                                    <span>Lng: {parseFloat(String(selectedFacility.longitude)).toFixed(5)}</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                        <p className="text-[9px] text-amber-800 dark:text-amber-400 font-semibold pt-1 border-t border-amber-100 dark:border-amber-900/50">
                                                            ✨ <strong>Auto-Location Update:</strong> The animal's live position on the map will move to this facility. Original found coordinates are preserved in location history.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="p-3 bg-white/80 dark:bg-stone-900/80 rounded-xl border border-amber-200 text-xs text-stone-600 dark:text-stone-300">
                                                <p className="font-semibold text-amber-900">Standard Subdivision Holding Area</p>
                                                <p className="text-[10px] text-stone-500 mt-0.5">
                                                    No custom landmarks registered as holding facilities yet. The report will update custody to Subdivision Holding.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Sub 3: 🔵 Secured by Resident (Awaiting Pickup) */}
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
                                                Secured by Resident (Awaiting Pickup)
                                            </h5>
                                            <p className="text-[10px] font-bold text-blue-800/80 dark:text-stone-400">
                                                Animal was secured by a resident/rescuer, awaiting team dispatch or pickup.
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-2.5 py-1 rounded-xl text-[8px] font-black uppercase tracking-widest bg-blue-100 text-blue-800 shrink-0">
                                        Awaiting Pickup
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
                                    {hasRegisteredPet && (
                                        <>Pet Status: <span className="text-[#F97316] uppercase">{currentMeta.petStatus}</span> • </>
                                    )}
                                    {currentMeta.title}
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
                            placeholder="e.g. Near Block 5 Clubhouse / Main Gate"
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
                                <span>Confirm Status Update</span>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* ENLARGED FULLSCREEN HOLDING FACILITY MAP MODAL */}
            {isMapExpanded && selectedFacility && selectedFacility.latitude && selectedFacility.longitude && (
                <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-stone-900 rounded-3xl shadow-2xl w-[95%] max-w-4xl h-[85vh] flex flex-col p-5 border border-amber-200 dark:border-amber-800 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800 shrink-0">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">
                                    {getLandmarkCategory(selectedFacility.category, selectedFacility.is_holding_facility).emoji}
                                </span>
                                <div>
                                    <h4 className="text-base font-black text-stone-900 dark:text-stone-100 flex items-center gap-2">
                                        {selectedFacility.name}
                                        {selectedFacility.capacity && (
                                            <span className="text-[10px] px-2 py-0.5 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded-md font-extrabold">
                                                Cap: {selectedFacility.capacity}
                                            </span>
                                        )}
                                    </h4>
                                    <p className="text-[11px] text-stone-500 dark:text-stone-400">
                                        {selectedFacility.contact_person ? `Caretaker: ${selectedFacility.contact_person}` : 'Subdivision Holding Facility'}
                                        {selectedFacility.contact_number && ` • 📞 ${selectedFacility.contact_number}`}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsMapExpanded(false)}
                                className="p-2 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-full transition-colors text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
                                title="Close expanded map"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Expanded Map View */}
                        <div className="flex-1 rounded-2xl overflow-hidden relative border border-amber-200 dark:border-amber-800 my-3 min-h-0 shadow-inner">
                            <MapContainer
                                center={[parseFloat(String(selectedFacility.latitude)), parseFloat(String(selectedFacility.longitude))]}
                                zoom={17}
                                scrollWheelZoom={true}
                                className="h-full w-full"
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <RecenterMap
                                    position={[parseFloat(String(selectedFacility.latitude)), parseFloat(String(selectedFacility.longitude))]}
                                />
                                {facilities.map((fac) => {
                                    const lat = fac.latitude ? parseFloat(String(fac.latitude)) : null;
                                    const lng = fac.longitude ? parseFloat(String(fac.longitude)) : null;
                                    if (lat === null || isNaN(lat) || lng === null || isNaN(lng)) return null;
                                    const isSelected = fac.landmark_id === selectedFacility.landmark_id;
                                    const facCat = getLandmarkCategory(fac.category, fac.is_holding_facility);
                                    return (
                                        <Marker
                                            key={`expanded-${fac.landmark_id}`}
                                            position={[lat, lng]}
                                            icon={createFacilityMarkerIcon(fac, isSelected)}
                                            eventHandlers={{
                                                click: () => {
                                                    setSelectedFacilityId(fac.landmark_id);
                                                    updateRemarks('pet_found', 'temporary_care', fac);
                                                }
                                            }}
                                        >
                                            <Popup>
                                                <div className="p-1.5 text-center text-xs min-w-[140px]">
                                                    <p className="font-bold text-amber-800 dark:text-amber-300 text-sm">
                                                        {facCat.emoji} {fac.name}
                                                    </p>
                                                    {fac.contact_person && (
                                                        <p className="text-[11px] text-stone-600 mt-1">
                                                            Caretaker: <strong>{fac.contact_person}</strong>
                                                        </p>
                                                    )}
                                                    {fac.contact_number && (
                                                        <p className="text-[11px] text-stone-500">
                                                            📞 {fac.contact_number}
                                                        </p>
                                                    )}
                                                    {fac.capacity && (
                                                        <p className="text-[10px] text-amber-700 font-semibold mt-0.5">
                                                            Capacity: {fac.capacity} animals
                                                        </p>
                                                    )}
                                                    {isSelected ? (
                                                        <span className="inline-block mt-2 text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
                                                            ✓ Current Selection
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedFacilityId(fac.landmark_id);
                                                                updateRemarks('pet_found', 'temporary_care', fac);
                                                            }}
                                                            className="mt-2 w-full py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] font-bold cursor-pointer transition-colors"
                                                        >
                                                            Select Facility
                                                        </button>
                                                    )}
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}
                            </MapContainer>
                        </div>

                        {/* Footer with Facility Quick Switcher & Coordinates */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-black uppercase tracking-wider text-stone-500">Facilities:</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {facilities.map((fac) => {
                                        const isSelected = fac.landmark_id === selectedFacility.landmark_id;
                                        const facCat = getLandmarkCategory(fac.category, fac.is_holding_facility);
                                        return (
                                            <button
                                                key={`btn-${fac.landmark_id}`}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedFacilityId(fac.landmark_id);
                                                    updateRemarks('pet_found', 'temporary_care', fac);
                                                }}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    isSelected
                                                        ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-400/30'
                                                        : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
                                                }`}
                                            >
                                                <span>{facCat.emoji}</span>
                                                <span>{fac.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-[10px] font-mono text-stone-500">
                                    Lat: {parseFloat(String(selectedFacility.latitude)).toFixed(6)}, Lng: {parseFloat(String(selectedFacility.longitude)).toFixed(6)}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setIsMapExpanded(false)}
                                    className="px-4 py-1.5 bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 rounded-xl font-bold text-xs hover:opacity-90 transition-opacity cursor-pointer"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResolveLostPetModal;
