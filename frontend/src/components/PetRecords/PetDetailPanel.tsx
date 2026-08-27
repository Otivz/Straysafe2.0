import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { type PetRecord } from './types';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import api from '../../utils/api';

interface PetDetailPanelProps {
    pet: PetRecord | null;
    onClose?: () => void;
    hideRegisteredPets?: boolean; // When true, viewed by citizen/owner
    onEditClick?: (pet: PetRecord) => void;
    onReportLostClick?: (pet: PetRecord) => void;
    onOwnerAssigned?: () => void;
    onDeletePet?: (petId: string) => void;
}

const PetDetailPanel: React.FC<PetDetailPanelProps> = ({ 
    pet, 
    onClose, 
    hideRegisteredPets = false,
    onEditClick,
    onReportLostClick,
    onOwnerAssigned,
    onDeletePet
}) => {
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<'info' | 'health' | 'behavior' | 'incident'>('info');
    const [isQrOpen, setIsQrOpen] = useState(false);
    const [qrData, setQrData] = useState<any | null>(null);
    const [isLoadingQr, setIsLoadingQr] = useState(false);
    const [isEvidenceOpen, setIsEvidenceOpen] = useState(false);
    const [incidentClaims, setIncidentClaims] = useState<any[]>([]);
    const [incidentReports, setIncidentReports] = useState<any[]>([]);
    const [isLoadingIncidents, setIsLoadingIncidents] = useState<boolean>(false);

    const handleOpenQrModal = async () => {
        if (!pet) return;
        setIsQrOpen(true);
        if (!qrData) {
            setIsLoadingQr(true);
            try {
                const res = await api.get(`/pets/${pet.id}/qr`);
                setQrData(res.data);
            } catch (err) {
                console.error("Failed to load pet QR code:", err);
            } finally {
                setIsLoadingQr(false);
            }
        }
    };

    // Photo Update State
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // Assign Owner State
    const [isAssignOwnerModalOpen, setIsAssignOwnerModalOpen] = useState(false);
    const [assignOwnerMode, setAssignOwnerMode] = useState<'existing' | 'new'>('existing');
    const [usersList, setUsersList] = useState<any[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<any | null>(null);
    const [newOwnerName, setNewOwnerName] = useState('');
    const [newOwnerEmail, setNewOwnerEmail] = useState('');
    const [newOwnerPhone, setNewOwnerPhone] = useState('');
    const [newOwnerAddress, setNewOwnerAddress] = useState('');
    const [isAssigning, setIsAssigning] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);

    // Delete Pet State
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeletePet = async () => {
        if (!pet) return;
        try {
            setIsDeleting(true);
            await api.delete(`/pets/${pet.id}`);
            setIsConfirmingDelete(false);
            if (onDeletePet) {
                onDeletePet(pet.id);
            }
            if (onClose) {
                onClose();
            }
        } catch (err: any) {
            console.error('Error deleting pet:', err);
            alert(err.response?.data?.detail || 'Failed to delete pet record.');
        } finally {
            setIsDeleting(false);
        }
    };

    useEffect(() => {
        if (!pet) return;

        let isMounted = true;
        const fetchPetIncidents = async () => {
            setIsLoadingIncidents(true);
            try {
                const petId = Number(pet.id);
                const ownerId = pet.rawPetObj?.owner_id;

                const claimsRes = await api.get(ownerId ? `/claims/?owner_id=${ownerId}` : '/claims/');
                const allClaims = Array.isArray(claimsRes.data) ? claimsRes.data : [];
                
                // Strictly filter claims for THIS specific pet ID only
                const petClaims = allClaims.filter((c: any) => {
                    const cPetId = c.pet_id || (c.pet && c.pet.pet_id);
                    return Number(cPetId) === petId;
                });

                const reportsRes = await api.get('/reports/');
                const allReports = Array.isArray(reportsRes.data) ? reportsRes.data : [];
                const claimReportIds = new Set(petClaims.map((c: any) => c.report_id));

                // Strictly filter reports for THIS specific pet only
                const matchedReports = allReports.filter((r: any) => {
                    if (r.pet_id && Number(r.pet_id) === petId) return true;
                    if (claimReportIds.has(r.report_id)) return true;
                    return false;
                });

                if (isMounted) {
                    setIncidentClaims(petClaims);
                    setIncidentReports(matchedReports);
                }
            } catch (err) {
                console.error("Error loading pet incident history:", err);
            } finally {
                if (isMounted) setIsLoadingIncidents(false);
            }
        };

        fetchPetIncidents();

        return () => {
            isMounted = false;
        };
    }, [pet?.id, activeTab]);

    // Fetch users for owner assignment
    const fetchUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const res = await api.get('/users');
            setUsersList(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error('Error fetching users for owner assignment:', err);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    useEffect(() => {
        if (isAssignOwnerModalOpen) {
            fetchUsers();
            setSelectedOwner(null);
            setNewOwnerName('');
            setNewOwnerEmail('');
            setNewOwnerPhone('');
            setNewOwnerAddress('');
            setAssignError(null);
        }
    }, [isAssignOwnerModalOpen]);

    const handleAssignOwnerSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setAssignError(null);
        let targetOwnerId: number | null = null;

        if (assignOwnerMode === 'existing') {
            if (!selectedOwner) {
                setAssignError('Please select a resident account from the list.');
                return;
            }
            targetOwnerId = selectedOwner.user_id;
        } else {
            if (!newOwnerName.trim() || !newOwnerEmail.trim()) {
                setAssignError('Please enter the owner full name and email address.');
                return;
            }
            try {
                setIsAssigning(true);
                const userRes = await api.post('/users/', {
                    name: newOwnerName.trim(),
                    email: newOwnerEmail.trim().toLowerCase(),
                    phone: newOwnerPhone.trim() || null,
                    password: 'password123',
                    role_id: 1, // Resident
                    subdivision_id: 1,
                    barangay: 'San Vicente',
                    city: 'Santa Maria, Bulacan',
                    address: newOwnerAddress.trim() || null,
                    status: 'Active'
                });
                targetOwnerId = userRes.data.user_id;
            } catch (err: any) {
                setIsAssigning(false);
                const detail = err.response?.data?.detail || 'Failed to create new resident owner account.';
                setAssignError(`Error creating owner: ${detail}`);
                return;
            }
        }

        try {
            setIsAssigning(true);
            await api.post(`/pets/${pet!.id}/assign-owner?owner_id=${targetOwnerId}`);
            setIsAssignOwnerModalOpen(false);
            if (onOwnerAssigned) {
                onOwnerAssigned();
            }
        } catch (err: any) {
            const detail = err.response?.data?.detail || 'Failed to assign owner to pet.';
            setAssignError(`Assignment failed: ${detail}`);
        } finally {
            setIsAssigning(false);
        }
    };

    if (!pet) return null;

    const hasOwner = Boolean(pet.rawPetObj?.owner_id && !pet.ownerName.toLowerCase().includes('no owner') && !pet.ownerName.toLowerCase().includes('unknown'));

    // Status pill style helper
    const getStatusStyle = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'active':
            case 'healthy':
                return 'bg-green-50 text-green-600 border-green-100';
            case 'lost':
                return 'bg-red-50 text-red-600 border-red-100';
            case 'found':
                return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'rescued':
                return 'bg-orange-50 text-[#F97316] border-orange-100';
            case 'deceased':
                return 'bg-gray-100 text-gray-600 border-gray-200';
            default:
                return 'bg-amber-50 text-amber-600 border-amber-100';
        }
    };

    const filteredUsers = usersList.filter(u => {
        if (!userSearchTerm.trim()) return true;
        const q = userSearchTerm.toLowerCase();
        return (
            (u.name && u.name.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.phone && u.phone.includes(q))
        );
    });

    useEffect(() => {
        if (pet) {
            setCurrentPhoto(pet.avatar);
        }
    }, [pet?.avatar, pet?.id]);

    const handleUpdatePetPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !pet) return;
        try {
            setIsUploadingPhoto(true);
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post(`/pets/${pet.id}/photo`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data?.photo_url) {
                setCurrentPhoto(res.data.photo_url);
                pet.avatar = res.data.photo_url;
                if (pet.rawPetObj) pet.rawPetObj.photo_url = res.data.photo_url;
            }
            if (onOwnerAssigned) onOwnerAssigned();
        } catch (err) {
            console.error('Failed to update pet photo:', err);
        } finally {
            setIsUploadingPhoto(false);
            if (photoInputRef.current) photoInputRef.current.value = '';
        }
    };

    return (
        <div className="bg-[#FAFAF9] w-full h-full flex flex-col animate-in fade-in duration-500 overflow-hidden font-sans relative">
            {/* Header */}
            <header className="shrink-0 z-30 bg-white px-8 py-5 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-6 bg-[#F97316] rounded-full"></div>
                    <h1 className="text-lg font-black text-[#1a1208] uppercase tracking-wider">Pet Profile Detailed Panel</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button 
                        onClick={onClose} 
                        className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#1a1208] hover:bg-gray-50 transition-all cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-8 sm:p-10 space-y-10 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                
                {/* Hero Profile Block */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Large Photo Overlay */}
                    <div className="lg:col-span-2 relative h-[380px] rounded-[2.5rem] overflow-hidden group shadow-lg border border-gray-100 bg-[#1a1208]">
                        <img 
                            src={getPetPicture(currentPhoto || pet.avatar)} 
                            alt={pet.name} 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                            onError={(e: any) => { e.target.src = DEFAULT_PET_AVATAR; }}
                        />

                        {/* Change Photo Button for Staff / Subdivision Leaders */}
                        {!hideRegisteredPets && (
                            <>
                                <input 
                                    type="file" 
                                    ref={photoInputRef}
                                    accept="image/*" 
                                    onChange={handleUpdatePetPhoto} 
                                    className="hidden" 
                                />
                                <button
                                    type="button"
                                    onClick={() => photoInputRef.current?.click()}
                                    disabled={isUploadingPhoto}
                                    className="absolute top-6 right-6 z-20 px-3.5 py-2 bg-black/60 hover:bg-[#B35D25] backdrop-blur-md text-white rounded-xl text-[11px] font-black uppercase tracking-wider border border-white/20 transition-all flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
                                >
                                    <span>📷</span>
                                    <span>{isUploadingPhoto ? 'Uploading...' : 'Change Photo'}</span>
                                </button>
                            </>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-8 sm:p-10">
                            <div className="flex items-center gap-3 mb-2">
                                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border ${getStatusStyle(pet.status)}`}>
                                    {pet.status}
                                </span>
                                {!hasOwner && (
                                    <span className="px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-amber-500 text-white shadow-sm">
                                        🐾 Unassigned / No Owner Yet
                                    </span>
                                )}
                            </div>
                            <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">{pet.name}</h2>
                            <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">{pet.breed} • {pet.species} • {pet.sizeCategory || 'Medium'} Size</p>
                        </div>
                    </div>

                    {/* Vitals Summary Card / Quick Actions */}
                    <div className="flex flex-col justify-between gap-6">
                        {/* Vitals summary */}
                        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100 space-y-5">
                            <div className="flex items-center justify-between">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Registry Details</h3>
                                {!hasOwner && (
                                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                                        Community Animal
                                    </span>
                                )}
                            </div>
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Record ID</span>
                                    <span className="text-xs font-black text-[#1a1208]">{pet.idNumber}</span>
                                </div>
                                <div className="border-t border-gray-50"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Owner</span>
                                    {hasOwner ? (
                                        <span className="text-xs font-black text-[#1a1208] uppercase">{pet.ownerName}</span>
                                    ) : (
                                        <span className="text-xs font-black text-amber-800 uppercase italic">No Owner (Unassigned)</span>
                                    )}
                                </div>
                                <div className="border-t border-gray-50"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Email</span>
                                    <span className="text-xs font-black text-[#1a1208] truncate max-w-[150px]">{hasOwner ? pet.ownerEmail : '—'}</span>
                                </div>
                                <div className="border-t border-gray-50"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contact</span>
                                    <span className="text-xs font-black text-[#1a1208]">{hasOwner ? (pet.ownerPhone || 'No Contact') : '—'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons for Citizen Owner */}
                        {hideRegisteredPets && (
                            <div className="space-y-3">
                                <button 
                                    onClick={() => onEditClick && onEditClick(pet)}
                                    className="w-full py-4 bg-[#F97316] hover:bg-[#E2620D] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit Pet
                                </button>
                                
                                {pet.status?.toLowerCase() !== 'lost' && (
                                    <button 
                                        onClick={() => onReportLostClick && onReportLostClick(pet)}
                                        className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-red-100 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        Report Lost
                                    </button>
                                )}

                                <button 
                                    onClick={handleOpenQrModal}
                                    className="w-full py-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v1m0 11v1m4-12h1a2 2 0 012 2v1m-9 9h1a2 2 0 012 2v1M4 12H3m18 0h-1m-2-5H8a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2z" />
                                    </svg>
                                    View QR Tag
                                </button>

                                <button 
                                    onClick={() => navigate(`/resident/pet/${pet.id}/scan-history`)}
                                    className="w-full py-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                    </svg>
                                    Sighting History
                                </button>

                                <button 
                                    onClick={() => setIsConfirmingDelete(true)}
                                    className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-red-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Remove Pet
                                </button>
                            </div>
                        )}

                        {/* Action Buttons for Subd Leader */}
                        {!hideRegisteredPets && (
                            <div className="space-y-3">
                                {!hasOwner && (
                                    <button 
                                        onClick={() => onEditClick && onEditClick(pet)}
                                        className="w-full py-3.5 bg-orange-50 hover:bg-orange-100 text-[#F97316] rounded-2xl font-black text-xs uppercase tracking-widest border border-orange-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Edit Pet Details
                                    </button>
                                )}

                                <button 
                                    onClick={() => setIsAssignOwnerModalOpen(true)}
                                    className={`w-full py-3.5 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                        hasOwner ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'
                                    }`}
                                >
                                    <span>👤</span>
                                    {hasOwner ? 'Change / Reassign Owner' : '🐾 Assign / Register Owner'}
                                </button>

                                <button 
                                    onClick={handleOpenQrModal}
                                    className="w-full py-3.5 bg-[#F97316] hover:bg-[#E2620D] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v1m0 11v1m4-12h1a2 2 0 012 2v1m-9 9h1a2 2 0 012 2v1M4 12H3m18 0h-1m-2-5H8a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2z" />
                                    </svg>
                                    View QR Tag
                                </button>

                                <button 
                                    onClick={() => navigate(`/resident/pet/${pet.id}/scan-history?mode=subd`)}
                                    className="w-full py-3.5 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                    </svg>
                                    Sighting History
                                </button>

                                <button 
                                    onClick={() => setIsConfirmingDelete(true)}
                                    className="w-full py-3.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-red-200 hover:scale-[1.02] transition-all cursor-pointer flex items-center justify-center gap-2"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Remove Pet Record
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Styled Category Tabs */}
                <div className="space-y-6">
                    <div className="flex items-center gap-8 border-b border-gray-100 overflow-x-auto pb-1 scrollbar-none">
                        {[
                            { id: 'info', label: 'Pet Information' },
                            { id: 'health', label: 'Health Information' },
                            { id: 'behavior', label: 'Behavior Information' },
                            { id: 'incident', label: 'Pet History' }
                        ].map((tab) => (
                            <button 
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`pb-4 text-xs font-black uppercase tracking-widest transition-all relative shrink-0 cursor-pointer ${
                                    activeTab === tab.id ? 'text-[#F97316]' : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                                {tab.label}
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#F97316] rounded-t-full"></div>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Tab Panels */}
                    <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
                        
                        {/* Tab 1: Pet Information */}
                        {activeTab === 'info' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-5">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Base Statistics</h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Gender</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.gender}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Estimated Age</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.age}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Species</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.species}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Physical Attributes</h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Size Category</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.sizeCategory || 'Medium'}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Weight</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.weight || 'Unknown'}</span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Primary Color</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase">{pet.primaryColor || 'Brown'}</span>
                                        </div>
                                        {pet.secondaryColor && pet.secondaryColor !== 'None' && (
                                            <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                                <span className="text-xs font-bold text-gray-500">Secondary Color</span>
                                                <span className="text-xs font-black text-[#1a1208] uppercase">{pet.secondaryColor}</span>
                                            </div>
                                        )}
                                        {pet.tertiaryColor && pet.tertiaryColor !== 'None' && (
                                            <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                                <span className="text-xs font-bold text-gray-500">Third Color (Tertiary)</span>
                                                <span className="text-xs font-black text-[#1a1208] uppercase">{pet.tertiaryColor}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Color Markings</span>
                                            <span className="text-xs font-black text-[#1a1208] uppercase truncate max-w-[200px]">{pet.colorMarkings || 'None'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Registration & Ownership Record */}
                                <div className="space-y-4 md:col-span-2 border-t border-gray-100 pt-6">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Registration & Ownership Record</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div className="bg-[#FAFAF9] p-4 rounded-2xl border border-gray-100/80 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center text-lg font-black shrink-0">
                                                📝
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Registered By</span>
                                                <span className="text-xs font-black text-[#1a1208] truncate block">{pet.registeredByName || pet.rawPetObj?.registered_by_name || 'Subdivision Leader / Staff'}</span>
                                            </div>
                                        </div>

                                        <div className="bg-[#FAFAF9] p-4 rounded-2xl border border-gray-100/80 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-black shrink-0">
                                                📅
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Registration Date</span>
                                                <span className="text-xs font-black text-[#1a1208] truncate block">
                                                    {pet.registeredAt || pet.rawPetObj?.created_at ? new Date(pet.registeredAt || pet.rawPetObj?.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently Registered'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="bg-[#FAFAF9] p-4 rounded-2xl border border-gray-100/80 flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center text-lg font-black shrink-0">
                                                👤
                                            </div>
                                            <div className="min-w-0">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Owner Status</span>
                                                <span className="text-xs font-black text-[#1a1208] truncate block">{hasOwner ? pet.ownerName : 'No Owner Assigned'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab 2: Health Information */}
                        {activeTab === 'health' && (
                            <div className="space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Vaccination Records</h4>
                                        <div className="bg-[#FAFAF9] p-5 rounded-2xl border border-gray-100 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-black text-[#1a1208] uppercase mb-0.5">Rabies & Core Registry</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">
                                                    {pet.isVaccinated ? `Vaccinated on: ${pet.vaccinationDate || 'Unknown'}` : 'Not Registered'}
                                                </p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${pet.isVaccinated ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                {pet.isVaccinated ? 'Vaccinated' : 'Not Vaccinated'}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Spay/Neuter Status</h4>
                                        <div className="bg-[#FAFAF9] p-5 rounded-2xl border border-gray-100 flex items-center justify-between">
                                            <div>
                                                <p className="text-xs font-black text-[#1a1208] uppercase mb-0.5">Spayed / Neutered State</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">Surgical alignment record</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border ${pet.isNeutered ? 'bg-green-50 text-green-600 border-green-100' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                {pet.isNeutered ? 'Neutered' : 'No'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Health Conditions & Remarks</h4>
                                    <div className="bg-[#FAFAF9] p-6 rounded-2xl border border-gray-100">
                                        <p className="text-sm font-semibold text-[#1a1208] leading-relaxed">{pet.healthCondition}</p>
                                        {pet.notes && (
                                            <p className="text-xs font-medium text-gray-400 mt-4 border-t border-gray-200/50 pt-3">
                                                <span className="font-bold uppercase tracking-widest text-[9px]">Additional Notes:</span> {pet.notes}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Supporting Document / Evidence</h4>
                                    {pet.vaccineCardUrl ? (
                                        <div className="bg-[#FAFAF9] p-6 rounded-[2rem] border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-[#F97316]">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                                    </svg>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-[#1a1208] uppercase mb-0.5">Vaccination Card / Support File</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase">Uploaded document for official verification</p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                {!pet.vaccineCardUrl.toLowerCase().endsWith('.pdf') ? (
                                                    <div className="flex items-center gap-4">
                                                        <div 
                                                            className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-all group relative" 
                                                            onClick={() => setIsEvidenceOpen(true)}
                                                        >
                                                            <img src={pet.vaccineCardUrl} alt="Vaccination Evidence" className="w-full h-full object-cover transition-all duration-300 group-hover:scale-110" />
                                                            <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                                </svg>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => setIsEvidenceOpen(true)}
                                                            className="px-5 py-3 bg-[#B35D25] hover:bg-[#974A1A] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                                                        >
                                                            Inspect Document
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <a 
                                                        href={pet.vaccineCardUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-5 py-3 bg-[#B35D25] hover:bg-[#974A1A] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all inline-flex items-center gap-2"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                        </svg>
                                                        Open PDF Document
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-[#FAFAF9] p-8 rounded-[2rem] border border-dashed border-gray-200 text-center flex flex-col items-center justify-center gap-2">
                                            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">No vaccination card or supporting document uploaded</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Tab 3: Behavior Information */}
                        {activeTab === 'behavior' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-5">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Social Temperament</h4>
                                    <div className="bg-[#FAFAF9] p-5 rounded-2xl border border-gray-100 flex items-center justify-between">
                                        <div>
                                            <p className="text-xs font-black text-[#1a1208] uppercase mb-0.5">Temperament Profile</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase">Behavioral classification</p>
                                        </div>
                                        <span className="px-3.5 py-1.5 bg-orange-50 text-[#F97316] border border-orange-100 rounded-full text-[9px] font-black uppercase tracking-widest">
                                            {pet.temperament || 'Friendly'}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest font-bold">Behavior Triggers</h4>
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Has Bite History?</span>
                                            <span className={`text-xs font-black uppercase ${
                                                pet.hasBiteHistory === true ? 'text-red-500' : 
                                                pet.hasBiteHistory === false ? 'text-green-600' : 
                                                'text-amber-500'
                                            }`}>
                                                {pet.hasBiteHistory === true ? 'Yes' : 
                                                 pet.hasBiteHistory === false ? 'No' : 
                                                 'Not Sure'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center bg-[#FAFAF9] px-5 py-3.5 rounded-xl">
                                            <span className="text-xs font-bold text-gray-500">Chase Behavior?</span>
                                            <span className={`text-xs font-black uppercase ${
                                                pet.chaseBehavior === true ? 'text-red-500' : 
                                                pet.chaseBehavior === false ? 'text-green-600' : 
                                                'text-amber-500'
                                            }`}>
                                                {pet.chaseBehavior === true ? 'Yes' : 
                                                 pet.chaseBehavior === false ? 'No' : 
                                                 'Not Sure'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tab 4: Incident History */}
                        {activeTab === 'incident' && (
                            <div className="space-y-8 animate-in fade-in duration-300">
                                {isLoadingIncidents ? (
                                    <div className="py-12 flex flex-col items-center justify-center gap-3">
                                        <div className="w-8 h-8 border-3 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Loading incident & claim records...</p>
                                    </div>
                                ) : incidentClaims.length > 0 || incidentReports.length > 0 ? (
                                    <div className="space-y-6">
                                        <div className="flex items-center justify-between flex-wrap gap-4 border-b border-gray-100 pb-4">
                                            <div>
                                                <h4 className="text-sm font-black text-[#1a1208] uppercase tracking-wider">Pet History & Report Summary</h4>
                                                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Reports and claim records strictly for {pet.name}</p>
                                            </div>
                                            <span className="px-3.5 py-1.5 bg-orange-50 text-[#F97316] rounded-full text-[10px] font-black uppercase tracking-widest border border-orange-100">
                                                {Math.max(incidentClaims.length, incidentReports.length)} Event(s) Recorded
                                            </span>
                                        </div>

                                        <div className="space-y-6">
                                            {incidentReports.map((report: any) => {
                                                const matchingClaim = incidentClaims.find((c: any) => c.report_id === report.report_id);
                                                const mediaPhoto = (report.media && report.media.length > 0) ? report.media[0].file_url : null;
                                                const claimStatus = matchingClaim ? matchingClaim.status : (report.status?.status_name || 'Reported');
                                                const isApproved = claimStatus?.toLowerCase() === 'approved' || report.current_status_id === 9;

                                                return (
                                                    <div key={report.report_id} className="bg-[#FAFAF9] rounded-3xl p-6 border border-gray-100 shadow-sm space-y-6">
                                                        {/* Header Bar */}
                                                        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200/60 pb-4">
                                                            <div className="flex items-center gap-3">
                                                                <span className="w-10 h-10 rounded-2xl bg-orange-50 text-[#F97316] font-black text-xs flex items-center justify-center border border-orange-100 shadow-sm">
                                                                    #{report.report_id}
                                                                </span>
                                                                <div>
                                                                    <h5 className="text-xs font-black text-[#1a1208] uppercase">Reported Stray / Lost Sighting for {pet.name}</h5>
                                                                    <p className="text-[10px] text-gray-400 font-bold uppercase">
                                                                        Date: {new Date(report.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-3">
                                                                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${
                                                                    isApproved ? 'bg-green-50 text-green-600 border-green-100' :
                                                                    claimStatus?.toLowerCase() === 'pending review' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                                                    'bg-blue-50 text-blue-600 border-blue-100'
                                                                }`}>
                                                                    {isApproved ? '✓ Claimed & Approved' : `Claim State: ${claimStatus}`}
                                                                </span>
                                                                <button
                                                                    onClick={() => navigate(`/resident/reports/${report.report_id}`)}
                                                                    className="px-4 py-2.5 bg-[#1a1208] hover:bg-[#2c2010] text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-1.5 shadow-sm hover:scale-[1.02]"
                                                                >
                                                                    View Report
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Body Content */}
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                            {/* Media preview if available */}
                                                            {mediaPhoto ? (
                                                                <div className="w-full h-44 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 shadow-sm relative group">
                                                                    <img src={mediaPhoto} alt="Report Evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                    <span className="absolute bottom-2 left-2 px-2.5 py-1 bg-black/60 backdrop-blur-sm text-white rounded-lg text-[9px] font-bold uppercase tracking-wider">Sighting Media</span>
                                                                </div>
                                                            ) : (
                                                                <div className="w-full h-44 rounded-2xl bg-gray-100 border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 text-xs font-bold uppercase gap-2">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                    </svg>
                                                                    <span>No Photo Attached</span>
                                                                </div>
                                                            )}

                                                            {/* Report Details */}
                                                            <div className="md:col-span-2 space-y-4">
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Sighting Location</span>
                                                                        <span className="text-xs font-black text-[#1a1208] uppercase truncate block">{report.landmark || 'Selera Homes'}</span>
                                                                    </div>
                                                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Condition / Priority</span>
                                                                        <span className="text-xs font-black text-[#F97316] uppercase truncate block">{report.condition || report.priority_level || 'Medium'}</span>
                                                                    </div>
                                                                </div>

                                                                {report.description && (
                                                                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-xs">
                                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Incident Report Notes</span>
                                                                        <p className="text-xs font-semibold text-gray-700 leading-relaxed line-clamp-2">{report.description}</p>
                                                                    </div>
                                                                )}

                                                                {matchingClaim && (
                                                                    <div className="bg-orange-50/70 p-4 rounded-2xl border border-orange-100/80 shadow-xs space-y-1">
                                                                        <span className="text-[9px] font-black text-[#F97316] uppercase tracking-widest block">Claim Resolution & Remarks</span>
                                                                        <p className="text-xs font-bold text-[#1a1208]">
                                                                            {matchingClaim.remarks || "Claim verified and confirmed by authorized subdivision and barangay personnel."}
                                                                        </p>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        {/* Aggressive incidents */}
                                        <div className="bg-[#FAFAF9] p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                                            <div>
                                                <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Aggressive Incidents</h5>
                                                <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">No community-logged aggressive events for {pet.name}.</p>
                                            </div>
                                            <div className="mt-4 flex items-center gap-1.5 text-[9px] font-black text-green-600 uppercase tracking-wider bg-green-50 px-2.5 py-1 rounded-md w-max">
                                                <span>✓</span> Clear Record
                                            </div>
                                        </div>

                                        {/* Reports */}
                                        <div className="bg-[#FAFAF9] p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                                            <div>
                                                <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Sighting Reports</h5>
                                                <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">No citizen-logged stray sightings linked to {pet.name}.</p>
                                            </div>
                                            <div className="mt-4 flex items-center gap-1.5 text-[9px] font-black text-green-600 uppercase tracking-wider bg-green-50 px-2.5 py-1 rounded-md w-max">
                                                <span>✓</span> Clear Record
                                            </div>
                                        </div>

                                        {/* Rescue history */}
                                        <div className="bg-[#FAFAF9] p-6 rounded-2xl border border-gray-100 flex flex-col justify-between">
                                            <div>
                                                <h5 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Rescue Dispatches</h5>
                                                <p className="text-[11px] text-gray-500 font-semibold leading-relaxed">No subdivision or barangay rescue dispatches recorded for {pet.name}.</p>
                                            </div>
                                            <div className="mt-4 flex items-center gap-1.5 text-[9px] font-black text-green-600 uppercase tracking-wider bg-green-50 px-2.5 py-1 rounded-md w-max">
                                                <span>✓</span> Clear Record
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>

            </div>



            {/* Vaccine Card / Evidence Lightbox Modal */}
            {isEvidenceOpen && pet.vaccineCardUrl && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
                    <div 
                        className="absolute inset-0 bg-stone-900/60 backdrop-blur-md animate-in fade-in duration-300"
                        onClick={() => setIsEvidenceOpen(false)}
                    />
                    <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] p-8 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 text-center">
                        <div className="flex justify-between items-center mb-6">
                            <div className="text-left">
                                <h3 className="text-lg font-black text-[#1a1208] uppercase tracking-tight">Vaccine Card & Supporting Evidence</h3>
                                <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest">{pet.name} • {pet.idNumber}</p>
                            </div>
                            <button 
                                onClick={() => setIsEvidenceOpen(false)} 
                                className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#1a1208] hover:bg-gray-50 transition-all cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="w-full max-h-[450px] overflow-auto bg-gray-50 border border-gray-100 rounded-3xl p-4 flex items-center justify-center relative mb-6 shadow-inner group">
                            <img 
                                src={pet.vaccineCardUrl} 
                                className="max-w-full max-h-[400px] object-contain rounded-2xl shadow-md border border-gray-100" 
                                alt="Vaccination Card Evidence" 
                            />
                        </div>

                        <div className="flex gap-4">
                            <button 
                                onClick={() => setIsEvidenceOpen(false)}
                                className="flex-1 py-4 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-widest border border-gray-200 transition-all cursor-pointer"
                            >
                                Close Preview
                            </button>
                            <a 
                                href={pet.vaccineCardUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 py-4 bg-[#B35D25] hover:bg-[#974A1A] text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Open Original
                            </a>
                        </div>
                    </div>
                </div>
            )}
            {/* Assign Owner Modal */}
            {isAssignOwnerModalOpen && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
                    <div 
                        className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300"
                        onClick={() => !isAssigning && setIsAssignOwnerModalOpen(false)}
                    />
                    <div className="relative w-full max-w-lg bg-white rounded-[2.5rem] p-8 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-black text-base shrink-0">
                                    🐾
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-[#1a1208] uppercase tracking-tight">
                                        {hasOwner ? 'Reassign Pet Owner' : 'Assign / Register Pet Owner'}
                                    </h3>
                                    <p className="text-[11px] font-bold text-gray-400">For animal: <span className="text-[#B35D25]">{pet.name} ({pet.idNumber})</span></p>
                                </div>
                            </div>
                            <button 
                                onClick={() => !isAssigning && setIsAssignOwnerModalOpen(false)}
                                className="w-8 h-8 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-900"
                            >
                                ✕
                            </button>
                        </div>

                        {assignError && (
                            <div className="p-3.5 mb-4 bg-red-50 border border-red-200 rounded-2xl text-xs font-bold text-red-700">
                                {assignError}
                            </div>
                        )}

                        {/* Mode Selection Tabs */}
                        <div className="grid grid-cols-2 gap-2 p-1.5 bg-gray-100 rounded-2xl border border-gray-200 mb-6">
                            <button
                                type="button"
                                onClick={() => {
                                    setAssignOwnerMode('existing');
                                    setAssignError(null);
                                }}
                                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 ${assignOwnerMode === 'existing' ? 'bg-white text-[#B35D25] shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                Select Resident
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setAssignOwnerMode('new');
                                    setAssignError(null);
                                }}
                                className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 ${assignOwnerMode === 'new' ? 'bg-[#B35D25] text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                            >
                                + Create New Owner
                            </button>
                        </div>

                        <form onSubmit={handleAssignOwnerSubmit} className="space-y-4">
                            {assignOwnerMode === 'existing' ? (
                                <div className="space-y-3">
                                    <input 
                                        type="text" 
                                        value={userSearchTerm}
                                        onChange={(e) => setUserSearchTerm(e.target.value)}
                                        placeholder="Search resident by name, email, or phone..." 
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] outline-none"
                                    />

                                    {isLoadingUsers ? (
                                        <div className="p-6 text-center text-xs text-gray-400">Loading residents...</div>
                                    ) : filteredUsers.length === 0 ? (
                                        <div className="p-6 text-center text-xs text-gray-400 bg-gray-50 rounded-2xl">
                                            No matching residents found.
                                        </div>
                                    ) : (
                                        <div className="max-h-44 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                            {filteredUsers.map((u) => {
                                                const isSelected = selectedOwner?.user_id === u.user_id;
                                                return (
                                                    <div 
                                                        key={u.user_id}
                                                        onClick={() => setSelectedOwner(u)}
                                                        className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${isSelected ? 'bg-orange-50/70 border-[#B35D25] ring-2 ring-[#B35D25]/20' : 'bg-gray-50/50 border-gray-100 hover:bg-gray-100'}`}
                                                    >
                                                        <div className="min-w-0">
                                                            <h5 className="text-xs font-black text-gray-900 truncate">{u.name}</h5>
                                                            <p className="text-[10px] text-gray-500 truncate">{u.email} {u.phone ? `• ${u.phone}` : ''}</p>
                                                        </div>
                                                        {isSelected && <span className="text-xs font-black text-[#B35D25]">✓</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {selectedOwner && (
                                        <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center justify-between text-xs font-extrabold text-teal-900">
                                            <span>Selected: {selectedOwner.name} ({selectedOwner.email})</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-wider">Full Name *</label>
                                        <input 
                                            type="text" 
                                            value={newOwnerName} 
                                            onChange={(e) => setNewOwnerName(e.target.value)} 
                                            placeholder="Owner's full name"
                                            className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-wider">Email Address *</label>
                                        <input 
                                            type="email" 
                                            value={newOwnerEmail} 
                                            onChange={(e) => setNewOwnerEmail(e.target.value)} 
                                            placeholder="owner@example.com"
                                            className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-wider">Contact Phone</label>
                                        <input 
                                            type="tel" 
                                            value={newOwnerPhone} 
                                            onChange={(e) => setNewOwnerPhone(e.target.value)} 
                                            placeholder="0917 123 4567"
                                            className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-gray-700 uppercase tracking-wider">Subdivision Address</label>
                                        <input 
                                            type="text" 
                                            value={newOwnerAddress} 
                                            onChange={(e) => setNewOwnerAddress(e.target.value)} 
                                            placeholder="Lot / Block / Street"
                                            className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold"
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-4 border-t border-gray-100">
                                <button 
                                    type="button"
                                    onClick={() => setIsAssignOwnerModalOpen(false)}
                                    disabled={isAssigning}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black uppercase tracking-wider"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    disabled={isAssigning}
                                    className="flex-1 py-3 bg-[#B35D25] hover:bg-[#974A1A] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md disabled:opacity-50"
                                >
                                    {isAssigning ? 'Saving...' : 'Confirm Assignment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Remove Pet Confirmation Modal */}
            {isConfirmingDelete && pet && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1a1208]/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="relative w-full max-w-md bg-white rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 animate-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center text-2xl shrink-0 mx-auto border border-red-100 shadow-sm">
                            🐾
                        </div>

                        <div className="text-center space-y-3">
                            <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Remove this pet?</h3>
                            <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                This pet will be removed from your active pet list. Previous reports, records, QR history, and other related information will remain in the system.
                            </p>
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 text-left">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Pet to Remove</span>
                                <span className="text-xs font-black text-gray-900 block mt-0.5">{pet.name} {pet.breed ? `(${pet.breed})` : ''}</span>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button 
                                type="button"
                                onClick={() => setIsConfirmingDelete(false)}
                                disabled={isDeleting}
                                className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button 
                                type="button"
                                onClick={handleDeletePet}
                                disabled={isDeleting}
                                className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-red-900/20 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isDeleting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Removing...</span>
                                    </>
                                ) : (
                                    <span>Remove Pet</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Real StraySafe QR Tag Lightbox Modal */}
            {isQrOpen && (
                <div 
                    className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setIsQrOpen(false)}
                >
                    <div 
                        className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full shadow-2xl border border-amber-100 animate-in zoom-in-95 duration-200 text-center relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setIsQrOpen(false)}
                            className="absolute top-5 right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                        >
                            ✕
                        </button>
                        
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl font-black mx-auto mb-2">
                            🐾
                        </div>
                        <h3 className="text-xl font-black text-[#1a1208] uppercase tracking-tight mb-1">
                            Pet ID QR Code
                        </h3>
                        <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest mb-5">
                            StraySafe Smart Identification Tag
                        </p>

                        <div className="w-56 h-56 mx-auto bg-amber-50/50 border-4 border-dashed border-[#F97316]/30 rounded-3xl p-3 flex flex-col items-center justify-center relative mb-4 shadow-inner">
                            {isLoadingQr ? (
                                <div className="flex flex-col items-center justify-center gap-2">
                                    <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-[11px] text-gray-400 font-bold">Generating real QR tag...</span>
                                </div>
                            ) : qrData?.qr_image_url ? (
                                <img
                                    src={qrData.qr_image_url}
                                    alt="Live StraySafe Pet QR Code"
                                    className="w-full h-full object-contain rounded-2xl shadow-xs bg-white p-1.5"
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center gap-1 text-center p-2">
                                    <span className="text-2xl">⚠️</span>
                                    <span className="text-[11px] text-gray-500 font-bold">QR Tag not generated yet</span>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1 mb-5">
                            <p className="text-lg font-black text-[#1a1208] uppercase">{pet.name}</p>
                            <p className="text-[11px] font-black text-[#F97316] uppercase tracking-widest">{pet.idNumber || `P-${pet.id.padStart(5, '0')}`}</p>
                            {qrData?.qr_token && (
                                <p className="text-[10px] font-mono font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md inline-block mt-1">
                                    Tag ID: {qrData.qr_token.slice(0, 10).toUpperCase()}
                                </p>
                            )}
                            <p className="text-[11px] text-gray-500 font-semibold px-2 pt-1 leading-relaxed">
                                Scan to retrieve vaccine verification, owner contact details, and emergency subdivision records.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsQrOpen(false);
                                    navigate(hideRegisteredPets ? `/resident/pet/${pet.id}/qr` : `/subd/pet/${pet.id}/qr?mode=subd`);
                                }}
                                className="w-full py-3.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                            >
                                <span>Open Full Printable Card</span>
                                <span>↗</span>
                            </button>
                            <button 
                                type="button"
                                onClick={() => setIsQrOpen(false)}
                                className="w-full py-3 bg-[#1a1208] hover:bg-[#2c2010] text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                            >
                                Close QR Tag
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PetDetailPanel;
