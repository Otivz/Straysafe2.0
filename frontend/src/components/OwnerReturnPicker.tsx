import React, { useEffect, useState, useRef } from 'react';
import api from '../utils/api';
import { compressImageFile } from '../utils/imageCompress';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../utils/avatar';
import { PawPrint, ShieldCheck, User, CheckCircle2, Sparkles, CreditCard, Eye, X, Lock } from 'lucide-react';

/** Value edited by the picker. Sent as `owner_return` after prepareOwnerReturn() uploads the photos. */
export interface OwnerReturnValue {
    has_account: boolean;
    return_method?: 'in_person' | 'self_retrieved';
    owner_user_id?: number | null;
    owner_name?: string;
    owner_phone?: string;
    owner_email?: string;
    owner_address?: string;
    relationship_to_animal?: string;
    id_type?: string;
    id_last4?: string;
    notes?: string;
    // client-only: uploaded to the report's media right before submitting
    handoverFile?: File | null;
    proofFiles?: File[];
}

export interface RegisteredOwnerInfo {
    user_id: number;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
}

export interface PetRecordInfo {
    pet_id: number;
    pet_name?: string | null;
    photo_url?: string | null;
    breed?: string | null;
    species?: string | null;
    color?: string | null;
    gender?: string | null;
    reference_code?: string | null;
}

export interface ExistingReturnInfo {
    return_id?: number | null;
    report_id?: number;
    pet_id?: number | null;
    has_account?: boolean;
    owner_user_id?: number | null;
    owner_name?: string;
    owner_phone?: string | null;
    owner_email?: string | null;
    owner_address?: string | null;
    relationship_to_animal?: string;
    id_presented?: string | null;
    id_type?: string | null;
    id_last4?: string | null;
    ownership_verified_by_record?: boolean;
    handover_photo_url?: string | null;
    ownership_proof_urls?: string[];
    notes?: string | null;
    returned_by?: number | null;
    returned_by_name?: string | null;
    returned_at?: string | null;
    is_already_reunited?: boolean;
    claim_id?: number | null;
    claim_status?: string | null;
    pet_name?: string | null;
    pet_breed?: string | null;
    pet_photo_url?: string | null;
}

export const EMPTY_OWNER_RETURN: OwnerReturnValue = {
    has_account: true,
    return_method: 'in_person',
    owner_user_id: null,
    relationship_to_animal: 'Owner'
};

export const ID_TYPES = [
    'PhilSys National ID', "Driver's License", 'Passport', 'UMID / SSS ID', 'PhilHealth ID', "Voter's ID",
    'Postal ID', 'PRC ID', 'Senior Citizen ID', 'Barangay ID', 'Student / School ID', 'Other Government ID',
];

/** True when the selected account already owns the report's registered pet (ID not needed). */
export const isVerifiedByRecord = (v: OwnerReturnValue, petOwnerId?: number | null) =>
    Boolean(v.has_account && v.owner_user_id && petOwnerId && Number(v.owner_user_id) === Number(petOwnerId));

/** Client-side check mirroring the backend rules; returns an error message or null. */
export const ownerReturnError = (v: OwnerReturnValue, petOwnerId?: number | null): string | null => {
    if (v.has_account) {
        if (!v.owner_user_id) return "Search and select the owner's StraySafe account.";
    } else {
        if ((v.owner_name || '').trim().length < 2) return "Enter the owner's full name.";
        if (!(v.owner_phone || '').trim() && !(v.owner_address || '').trim()) return "Enter at least the owner's contact number or address.";
    }
    const isSelfRetrieved = v.return_method === 'self_retrieved';
    if (!v.handoverFile) {
        return isSelfRetrieved
            ? 'Attach a reunion photo (from owner message or animal at home) confirming safe recovery.'
            : 'Take or attach a handover photo (owner with the animal).';
    }
    const last4 = (v.id_last4 || '').trim();
    const verified = isVerifiedByRecord(v, petOwnerId);
    const waiveId = verified || (isSelfRetrieved && v.has_account && Boolean(v.owner_user_id));
    if (!waiveId) {
        if (!v.id_type) return 'Select the type of ID the owner presented.';
        if (!/^\d{4}$/.test(last4)) return "Enter the last 4 digits of the owner's ID number.";
    } else if (last4 && !/^\d{4}$/.test(last4)) {
        return "The ID's last 4 digits must be exactly 4 numbers.";
    }
    return null;
};

