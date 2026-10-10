import React, { useEffect, useState, useRef } from 'react';
import api from '../utils/api';
import { compressImageFile } from '../utils/imageCompress';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../utils/avatar';
import { PawPrint, ShieldCheck, User, CheckCircle2, Sparkles, CreditCard, Eye, X, Lock, ExternalLink, Camera, Send, Loader2, AlertTriangle } from 'lucide-react';

export interface ProofOnFile {
    has_proof: boolean;
    claim_id?: number;
    report_id?: number;
    pet_id?: number;
    documents?: string[];
    vaccine_card_url?: string;
    vet_record_url?: string;
    registration_record_url?: string;
    additional_photos_url?: string;
    evidence_url?: string;
    distinctive_markings?: string;
    remarks?: string;
}

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
    bypass_handover_photo?: boolean;
    has_proof_on_file?: boolean;
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
export const ownerReturnError = (v: OwnerReturnValue, petOwnerId?: number | null, hasProofOnFile?: boolean): string | null => {
    if (v.has_account) {
        if (!v.owner_user_id) return "Search and select the owner's StraySafe account.";
    } else {
        if ((v.owner_name || '').trim().length < 2) return "Enter the owner's full name.";
        if (!(v.owner_phone || '').trim() && !(v.owner_address || '').trim()) return "Enter at least the owner's contact number or address.";
    }
    const isSelfRetrieved = v.return_method === 'self_retrieved';
    const proofAvailable = Boolean(hasProofOnFile || v.has_proof_on_file || v.bypass_handover_photo);
    if (!v.handoverFile && !proofAvailable) {
        return isSelfRetrieved
            ? 'Attach a reunion photo (from owner message or animal at home) confirming safe recovery.'
            : 'Take or attach a handover photo (owner with the animal).';
    }
    const last4 = (v.id_last4 || '').trim();
    const verified = isVerifiedByRecord(v, petOwnerId);
    const waiveId = verified || (isSelfRetrieved && v.has_account && Boolean(v.owner_user_id)) || proofAvailable;
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
    const { handoverFile, proofFiles, has_proof_on_file, bypass_handover_photo, ...rest } = v;
    return {
        ...rest,
        return_method: v.return_method || 'in_person',
        bypass_handover_photo: !handoverFile && Boolean(has_proof_on_file || bypass_handover_photo),
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

const isPdfUrl = (url?: string | null): boolean => {
    if (!url) return false;
    const clean = url.split('?')[0].toLowerCase();
    return clean.endsWith('.pdf') || clean.includes('.pdf') || clean.includes('/raw/upload') || clean.includes('/document/') || clean.includes('format=pdf');
};

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
    const [lightboxIsPdf, setLightboxIsPdf] = useState(false);
    const [proofOnFile, setProofOnFile] = useState<ProofOnFile | null>(null);
    const [showManualProofUpload, setShowManualProofUpload] = useState(false);
    const [showChangeRecipient, setShowChangeRecipient] = useState(false);
    const [isRequestingPhoto, setIsRequestingPhoto] = useState(false);
    const [requestPhotoStatus, setRequestPhotoStatus] = useState<{ success?: boolean; message?: string } | null>(null);

    const handleRequestPhoto = async () => {
        const targetUserId = value.owner_user_id || detectedOwner?.user_id || petOwnerId;
        if (!reportId) {
            setRequestPhotoStatus({ success: false, message: 'Report ID is missing.' });
            return;
        }
        setIsRequestingPhoto(true);
        setRequestPhotoStatus(null);
        try {
            const res = await api.post(`/reports/${reportId}/request-reunion-photo`, {
                recipient_user_id: targetUserId ? Number(targetUserId) : undefined,
            });
            setRequestPhotoStatus({
                success: true,
                message: res.data?.message || 'Reunion photo request sent to owner! They received an in-app notification.',
            });
        } catch (err: any) {
            console.error('Failed to request reunion photo:', err);
            setRequestPhotoStatus({
                success: false,
                message: err.response?.data?.detail || 'Failed to send photo request to owner.',
            });
        } finally {
            setIsRequestingPhoto(false);
        }
    };

    const openProofModal = (url: string | null) => {
        if (!url) return;
        setLightboxUrl(url);
        setLightboxIsPdf(isPdfUrl(url));
    };

    const renderLightbox = () => {
        if (!lightboxUrl) return null;
        return (
            <div
                className="fixed inset-0 z-[100000] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xs animate-in fade-in"
                onClick={() => setLightboxUrl(null)}
            >
                <div
                    className={`relative w-full ${lightboxIsPdf ? 'max-w-4xl h-[88vh]' : 'max-w-3xl max-h-[90vh]'} bg-stone-900 rounded-3xl p-3 flex flex-col overflow-hidden shadow-2xl border border-stone-800`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between pb-2.5 px-2 text-white shrink-0 border-b border-stone-800/80">
                        <div className="flex items-center gap-2">
                            <span className="text-base">{lightboxIsPdf ? '📄' : '📷'}</span>
                            <span className="text-xs font-bold tracking-wide">
                                {lightboxIsPdf ? 'Document Preview' : 'Proof Image Preview'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <a
                                href={lightboxUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-all"
                            >
                                <span>Open in New Tab</span>
                                <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                            <button
                                type="button"
                                onClick={() => setLightboxUrl(null)}
                                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
                                title="Close preview"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Content Viewer */}
                    <div className="flex-1 min-h-0 w-full mt-2 rounded-2xl overflow-hidden bg-black/40 flex flex-col items-center justify-center relative">
                        {lightboxIsPdf ? (
                            <div className="w-full h-full flex flex-col">
                                <iframe
                                    src={lightboxUrl}
                                    title="Document Viewer"
                                    className="w-full flex-1 border-0 bg-white rounded-xl"
                                />
                                <div className="p-2 text-center bg-stone-900/90 text-stone-400 text-[10px] shrink-0">
                                    Can't view PDF embedded? <a href={lightboxUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 font-bold underline ml-1">Click here to open directly</a>
                                </div>
                            </div>
                        ) : (
                            <img
                                src={lightboxUrl}
                                alt="Enlarged Proof"
                                className="max-w-full max-h-full object-contain rounded-xl mx-auto"
                                onError={() => {
                                    // If image rendering failed (e.g. document uploaded as PDF), switch to PDF/document viewer mode
                                    setLightboxIsPdf(true);
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // Track if staff explicitly opted out of account mode or changed owner
    const userManuallyDeselectedRef = useRef(false);

    // Database detected pet and owner records
    const [detectedPet, setDetectedPet] = useState<PetRecordInfo | null>(petRecord || null);
    const [detectedOwner, setDetectedOwner] = useState<RegisteredOwnerInfo | null>(registeredOwner || null);
    const [ownerSelectMode, setOwnerSelectMode] = useState<'registered' | 'search'>('registered');

    // Auto-fetch proof of ownership on file from earlier Pet Matching claim
    useEffect(() => {
        const targetPetId = petId || detectedPet?.pet_id;
        if (targetPetId || reportId) {
            let cancelled = false;
            api.get('/claims/proof-on-file', {
                params: {
                    pet_id: targetPetId || undefined,
                    report_id: reportId || undefined,
                }
            })
            .then((res) => {
                if (cancelled) return;
                if (res.data?.has_proof) {
                    setProofOnFile(res.data);
                    if (!value.has_proof_on_file) {
                        onChange({ ...value, has_proof_on_file: true });
                    }
                } else {
                    setProofOnFile(null);
                }
            })
            .catch(() => {
                if (!cancelled) setProofOnFile(null);
            });
            return () => { cancelled = true; };
        }
    }, [petId, detectedPet?.pet_id, reportId]);

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
                                    onClick={() => openProofModal(existingReturnData.handover_photo_url || null)}
                                />
                                <button
                                    type="button"
                                    onClick={() => openProofModal(existingReturnData.handover_photo_url || null)}
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
                                    <div key={idx} className="relative group shrink-0">
                                        {isPdfUrl(url) ? (
                                            <div
                                                onClick={() => openProofModal(url)}
                                                className="w-16 h-16 rounded-xl border border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 transition-colors text-center p-1"
                                                title="View Document / PDF"
                                            >
                                                <span className="text-xl">📄</span>
                                                <span className="text-[8px] font-bold text-stone-600 dark:text-stone-300 uppercase mt-0.5">PDF</span>
                                            </div>
                                        ) : (
                                            <img
                                                src={url}
                                                alt={`Ownership Proof ${idx + 1}`}
                                                className="w-16 h-16 object-cover rounded-xl border border-stone-200 cursor-pointer hover:border-emerald-500 transition-colors"
                                                onClick={() => openProofModal(url)}
                                            />
                                        )}
                                    </div>
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
                {renderLightbox()}
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
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-900 dark:text-amber-200 space-y-1">
                        <p className="font-bold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Direct Owner Recovery / Remote Verification</span>
                        </p>
                        <p className="text-[10px] text-amber-800 dark:text-amber-300 leading-relaxed">
                            No physical facility meeting required. In-person ID check is waived for registered residents. Attach the reunion photo or screenshot sent by the owner (via Viber, Messenger, or SMS) showing the pet safe at home.
                        </p>
                        <p className="text-[10px] text-amber-700/90 dark:text-amber-400/90 font-medium pt-1 border-t border-amber-200/60 dark:border-amber-800/60">
                            💡 <em>Note: If the resident is active on StraySafe, they can also confirm this themselves directly from their resident portal using the green <strong>"Pet Recovered"</strong> button.</em>
                        </p>
                    </div>
                )}
            </div>

            {/* Recipient Selection */}
            {detectedOwner && selected && Number(selected.user_id) === Number(detectedOwner.user_id) && !showChangeRecipient ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white dark:bg-stone-900 border border-emerald-300 dark:border-emerald-800 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                        <div className="min-w-0">
                            <span className="text-[10px] font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-wider block">
                                Releasing Directly to Registered Owner
                            </span>
                            <span className="text-xs font-bold text-gray-900 dark:text-white truncate block">
                                {detectedOwner.name} <span className="text-gray-400 font-normal text-[11px]">(Account #{detectedOwner.user_id})</span>
                            </span>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowChangeRecipient(true)}
                        className="text-[10px] font-black text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 uppercase cursor-pointer shrink-0 py-1.5 px-3 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 transition-colors"
                    >
                        Change Recipient
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-widest">
                            Who was the animal returned to? <span className="text-red-500">*</span>
                        </p>
                        {detectedOwner && (
                            <button
                                type="button"
                                onClick={() => {
                                    setShowChangeRecipient(false);
                                    setMode(true);
                                }}
                                className="text-[10px] font-bold text-emerald-700 hover:underline cursor-pointer"
                            >
                                ↺ Revert to Registered Owner ({detectedOwner.name})
                            </button>
                        )}
                    </div>

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
                            {selected ? (
                                <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-white dark:bg-stone-900 border-2 border-emerald-400 dark:border-emerald-700 shadow-xs">
                                    <div className="min-w-0 text-xs space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <p className="font-black text-gray-900 dark:text-white truncate">{selected.name}</p>
                                            <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-300">
                                                Account #{selected.user_id}
                                            </span>
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

                {/* Proof of Ownership Section (Positioned at top so staff immediately sees verified records) */}
                {proofOnFile && proofOnFile.has_proof ? (
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-wider flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span>Proof of Ownership on File {proofOnFile.claim_id ? `(Pet Claim #${proofOnFile.claim_id})` : ''}</span>
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
                                Auto-Retrieved from Pet Matching
                            </span>
                        </div>
                        
                        <p className="text-[10px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                            Ownership documents previously submitted by the owner in Pet Matching are verified on file. No re-upload required.
                        </p>

                        {/* Document badges & thumbnail buttons */}
                        <div className="flex flex-wrap gap-2 pt-1">
                            {proofOnFile.vaccine_card_url && (
                                <div className="inline-flex items-center rounded-xl bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-700 overflow-hidden shadow-2xs hover:border-emerald-400 transition-all">
                                    <button
                                        type="button"
                                        onClick={() => openProofModal(proofOnFile.vaccine_card_url!)}
                                        className="px-3 py-1.5 text-[10px] font-bold text-emerald-900 dark:text-emerald-100 cursor-pointer flex items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    >
                                        <span>💉 Vaccination Card {isPdfUrl(proofOnFile.vaccine_card_url) ? '(PDF)' : ''}</span>
                                    </button>
                                    <a
                                        href={proofOnFile.vaccine_card_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open in new tab"
                                        className="px-2 py-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100/50 border-l border-emerald-200 dark:border-emerald-700 transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            )}
                            {proofOnFile.vet_record_url && (
                                <div className="inline-flex items-center rounded-xl bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-700 overflow-hidden shadow-2xs hover:border-emerald-400 transition-all">
                                    <button
                                        type="button"
                                        onClick={() => openProofModal(proofOnFile.vet_record_url!)}
                                        className="px-3 py-1.5 text-[10px] font-bold text-emerald-900 dark:text-emerald-100 cursor-pointer flex items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    >
                                        <span>🩺 Veterinary Records {isPdfUrl(proofOnFile.vet_record_url) ? '(PDF)' : ''}</span>
                                    </button>
                                    <a
                                        href={proofOnFile.vet_record_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open in new tab"
                                        className="px-2 py-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100/50 border-l border-emerald-200 dark:border-emerald-700 transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            )}
                            {proofOnFile.registration_record_url && (
                                <div className="inline-flex items-center rounded-xl bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-700 overflow-hidden shadow-2xs hover:border-emerald-400 transition-all">
                                    <button
                                        type="button"
                                        onClick={() => openProofModal(proofOnFile.registration_record_url!)}
                                        className="px-3 py-1.5 text-[10px] font-bold text-emerald-900 dark:text-emerald-100 cursor-pointer flex items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    >
                                        <span>📜 Registration Certificate {isPdfUrl(proofOnFile.registration_record_url) ? '(PDF)' : ''}</span>
                                    </button>
                                    <a
                                        href={proofOnFile.registration_record_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open in new tab"
                                        className="px-2 py-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100/50 border-l border-emerald-200 dark:border-emerald-700 transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            )}
                            {proofOnFile.additional_photos_url && (
                                <div className="inline-flex items-center rounded-xl bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-700 overflow-hidden shadow-2xs hover:border-emerald-400 transition-all">
                                    <button
                                        type="button"
                                        onClick={() => openProofModal(proofOnFile.additional_photos_url!)}
                                        className="px-3 py-1.5 text-[10px] font-bold text-emerald-900 dark:text-emerald-100 cursor-pointer flex items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    >
                                        <span>📷 Pet Photos</span>
                                    </button>
                                    <a
                                        href={proofOnFile.additional_photos_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open in new tab"
                                        className="px-2 py-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100/50 border-l border-emerald-200 dark:border-emerald-700 transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            )}
                            {proofOnFile.evidence_url && (
                                <div className="inline-flex items-center rounded-xl bg-white dark:bg-stone-900 border border-emerald-200 dark:border-emerald-700 overflow-hidden shadow-2xs hover:border-emerald-400 transition-all">
                                    <button
                                        type="button"
                                        onClick={() => openProofModal(proofOnFile.evidence_url!)}
                                        className="px-3 py-1.5 text-[10px] font-bold text-emerald-900 dark:text-emerald-100 cursor-pointer flex items-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                                    >
                                        <span>📎 Supporting Evidence {isPdfUrl(proofOnFile.evidence_url) ? '(PDF)' : ''}</span>
                                    </button>
                                    <a
                                        href={proofOnFile.evidence_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open in new tab"
                                        className="px-2 py-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100/50 border-l border-emerald-200 dark:border-emerald-700 transition-colors"
                                    >
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* Toggle to add extra files if desired */}
                        <div className="pt-1.5 border-t border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setShowManualProofUpload(!showManualProofUpload)}
                                className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline cursor-pointer"
                            >
                                {showManualProofUpload ? '– Hide additional proof upload' : '+ Attach additional proof files (optional)'}
                            </button>
                            {value.proofFiles && value.proofFiles.length > 0 && (
                                <span className="text-[10px] font-bold text-emerald-600">{value.proofFiles.length} extra file(s) attached</span>
                            )}
                        </div>

                        {showManualProofUpload && (
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => set({ proofFiles: Array.from(e.target.files || []).slice(0, 5) })}
                                className="block w-full text-[11px] file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-stone-200 file:text-stone-800 file:font-bold file:cursor-pointer mt-2"
                            />
                        )}
                    </div>
                ) : null}

                {(() => {
                    const isSelfRetrieved = value.return_method === 'self_retrieved';
                    const hasProof = Boolean(proofOnFile && proofOnFile.has_proof);
                    const idOptional = verified || (isSelfRetrieved && value.has_account && Boolean(value.owner_user_id)) || hasProof;
                    const photoOptional = hasProof || verified;

                    return (
                        <>
                            {idOptional ? (
                                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                    <span>
                                        {hasProof
                                            ? 'Proof of ownership verified on record — ID inspection and handover photo are optional.'
                                            : verified
                                            ? 'Registered owner verified on record — physical ID inspection is optional.'
                                            : 'Direct owner recovery with registered account — physical ID inspection is waived.'}
                                    </span>
                                </div>
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
                            {!idOptional && (
                                <p className="text-[10px] text-gray-500">
                                    Check the ID in person. Only the ID type and last 4 digits are saved, never a photo of the ID.
                                </p>
                            )}

                            <label className="block">
                                <span className="block text-[10px] font-bold text-gray-700 dark:text-stone-300 mb-1">
                                    {photoOptional
                                        ? (isSelfRetrieved ? 'Reunion photo (optional — proof on file)' : 'Handover photo (optional — proof on file)')
                                        : (isSelfRetrieved ? 'Reunion proof photo (animal safe with owner or at home) *' : 'Handover photo (owner receiving animal in person) *')}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(e) => set({ handoverFile: e.target.files?.[0] || null })}
                                    className="block w-full text-[11px] file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold file:cursor-pointer"
                                />
                                <span className="block text-[10px] text-gray-400 mt-1">
                                    {isSelfRetrieved
                                        ? 'Attach the photo or screenshot sent by the owner showing the pet back at home.'
                                        : 'Take or attach a photo of the in-person transfer with the owner at the facility or guardhouse.'}
                                </span>
                            </label>

                            {/* 1-Click Request Photo from Owner when Direct Recovery / Self-Retrieved is chosen */}
                            {isSelfRetrieved && (value.has_account || detectedOwner?.user_id || petOwnerId) && reportId ? (
                                <div className="p-3 rounded-2xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 shadow-2xs space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-start gap-2.5">
                                            <div className="w-8 h-8 rounded-xl bg-sky-500/10 dark:bg-sky-400/10 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0 mt-0.5 border border-sky-200 dark:border-sky-800">
                                                <Camera className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h5 className="text-[11px] font-black text-sky-950 dark:text-sky-100 flex items-center gap-1.5">
                                                    <span>Haven't received the reunion photo yet?</span>
                                                    <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-sky-200/70 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 uppercase tracking-wider">
                                                        1-Click Request
                                                    </span>
                                                </h5>
                                                <p className="text-[10px] text-sky-700 dark:text-sky-300 leading-relaxed mt-0.5">
                                                    Send an instant in-app request to <strong>{value.owner_name || detectedOwner?.name || registeredOwner?.name || 'the owner'}</strong>. Tapping it opens their camera directly to submit reunion proof.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            disabled={isRequestingPhoto || Boolean(requestPhotoStatus?.success)}
                                            onClick={handleRequestPhoto}
                                            className={`px-3.5 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                                                requestPhotoStatus?.success
                                                    ? 'bg-emerald-600 text-white cursor-default'
                                                    : isRequestingPhoto
                                                    ? 'bg-sky-400 text-white cursor-wait'
                                                    : 'bg-sky-600 hover:bg-sky-700 active:scale-95 text-white cursor-pointer'
                                            }`}
                                        >
                                            {isRequestingPhoto ? (
                                                <>
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    <span>Sending...</span>
                                                </>
                                            ) : requestPhotoStatus?.success ? (
                                                <>
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    <span>Request Sent ✓</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Send className="w-3.5 h-3.5" />
                                                    <span>Request Photo</span>
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {requestPhotoStatus && (
                                        <div className={`p-2.5 rounded-xl text-[10px] font-semibold flex items-center gap-2 animate-in fade-in ${
                                            requestPhotoStatus.success
                                                ? 'bg-emerald-100/90 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
                                                : 'bg-rose-100/90 dark:bg-rose-950/70 text-rose-900 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
                                        }`}>
                                            {requestPhotoStatus.success ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                            ) : (
                                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                            )}
                                            <div className="leading-tight">
                                                <span>{requestPhotoStatus.message}</span>
                                                {requestPhotoStatus.success && (
                                                    <p className="text-[9px] opacity-80 mt-0.5 font-normal">
                                                        You can wait for the owner to submit, or attach their photo here manually if they send it via message.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </>
                    );
                })()}
                {handoverPreview && <img src={handoverPreview} alt="Handover" className="w-24 h-24 object-cover rounded-xl border border-emerald-300" />}

                {/* Fallback manual proof upload if no proof is on file */}
                {(!proofOnFile || !proofOnFile.has_proof) && (
                    <div>
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
                        {(value.proofFiles?.length || 0) > 0 && <p className="text-[10px] text-gray-500 mt-1">{value.proofFiles!.length} file(s) attached</p>}
                    </div>
                )}
            </div>

            {/* Lightbox Modal for Proof Images & Documents */}
            {renderLightbox()}
        </div>
    );
};

export default OwnerReturnPicker;