/** Uploads the proof photos to the report and returns the API payload (media ids, no File objects). */
export const prepareOwnerReturn = async (reportId: number, v: OwnerReturnValue) => {
    const upload = async (file: File) => {
        const fd = new FormData();
        fd.append('file', await compressImageFile(file));
        fd.append('is_evidence', 'true');
        fd.append('status_id', '9');
        const res = await api.post(`/reports/${reportId}/media`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        if (!res.data?.media_id) throw new Error('Photo upload failed');
        return res.data.media_id as number;
    };
    const { handoverFile, proofFiles, ...rest } = v;
    return {
        ...rest,
        return_method: v.return_method || 'in_person',
        handover_media_id: handoverFile ? await upload(handoverFile) : undefined,
        ownership_proof_media_ids: proofFiles && proofFiles.length ? await Promise.all(proofFiles.map(upload)) : undefined,
    };
};

interface OwnerHit { user_id: number; name: string; phone?: string | null; email?: string | null; address?: string | null }

interface Props {
    value: OwnerReturnValue;
    onChange: (v: OwnerReturnValue) => void;
    /** owner_id of the report's registered pet, if any (a matching account makes the ID optional) */
    petOwnerId?: number | null;
    /** Registered owner info from the database (if already on record) */
    registeredOwner?: RegisteredOwnerInfo | null;
    /** Registered pet record from the database (if already on record) */
    petRecord?: PetRecordInfo | null;
    /** Optional pet_id to auto-fetch record from DB if not passed directly */
    petId?: number | null;
    /** Optional report_id to auto-fetch record from DB if not passed directly */
    reportId?: number | null;
    /** Pre-loaded existing return record if report/case is already reunited */
    existingReturn?: ExistingReturnInfo | null;
    /** Callback fired when an existing return is loaded/detected */
    onAlreadyReturned?: (returnInfo: ExistingReturnInfo | null) => void;
}

const inputCls = 'w-full px-3 py-2.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500';

const OwnerReturnPicker: React.FC<Props> = ({
    value,
    onChange,
    petOwnerId,
    registeredOwner,
    petRecord,
    petId,
    reportId,
    existingReturn,
    onAlreadyReturned,
}) => {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<OwnerHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<OwnerHit | null>(null);
    const [handoverPreview, setHandoverPreview] = useState<string | null>(null);
    const [existingReturnData, setExistingReturnData] = useState<ExistingReturnInfo | null>(existingReturn || null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

    // Track if staff explicitly opted out of account mode or changed owner
    const userManuallyDeselectedRef = useRef(false);

    // Database detected pet and owner records
    const [detectedPet, setDetectedPet] = useState<PetRecordInfo | null>(petRecord || null);
    const [detectedOwner, setDetectedOwner] = useState<RegisteredOwnerInfo | null>(registeredOwner || null);
    const [ownerSelectMode, setOwnerSelectMode] = useState<'registered' | 'search'>('registered');

    // Sync incoming props
    useEffect(() => {
        if (existingReturn !== undefined) {
            setExistingReturnData(existingReturn);
            if (onAlreadyReturned) onAlreadyReturned(existingReturn);
        }
    }, [existingReturn, onAlreadyReturned]);

    // Auto-fetch existing return if reportId provided and existingReturn not passed
    useEffect(() => {
        if (reportId && existingReturn === undefined) {
            let cancelled = false;
            api.get(`/report-returns/by-report/${reportId}`)
                .then((res) => {
                    if (cancelled) return;
                    if (res.data) {
                        setExistingReturnData(res.data);
                        if (onAlreadyReturned) onAlreadyReturned(res.data);
                    } else {
                        setExistingReturnData(null);
                        if (onAlreadyReturned) onAlreadyReturned(null);
                    }
                })
                .catch(() => {
                    if (!cancelled) {
                        setExistingReturnData(null);
                        if (onAlreadyReturned) onAlreadyReturned(null);
                    }
                });
            return () => { cancelled = true; };
        }
    }, [reportId, existingReturn, onAlreadyReturned]);

    useEffect(() => {
        if (registeredOwner) {
            setDetectedOwner(registeredOwner);
        }
    }, [registeredOwner]);

    useEffect(() => {
        if (petRecord) {
            setDetectedPet(petRecord);
        }
    }, [petRecord]);

    // If reportId is provided but petRecord or owner is missing, fetch directly from DB (/reports/{reportId})
    useEffect(() => {
        if (reportId && (!detectedPet || !detectedOwner)) {
            let cancelled = false;
            api.get(`/reports/${reportId}`)
                .then((res) => {
                    if (cancelled) return;
                    const r = res.data;
                    if (r) {
                        if (!detectedPet && (r.pet_id || r.pet_name || r.matched_pet_record)) {
                            const matched = r.matched_pet_record || {};
                            setDetectedPet({
                                pet_id: r.pet_id || matched.pet_id,
                                pet_name: r.pet_name || matched.pet_name || r.animal_type || 'Animal',
                                photo_url: r.pet_photo_url || matched.photo_url || (r.media && r.media[0]?.file_url),
                                breed: r.pet_breed || r.animal_breed || matched.breed,
                                species: r.animal_type || 'Animal',
                                color: r.animal_color || matched.color,
                            });
                        }
                        if (!detectedOwner && r.owner_id && r.owner_name) {
                            setDetectedOwner({
                                user_id: r.owner_id,
                                name: r.owner_name,
                                phone: r.owner_phone,
                                email: r.owner_email,
                                address: r.owner_address,
                            });
                        }
                    }
                })
                .catch((err) => console.warn('Could not auto-fetch report record for return picker:', err));
            return () => { cancelled = true; };
        }
    }, [reportId]);

    // If petId is provided but petRecord or owner is missing, fetch directly from DB (/pets/{petId})
    useEffect(() => {
        const targetPetId = petId || petRecord?.pet_id;
        if (targetPetId && (!detectedPet || !detectedOwner)) {
            let cancelled = false;
            api.get(`/pets/${targetPetId}`)
                .then((res) => {
                    if (cancelled) return;
                    const p = res.data;
                    if (p) {
                        if (!detectedPet) {
                            setDetectedPet({
                                pet_id: p.pet_id,
                                pet_name: p.pet_name,
                                photo_url: p.photo_url,
                                breed: p.breed,
                                species: p.pet_type,
                                color: p.color_markings,
                                reference_code: p.reference_code,
                            });
                        }
                        if (!detectedOwner && p.owner) {
                            setDetectedOwner({
                                user_id: p.owner.user_id,
                                name: p.owner.name,
                                phone: p.owner.phone,
                                email: p.owner.email,
                                address: p.owner.address,
                            });
                        }
                    }
                })
                .catch((err) => console.warn('Could not auto-fetch pet record for return picker:', err));
            return () => { cancelled = true; };
        }
    }, [petId, petRecord?.pet_id]);

    // If petOwnerId is provided and detectedOwner is missing, fetch owner account details
    useEffect(() => {
        const targetOwnerId = petOwnerId || detectedOwner?.user_id;
        if (targetOwnerId && !detectedOwner) {
            let cancelled = false;
            api.get('/report-returns/owner-search', { params: { q: String(targetOwnerId) } })
                .then((res) => {
                    if (cancelled) return;
                    const match = (res.data || []).find((u: any) => Number(u.user_id) === Number(targetOwnerId));
                    if (match) setDetectedOwner(match);
                })
                .catch(() => {});
            return () => { cancelled = true; };
        }
    }, [petOwnerId]);

    // Automatic Owner Detection & Pre-filling:
    useEffect(() => {
        if (!detectedOwner) return;

        // Automatically select account mode if not manually deselected
        if (!userManuallyDeselectedRef.current && !value.has_account) {
            setSelected({
                user_id: detectedOwner.user_id,
                name: detectedOwner.name,
                phone: detectedOwner.phone,
                email: detectedOwner.email,
                address: detectedOwner.address,
            });
            setOwnerSelectMode('registered');
            onChange({
                ...value,
                has_account: true,
                owner_user_id: detectedOwner.user_id,
                relationship_to_animal: value.relationship_to_animal || 'Owner',
            });
            return;
        }

        // Automatically pre-fill registered owner if in has_account mode and not explicitly changed
        if (value.has_account) {
            const isMatch = value.owner_user_id && Number(value.owner_user_id) === Number(detectedOwner.user_id);
            const isUnset = !value.owner_user_id;

            if (isUnset || isMatch) {
                if (!selected || Number(selected.user_id) !== Number(detectedOwner.user_id)) {
                    setSelected({
                        user_id: detectedOwner.user_id,
                        name: detectedOwner.name,
                        phone: detectedOwner.phone,
                        email: detectedOwner.email,
                        address: detectedOwner.address,
                    });
                    setOwnerSelectMode('registered');
                }
                if (Number(value.owner_user_id) !== Number(detectedOwner.user_id) || !value.relationship_to_animal) {
                    onChange({
                        ...value,
                        has_account: true,
                        owner_user_id: detectedOwner.user_id,
                        relationship_to_animal: value.relationship_to_animal || 'Owner',
                    });
                }
            }
        }
    }, [detectedOwner, value.has_account, value.owner_user_id]);

    // Owner search query debounced lookup
    useEffect(() => {
        if (!value.has_account || (selected && ownerSelectMode === 'registered')) return;
        const q = query.trim();
        if (q.length < 2) { setHits([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await api.get('/report-returns/owner-search', { params: { q } });
                setHits(Array.isArray(res.data) ? res.data : []);
            } catch {
                setHits([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [query, value.has_account, selected, ownerSelectMode]);

    useEffect(() => {
        if (!value.handoverFile) { setHandoverPreview(null); return; }
        const url = URL.createObjectURL(value.handoverFile);
        setHandoverPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [value.handoverFile]);

    const set = (patch: Partial<OwnerReturnValue>) => onChange({ ...value, ...patch });
    const verified = isVerifiedByRecord(value, petOwnerId || detectedOwner?.user_id);

    const setMode = (has_account: boolean) => {
        if (has_account) {
            userManuallyDeselectedRef.current = false;
            if (detectedOwner) {
                // Re-select registered owner automatically
                setSelected({
                    user_id: detectedOwner.user_id,
                    name: detectedOwner.name,
                    phone: detectedOwner.phone,
                    email: detectedOwner.email,
                    address: detectedOwner.address,
                });
                setOwnerSelectMode('registered');
                setQuery('');
                setHits([]);
                onChange({
                    ...value,
                    has_account: true,
                    owner_user_id: detectedOwner.user_id,
                    relationship_to_animal: value.relationship_to_animal || 'Owner',
                });
            } else {
                setSelected(null);
                setOwnerSelectMode('search');
                setQuery('');
                setHits([]);
                onChange({
                    ...value,
                    has_account: true,
                    owner_user_id: null,
                    relationship_to_animal: value.relationship_to_animal || 'Owner',
                });
            }
        } else {
            userManuallyDeselectedRef.current = true;
            setSelected(null);
            setOwnerSelectMode('search');
            setQuery('');
            setHits([]);
            onChange({
                has_account: false,
                owner_user_id: null,
                relationship_to_animal: value.relationship_to_animal || 'Owner',
                id_type: value.id_type,
                id_last4: value.id_last4,
                notes: value.notes,
                handoverFile: value.handoverFile,
                proofFiles: value.proofFiles,
            });
        }
    };

    const pick = (u: OwnerHit) => {
        setSelected(u);
        setHits([]);
        set({ owner_user_id: u.user_id });
        if (detectedOwner && Number(u.user_id) === Number(detectedOwner.user_id)) {
            setOwnerSelectMode('registered');
            userManuallyDeselectedRef.current = false;
        } else {
            setOwnerSelectMode('search');
            userManuallyDeselectedRef.current = true;
        }
    };

    if (existingReturnData) {
        return (
            <div className="space-y-4 p-4 sm:p-5 rounded-2xl border-2 border-emerald-400 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm animate-in fade-in duration-200" data-testid="animal-already-reunited-card">
                {/* Banner Header */}
                <div className="p-4 rounded-2xl bg-white dark:bg-stone-900 border-2 border-emerald-200 dark:border-emerald-800 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                Animal Already Reunited • Handover Complete
                            </span>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Official Record on File
                        </span>
                    </div>

                    <p className="text-[11px] text-emerald-800 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2">
                        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>The physical handover for this animal has already been verified and officially recorded. Duplicate handover submissions are disabled to maintain custody audit integrity.</span>
                    </p>

                    {/* Animal Details */}
                    {(existingReturnData.pet_name || detectedPet) && (
                        <div className="flex items-center gap-3 pt-2 border-t border-emerald-100 dark:border-emerald-900/40">
                            <img
                                src={getPetPicture(existingReturnData.pet_photo_url || detectedPet?.photo_url)}
                                alt={existingReturnData.pet_name || detectedPet?.pet_name || 'Animal'}
                                className="w-12 h-12 rounded-xl object-cover border border-emerald-200 dark:border-emerald-800 shadow-2xs bg-stone-100"
                                onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                            />
                            <div className="min-w-0 flex-1">
                                <h4 className="text-xs font-black text-gray-900 dark:text-white truncate">
                                    {existingReturnData.pet_name || detectedPet?.pet_name || 'Registered Animal'}
                                </h4>
                                <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                    {[existingReturnData.pet_breed || detectedPet?.breed, detectedPet?.color].filter(Boolean).join(' • ') || 'Animal Record'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Return Recipient & ID Verification Summary */}
                <div className="p-4 rounded-2xl bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-800 space-y-3 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Owner / Recipient Information */}
                        <div className="space-y-1.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                                <User className="w-3 h-3 text-emerald-600" />
                                Returned To Recipient
                            </span>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-gray-900 dark:text-white text-xs">
                                    {existingReturnData.owner_name || 'Registered Resident'}
                                </span>
                                {existingReturnData.has_account ? (
                                    <span className="text-[9px] font-mono font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                        Account #{existingReturnData.owner_user_id}
                                    </span>
                                ) : (
                                    <span className="text-[9px] font-bold text-stone-600 dark:text-stone-400 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded">
                                        Offline Resident
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] text-gray-600 dark:text-stone-300">
                                Relationship: <strong className="font-bold text-emerald-700 dark:text-emerald-400">{existingReturnData.relationship_to_animal || 'Owner'}</strong>
                            </p>
                            {[existingReturnData.owner_phone, existingReturnData.owner_email].filter(Boolean).length > 0 && (
                                <p className="text-[10px] text-gray-500 dark:text-stone-400 truncate">
                                    {existingReturnData.owner_phone && <span>📞 {existingReturnData.owner_phone}</span>}
                                    {existingReturnData.owner_phone && existingReturnData.owner_email && <span> • </span>}
                                    {existingReturnData.owner_email && <span>✉️ {existingReturnData.owner_email}</span>}
                                </p>
                            )}
                            {existingReturnData.owner_address && (
                                <p className="text-[10px] text-gray-500 dark:text-stone-400 truncate">
                                    📍 {existingReturnData.owner_address}
                                </p>
                            )}
                        </div>

                        {/* ID Verification & Officer Attribution */}
                        <div className="space-y-1.5 p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1">
                                <CreditCard className="w-3 h-3 text-emerald-600" />
                                Identification & Handover Officer
                            </span>
                            <div className="text-[11px] space-y-1">
                                <p className="text-gray-700 dark:text-stone-300">
                                    ID Type: <strong className="font-black text-gray-900 dark:text-white">{existingReturnData.id_type || (existingReturnData.ownership_verified_by_record ? 'Verified via Registered Profile' : 'Government ID')}</strong>
                                </p>
                                {existingReturnData.id_last4 ? (
                                    <p className="text-gray-700 dark:text-stone-300 font-mono">
                                        Last 4 Digits: <strong className="font-black text-emerald-700 dark:text-emerald-400">•••• •••• •••• {existingReturnData.id_last4}</strong>
                                    </p>
                                ) : existingReturnData.ownership_verified_by_record ? (
                                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                                        ✓ Matched Registered Pet Owner
                                    </p>
                                ) : null}
                                <div className="pt-1.5 mt-1 border-t border-stone-200 dark:border-stone-700 text-[10px] space-y-0.5">
                                    <p className="text-gray-600 dark:text-stone-400">
                                        Handled By: <strong className="text-gray-800 dark:text-stone-200 font-bold">{existingReturnData.returned_by_name || 'Authorized Staff'}</strong>
                                    </p>
                                    {existingReturnData.returned_at && (
                                        <p className="text-gray-500 dark:text-stone-400">
                                            Date: {new Date(existingReturnData.returned_at).toLocaleString()}
                                        </p>
                                    )}
                                    {existingReturnData.claim_id && (
                                        <p className="text-[9px] font-bold text-emerald-700 dark:text-emerald-400">
                                            Synced from Pet Claim #{existingReturnData.claim_id}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Handover Evidence Photo */}
                    {existingReturnData.handover_photo_url && (
                        <div className="space-y-1.5 pt-2 border-t border-stone-100 dark:border-stone-800">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 block">
                                Official Handover Proof Photo
                            </span>
                            <div className="relative inline-block group">
                                <img
                                    src={existingReturnData.handover_photo_url}
                                    alt="Physical Handover Proof"
                                    className="w-32 h-32 sm:w-40 sm:h-40 object-cover rounded-2xl border-2 border-emerald-300 shadow-sm cursor-pointer group-hover:opacity-90 transition-opacity"
                                    onClick={() => setLightboxUrl(existingReturnData.handover_photo_url || null)}
                                />
                                <button
                                    type="button"
                                    onClick={() => setLightboxUrl(existingReturnData.handover_photo_url || null)}
                                    className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 hover:bg-black/90 text-white text-[9px] font-bold rounded-lg flex items-center gap-1 shadow-md cursor-pointer"
                                >
                                    <Eye className="w-3 h-3" /> View
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Ownership Proof Gallery */}
                    {Array.isArray(existingReturnData.ownership_proof_urls) && existingReturnData.ownership_proof_urls.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-stone-100 dark:border-stone-800">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 block">
                                Additional Ownership Evidence ({existingReturnData.ownership_proof_urls.length})
                            </span>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {existingReturnData.ownership_proof_urls.map((url, idx) => (
                                    <img
                                        key={idx}
                                        src={url}
                                        alt={`Ownership Proof ${idx + 1}`}
                                        className="w-16 h-16 object-cover rounded-xl border border-stone-200 cursor-pointer hover:border-emerald-500 transition-colors shrink-0"
                                        onClick={() => setLightboxUrl(url)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Officer Notes */}
                    {existingReturnData.notes && (
                        <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-[11px] text-gray-700 dark:text-stone-300">
                            <span className="font-bold text-[9px] uppercase tracking-widest text-gray-400 block mb-0.5">Notes</span>
                            {existingReturnData.notes}
                        </div>
                    )}
                </div>

                {/* Lightbox Modal */}
                {lightboxUrl && (
                    <div
                        className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in"
                        onClick={() => setLightboxUrl(null)}
                    >
                        <div className="relative max-w-3xl max-h-[90vh] bg-stone-900 rounded-3xl p-2 overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                            <button
                                type="button"
                                onClick={() => setLightboxUrl(null)}
                                className="absolute top-4 right-4 p-2 rounded-full bg-black/60 text-white hover:bg-black cursor-pointer z-10"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <img src={lightboxUrl} alt="Enlarged Proof" className="max-w-full max-h-[85vh] object-contain rounded-2xl mx-auto" />
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-3.5 p-4 sm:p-5 rounded-2xl border-2 border-emerald-300 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/10 shadow-xs" data-testid="owner-return-picker">
            
            {/* Animal Pet Record & Registered Ownership Information Display */}
            {(detectedPet || detectedOwner) && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-white dark:bg-stone-900 border-2 border-emerald-200 dark:border-emerald-800 shadow-2xs space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-[10px] font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-widest flex items-center gap-1.5">
                                <PawPrint className="w-3.5 h-3.5 text-emerald-600" />
                                Existing Pet Record & Ownership Information
                            </span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                            {detectedOwner ? 'Registered Owner Linked' : 'Registered Pet Record'}
                        </span>
                    </div>

                    <div className="flex items-start gap-3.5">
                        <img
                            src={getPetPicture(detectedPet?.photo_url)}
                            alt={detectedPet?.pet_name || 'Animal'}
                            className="w-14 h-14 rounded-2xl object-cover border-2 border-white dark:border-stone-800 shadow-sm shrink-0 bg-stone-100 dark:bg-stone-800"
                            onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-xs sm:text-sm font-black text-gray-900 dark:text-white truncate">
                                    {detectedPet?.pet_name || 'Registered Animal'}
                                </h4>
                                {detectedPet?.pet_id && (
                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                                        Pet ID #{detectedPet.pet_id}
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400">
                                {[detectedPet?.species || 'Animal', detectedPet?.breed, detectedPet?.color].filter(Boolean).join(' • ')}
                            </p>

                            {detectedOwner ? (
                                <div className="mt-2 pt-2 border-t border-emerald-100 dark:border-emerald-900/50 text-[10px] space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-gray-700 dark:text-stone-300 flex items-center gap-1.5">
                                            <User className="w-3 h-3 text-emerald-600" />
                                            Registered Owner: <strong className="text-emerald-700 dark:text-emerald-400 font-black">{detectedOwner.name}</strong>
                                        </span>
                                        <span className="text-[9px] font-mono font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                            Account #{detectedOwner.user_id}
                                        </span>
                                    </div>
                                    {[detectedOwner.phone, detectedOwner.email].filter(Boolean).length > 0 && (
                                        <p className="text-gray-500 dark:text-stone-400 truncate flex items-center gap-1">
                                            {detectedOwner.phone && <span>📞 {detectedOwner.phone}</span>}
                                            {detectedOwner.phone && detectedOwner.email && <span>•</span>}
                                            {detectedOwner.email && <span>✉️ {detectedOwner.email}</span>}
                                        </p>
                                    )}
                                    {detectedOwner.address && (
                                        <p className="text-gray-500 dark:text-stone-400 truncate flex items-center gap-1">
                                            📍 {detectedOwner.address}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="mt-2 pt-2 border-t border-amber-100 dark:border-amber-900/50 text-[10px]">
                                    <p className="text-amber-800 dark:text-amber-400 font-semibold italic">
                                        No registered owner linked to this pet record (Community / Stray animal).
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Return Method / Handover Circumstance Selector */}
            <div className="space-y-1.5">
                <p className="text-[10px] font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-widest">
                    Return Method / Handover Circumstance <span className="text-red-500">*</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                        {
                            key: 'in_person',
                            title: 'Physical Staff Handover',
                            sub: 'Officer/facility releasing animal in person (ID check + physical photo)',
                        },
                        {
                            key: 'self_retrieved',
                            title: 'Direct Owner Recovery / Self-Retrieved',
                            sub: 'Owner recovered animal directly before custody (ID waived for registered accounts)',
                        },
                    ].map((opt) => {
                        const isSelected = (value.return_method || 'in_person') === opt.key;
                        return (
                            <button
                                key={opt.key}
                                type="button"
                                onClick={() => set({ return_method: opt.key as 'in_person' | 'self_retrieved' })}
                                className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                                    isSelected
                                        ? 'border-emerald-500 bg-white dark:bg-stone-900 shadow-sm ring-1 ring-emerald-400/30'
                                        : 'border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-stone-900/40 hover:border-stone-300'
                                }`}
                            >
                                <span className="block text-xs font-black text-[#1a1208] dark:text-stone-100 flex items-center justify-between">
                                    <span>{opt.title}</span>
                                    {isSelected && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                                </span>
                                <span className="block text-[10px] font-semibold text-gray-500 mt-0.5">{opt.sub}</span>
                            </button>
                        );
                    })}
                </div>
                {value.return_method === 'self_retrieved' && (
                    <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 space-y-0.5">
                        <p className="font-bold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Remote / Direct Recovery Mode</span>
                        </p>
                        <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed">
                            No physical meeting required. In-person ID check is waived for registered residents. You can attach a photo or screenshot sent by the owner (via Viber, Messenger, or SMS) showing the pet safe at home.
                        </p>
                    </div>
                )}
            </div>

            <p className="text-[10px] font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-widest">
                Who was the animal returned to? <span className="text-red-500">*</span>
            </p>

            {/* Account Type Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                    { key: true, title: 'Owner has a StraySafe account', sub: detectedOwner ? 'Auto-linked to registered owner' : 'Search and link the existing account' },
                    { key: false, title: 'Owner has no StraySafe account', sub: "Enter the owner's details manually" },
                ].map((opt) => (
                    <button
                        key={String(opt.key)}
                        type="button"
                        onClick={() => setMode(opt.key)}
                        className={`text-left p-3 rounded-xl border-2 transition-all cursor-pointer ${
                            value.has_account === opt.key
                                ? 'border-emerald-500 bg-white dark:bg-stone-900 shadow-sm'
                                : 'border-stone-200 dark:border-stone-700 bg-white/60 dark:bg-stone-900/40 hover:border-stone-300'
                        }`}
                    >
                        <span className="block text-xs font-black text-[#1a1208] dark:text-stone-100">{opt.title}</span>
                        <span className="block text-[10px] font-semibold text-gray-500 mt-0.5">{opt.sub}</span>
                    </button>
                ))}
            </div>

            {value.has_account ? (
                <div className="space-y-2">
                    {/* Owner Selection Dropdown when registered owner exists */}
                    {detectedOwner && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                                Owner Selection
                            </label>
                            <select
                                value={ownerSelectMode}
                                onChange={(e) => {
                                    const mode = e.target.value as 'registered' | 'search';
                                    setOwnerSelectMode(mode);
                                    if (mode === 'registered') {
                                        pick({
                                            user_id: detectedOwner.user_id,
                                            name: detectedOwner.name,
                                            phone: detectedOwner.phone,
                                            email: detectedOwner.email,
                                            address: detectedOwner.address,
                                        });
                                    } else {
                                        setSelected(null);
                                        set({ owner_user_id: null });
                                    }
                                }}
                                className={inputCls}
                            >
                                <option value="registered">
                                    ✓ Registered Owner: {detectedOwner.name} (Account #{detectedOwner.user_id})
                                </option>
                                <option value="search">
                                    Search for a different resident account...
                                </option>
                            </select>
                        </div>
                    )}

                    {selected ? (
                        <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-stone-900 border-2 border-emerald-400 dark:border-emerald-700 shadow-xs">
                            <div className="min-w-0 text-xs space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <p className="font-black text-gray-900 dark:text-white truncate">{selected.name}</p>
                                    {detectedOwner && Number(selected.user_id) === Number(detectedOwner.user_id) ? (
                                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                            Registered Owner
                                        </span>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-300">
                                            Account #{selected.user_id}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-500 truncate">
                                    {[selected.phone, selected.email].filter(Boolean).join(' • ') || 'No contact on file'}
                                </p>
                                {selected.address && <p className="text-[10px] text-gray-500 truncate">{selected.address}</p>}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setSelected(null);
                                    setOwnerSelectMode('search');
                                    set({ owner_user_id: null });
                                }}
                                className="text-[10px] font-black text-emerald-700 hover:text-emerald-900 uppercase cursor-pointer shrink-0 py-1 px-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                            >
                                Change
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-1.5">
                            {detectedOwner && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        pick({
                                            user_id: detectedOwner.user_id,
                                            name: detectedOwner.name,
                                            phone: detectedOwner.phone,
                                            email: detectedOwner.email,
                                            address: detectedOwner.address,
                                        });
                                    }}
                                    className="w-full text-left p-2.5 rounded-xl border border-emerald-300 bg-emerald-50/80 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-950/70 transition-all flex items-center justify-between gap-2 cursor-pointer"
                                >
                                    <div className="min-w-0">
                                        <span className="block text-[11px] font-black text-emerald-950 dark:text-emerald-200">
                                            ↺ Select Registered Owner: {detectedOwner.name}
                                        </span>
                                        <span className="block text-[9px] text-emerald-800 dark:text-emerald-400 truncate">
                                            {[detectedOwner.phone, detectedOwner.email, detectedOwner.address].filter(Boolean).join(' • ')}
                                        </span>
                                    </div>
                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider bg-emerald-600 text-white shrink-0">
                                        Re-select
                                    </span>
                                </button>
                            )}

                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name, email or phone (min. 2 characters)"
                                className={inputCls}
                            />
                            {searching && <p className="text-[10px] text-gray-500">Searching database…</p>}
                            {!searching && query.trim().length >= 2 && hits.length === 0 && (
                                <p className="text-[10px] text-gray-500">
                                    No matching resident account in your area. If the owner is not registered, choose "Owner has no StraySafe account".
                                </p>
                            )}
                            {hits.length > 0 && (
                                <div className="max-h-44 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 divide-y divide-stone-100 dark:divide-stone-800">
                                    {hits.map((u) => (
                                        <button
                                            key={u.user_id}
                                            type="button"
                                            onClick={() => pick(u)}
                                            className="w-full text-left px-3 py-2 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                                        >
                                            <span className="block text-xs font-bold text-gray-900 dark:text-white">{u.name}</span>
                                            <span className="block text-[10px] text-gray-500">{[u.phone, u.email].filter(Boolean).join(' • ')}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={`${inputCls} sm:col-span-2`} placeholder="Owner's full name *" value={value.owner_name || ''} onChange={(e) => set({ owner_name: e.target.value })} maxLength={150} />
                    <input className={inputCls} placeholder="Contact number" value={value.owner_phone || ''} onChange={(e) => set({ owner_phone: e.target.value })} maxLength={30} inputMode="tel" />
                    <input className={inputCls} placeholder="Email (optional)" value={value.owner_email || ''} onChange={(e) => set({ owner_email: e.target.value })} maxLength={120} type="email" />
                    <input className={`${inputCls} sm:col-span-2`} placeholder="Address" value={value.owner_address || ''} onChange={(e) => set({ owner_address: e.target.value })} maxLength={255} />
                    <p className="sm:col-span-2 text-[10px] text-gray-500">A contact number or address is required. No StraySafe account will be created.</p>
                </div>
            )}

            {/* Relationship Dropdown */}
            <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block">
                    Relationship to Animal
                </label>
                <select className={inputCls} value={value.relationship_to_animal || 'Owner'} onChange={(e) => set({ relationship_to_animal: e.target.value })}>
                    <option value="Owner">Owner</option>
                    <option value="Family Member">Family member of owner</option>
                    <option value="Caregiver">Caregiver</option>
                    <option value="Authorized Representative">Authorized representative</option>
                </select>
            </div>

            {/* Proof of return */}
            <div className="space-y-2 pt-2 border-t border-emerald-200/70 dark:border-emerald-900/50">
                <p className="text-[10px] font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-widest">Proof of Return</p>

                {(() => {
                    const isSelfRetrieved = value.return_method === 'self_retrieved';
                    const idOptional = verified || (isSelfRetrieved && value.has_account && Boolean(value.owner_user_id));

                    return (
                        <>
                            {isSelfRetrieved && value.has_account && value.owner_user_id ? (
                                <p className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>Direct Owner Recovery: Identity verified via active StraySafe account — physical ID is optional.</span>
                                </p>
                            ) : verified ? (
                                <p className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>This account is the registered owner of the pet record — ID is optional.</span>
                                </p>
                            ) : null}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <select className={inputCls} value={value.id_type || ''} onChange={(e) => set({ id_type: e.target.value })}>
                                    <option value="">{idOptional ? 'ID presented (optional)' : 'ID presented *'}</option>
                                    {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                                <input
                                    className={inputCls}
                                    placeholder={idOptional ? 'Last 4 digits of ID (optional)' : 'Last 4 digits of ID *'}
                                    value={value.id_last4 || ''}
                                    onChange={(e) => set({ id_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                    inputMode="numeric"
                                    maxLength={4}
                                />
                            </div>
                            <p className="text-[10px] text-gray-500">
                                {isSelfRetrieved
                                    ? 'Check ID if presented. For registered residents, in-person ID inspection is waived.'
                                    : 'Check the ID in person. Only the ID type and last 4 digits are saved, never a photo of the ID.'}
                            </p>

                            <label className="block">
                                <span className="block text-[10px] font-bold text-gray-700 dark:text-stone-300 mb-1">
                                    {isSelfRetrieved
                                        ? 'Reunion proof photo (animal safe with owner or at home) *'
                                        : 'Handover photo (owner with the animal) *'}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(e) => set({ handoverFile: e.target.files?.[0] || null })}
                                    className="block w-full text-[11px] file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold file:cursor-pointer"
                                />
                                {isSelfRetrieved && (
                                    <span className="block text-[10px] text-gray-400 mt-1">
                                        Attach the photo or screenshot sent by the owner (via Viber, Messenger, or SMS) showing the pet back at home.
                                    </span>
                                )}
                            </label>
                        </>
                    );
                })()}
                {handoverPreview && <img src={handoverPreview} alt="Handover" className="w-24 h-24 object-cover rounded-xl border border-emerald-300" />}

                <label className="block">
                    <span className="block text-[10px] font-bold text-gray-700 dark:text-stone-300 mb-1">
                        Proof of ownership (optional: vaccination card, old photos with the pet; up to 5)
                    </span>
                    <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => set({ proofFiles: Array.from(e.target.files || []).slice(0, 5) })}
                        className="block w-full text-[11px] file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-stone-200 file:text-stone-800 file:font-bold file:cursor-pointer"
                    />
                </label>
                {(value.proofFiles?.length || 0) > 0 && <p className="text-[10px] text-gray-500">{value.proofFiles!.length} file(s) attached</p>}
            </div>
        </div>
    );
};

export default OwnerReturnPicker;
