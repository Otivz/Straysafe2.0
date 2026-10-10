import React, { useState, useRef, useEffect } from 'react';
import api from '../../utils/api';
import { compressImageFile } from '../../utils/imageCompress';
import { DEFAULT_PET_AVATAR, DEFAULT_AVATAR, getPetPicture, getProfilePicture } from '../../utils/avatar';
import { 
    X, 
    CheckCircle2, 
    AlertCircle, 
    Upload, 
    Camera, 
    PawPrint, 
    CreditCard, 
    Sparkles,
    Loader2,
    Send,
    AlertTriangle,
    ShieldCheck,
    ExternalLink
} from 'lucide-react';

export const ID_TYPES = [
    'PhilSys National ID',
    "Driver's License",
    'Passport',
    'UMID / SSS ID',
    'PhilHealth ID',
    "Voter's ID",
    'Postal ID',
    'PRC ID',
    'Senior Citizen ID',
    'Barangay ID',
    'Student / School ID',
    'Other Government ID',
];

interface Props {
    isOpen: boolean;
    onClose: () => void;
    claim: any;
    onSuccess: (updatedClaim: any) => void;
}

const CompleteHandoverModal: React.FC<Props> = ({
    isOpen,
    onClose,
    claim,
    onSuccess
}) => {
    const [idType, setIdType] = useState<string>("Driver's License");
    const [idLast4, setIdLast4] = useState<string>('');
    const [relationship, setRelationship] = useState<string>('Owner');
    const [notes, setNotes] = useState<string>('');
    const [handoverFile, setHandoverFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isRequestingPhoto, setIsRequestingPhoto] = useState(false);
    const [requestPhotoStatus, setRequestPhotoStatus] = useState<{ success?: boolean; message?: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const handleRequestPhoto = async () => {
        const reportId = claim?.report_id || claim?.report?.report_id;
        const targetUserId = claim?.pet?.owner?.user_id || claim?.owner?.user_id || claim?.user_id;
        if (!reportId) {
            setRequestPhotoStatus({ success: false, message: 'Report ID is not linked to this claim.' });
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

    // Get current logged-in staff info
    const staffUser = (() => {
        for (const k of ['staff_user', 'admin_user', 'user']) {
            const raw = sessionStorage.getItem(k) || localStorage.getItem(k);
            if (raw) {
                try {
                    return JSON.parse(raw);
                } catch {}
            }
        }
        return null;
    })();

    // Reset fields on modal open
    useEffect(() => {
        if (isOpen) {
            setIdType("Driver's License");
            setIdLast4('');
            setRelationship('Owner');
            setNotes('');
            setHandoverFile(null);
            setPreviewUrl(null);
            setErrorMessage(null);
        }
    }, [isOpen, claim]);

    if (!isOpen || !claim) return null;

    const pet = claim.pet || {};
    const owner = pet.owner || claim.owner || {};
    const report = claim.report || {};
    const petPhoto = pet.photo_url || (report.media && report.media[0]?.file_url);

    const existingEvidenceList = [
        (claim.vaccine_card_url || claim.evidence_url) && { label: 'Vaccination Card', url: claim.vaccine_card_url || claim.evidence_url },
        claim.vet_record_url && { label: 'Veterinary Records', url: claim.vet_record_url },
        claim.registration_record_url && { label: 'Registration Certificate', url: claim.registration_record_url },
        claim.additional_photos_url && { label: 'Additional Photos', url: claim.additional_photos_url },
        claim.pet?.photo_url && { label: 'Registered Pet Photo', url: claim.pet.photo_url },
    ].filter(Boolean) as { label: string; url: string }[];

    const hasProofOnFile = existingEvidenceList.length > 0;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setHandoverFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setErrorMessage(null);
        }
    };

    const handleRemoveFile = () => {
        setHandoverFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMessage(null);

        // Validation: If NO proof on file, require handover photo and 4-digit ID
        if (!hasProofOnFile) {
            if (!handoverFile) {
                setErrorMessage('A handover photo (owner with the animal) is required.');
                return;
            }

            if (!idType) {
                setErrorMessage('Select the type of ID presented by the recipient.');
                return;
            }

            const cleanedLast4 = (idLast4 || '').trim();
            if (!/^\d{4}$/.test(cleanedLast4)) {
                setErrorMessage("Enter the last 4 digits of the owner's ID number (must be exactly 4 digits).");
                return;
            }
        } else {
            const cleanedLast4 = (idLast4 || '').trim();
            if (cleanedLast4.length > 0 && !/^\d{4}$/.test(cleanedLast4)) {
                setErrorMessage("If entering an ID number, please enter exactly 4 digits or leave it blank.");
                return;
            }
        }

        setIsSubmitting(true);
        try {
            let mediaId: number | undefined = undefined;
            let photoUrl: string | undefined = undefined;
            const isBypassingPhoto = !handoverFile && hasProofOnFile;

            // 1. Upload handover photo if provided
            if (handoverFile) {
                const fd = new FormData();
                fd.append('file', await compressImageFile(handoverFile));
                fd.append('is_evidence', 'true');
                fd.append('status_id', '9');
                const mediaRes = await api.post(`/reports/${claim.report_id}/media`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                mediaId = mediaRes.data?.media_id;
                photoUrl = mediaRes.data?.file_url;
            } else if (isBypassingPhoto) {
                photoUrl = existingEvidenceList[0]?.url || petPhoto || undefined;
            }

            const cleanedLast4 = (idLast4 || '').trim() || (isBypassingPhoto ? (owner.user_id ? String(owner.user_id).padStart(4, '0').slice(-4) : '0000') : '');
            const finalIdType = (idLast4 && idLast4.trim().length === 4) ? idType : (isBypassingPhoto ? 'Verified Ownership on File' : (idType || "Driver's License"));

            // 2. Submit Handover Complete status update to claims endpoint
            const patchRes = await api.patch(`/claims/${claim.claim_id}/status`, {
                status: 'Handover Complete',
                handover_media_id: mediaId,
                handover_photo_url: photoUrl,
                bypass_handover_photo: isBypassingPhoto,
                id_type: finalIdType,
                id_last4: cleanedLast4,
                id_presented: cleanedLast4 ? `${finalIdType} (ending ${cleanedLast4})` : (isBypassingPhoto ? 'Verified Owner on File' : undefined),
                relationship_to_animal: relationship,
                remarks: notes.trim() || `Physical handover completed with ${owner.name || 'owner'}${isBypassingPhoto ? ' (Verified proof on record)' : ''}.`,
                notes: notes.trim() || undefined
            });

            onSuccess(patchRes.data);
            onClose();
        } catch (err: any) {
            console.error('Failed to complete pet handover:', err);
            const detail = err.response?.data?.detail;
            setErrorMessage(typeof detail === 'string' ? detail : 'Failed to complete pet handover. Please verify the information and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div 
                className="bg-white rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-700 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-md shadow-inner">
                            <span className="text-xl">🤝</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-base font-black tracking-tight">Complete Pet Handover</h3>
                                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-100 border border-emerald-400/30">
                                    Authoritative
                                </span>
                            </div>
                            <p className="text-xs text-emerald-100/90 font-medium">
                                Record in-person physical transfer & synchronize across StraySafe
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 custom-scrollbar flex-1">
                    {/* Error Banner */}
                    {errorMessage && (
                        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-700 flex items-start gap-2.5 animate-in fade-in">
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <span className="font-semibold leading-relaxed">{errorMessage}</span>
                        </div>
                    )}

                    {/* Section 1: Verified Animal & Owner Pair */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-gray-50/80 rounded-2xl border border-gray-100">
                        {/* Animal Preview */}
                        <div className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-gray-100 shadow-2xs">
                            <img
                                src={getPetPicture(petPhoto)}
                                alt={pet.pet_name || 'Pet'}
                                className="w-12 h-12 rounded-xl object-cover border border-gray-200 shrink-0"
                                onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                            />
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-black text-gray-900 truncate">
                                        {pet.pet_name || 'Registered Pet'}
                                    </span>
                                    <PawPrint className="w-3 h-3 text-emerald-600 shrink-0" />
                                </div>
                                <p className="text-[11px] text-gray-500 truncate">
                                    {[pet.breed, pet.pet_type || 'Animal'].filter(Boolean).join(' • ')}
                                </p>
                                <span className="text-[9px] font-bold text-gray-400">
                                    Report #{claim.report_id}
                                </span>
                            </div>
                        </div>

                        {/* Owner Preview */}
                        <div className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-gray-100 shadow-2xs">
                            <img
                                src={getProfilePicture(owner.profile_picture)}
                                alt={owner.name || 'Owner'}
                                className="w-12 h-12 rounded-xl object-cover border border-gray-200 shrink-0"
                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                            />
                            <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-black text-gray-900 truncate">
                                        {owner.name || 'Verified Owner'}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-emerald-100 text-emerald-800 shrink-0">
                                        Owner
                                    </span>
                                </div>
                                <p className="text-[11px] text-gray-500 truncate">
                                    {owner.phone || owner.email || 'Verified Account'}
                                </p>
                                <span className="text-[9px] font-bold text-gray-400">
                                    Account #{owner.user_id || 'On Record'}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Proof of Ownership on Record */}
                    {hasProofOnFile && (
                        <div className="p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 space-y-2 animate-in fade-in">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-2.5">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-700 shrink-0 mt-0.5">
                                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h5 className="text-xs font-black text-emerald-950 uppercase tracking-tight">
                                                Verified Ownership Evidence on Record
                                            </h5>
                                            <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-emerald-200/80 text-emerald-900">
                                                {existingEvidenceList.length} File(s)
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-emerald-800/90 font-medium leading-relaxed mt-0.5">
                                            This claim already has verified proof of ownership on file. Taking an additional handover photo is optional.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Evidence Links */}
                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                {existingEvidenceList.map((doc, idx) => (
                                    <a
                                        key={idx}
                                        href={doc.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-900 text-[10px] font-bold hover:bg-emerald-100/60 transition-colors shadow-2xs"
                                    >
                                        <span>✓ {doc.label}</span>
                                        <ExternalLink className="w-2.5 h-2.5 opacity-60" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Section 2: Handover Photo */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                                <Camera className="w-3.5 h-3.5 text-emerald-600" />
                                <span>1. Physical Handover Photo {hasProofOnFile ? <span className="text-emerald-700 font-bold text-[10px] uppercase">(Optional - Proof on File)</span> : <span className="text-red-500">*</span>}</span>
                            </label>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                Owner with Animal
                            </span>
                        </div>
                        <p className="text-[11px] text-gray-500 leading-normal">
                            Take or upload a clear photo of the resident receiving the animal in person as undeniable proof of return.
                        </p>

                        {previewUrl ? (
                            <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 bg-stone-900 aspect-video max-h-56 flex items-center justify-center group">
                                <img 
                                    src={previewUrl} 
                                    alt="Handover Preview" 
                                    className="w-full h-full object-contain"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-3 py-1.5 rounded-xl bg-white text-gray-900 text-xs font-bold hover:bg-gray-100 cursor-pointer shadow-md"
                                    >
                                        Replace Photo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleRemoveFile}
                                        className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-bold hover:bg-red-700 cursor-pointer shadow-md"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-gray-300 hover:border-emerald-500 hover:bg-emerald-50/30 rounded-2xl p-6 text-center transition-all cursor-pointer space-y-2"
                            >
                                <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-2xs">
                                    <Upload className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-gray-800">
                                        Click to attach or snap handover photo
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">
                                        JPEG, PNG or WebP • Auto-compressed up to 10MB
                                    </p>
                                </div>
                            </div>
                        )}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleFileChange}
                            className="hidden"
                        />

                        {/* 1-Click Request Photo from Owner */}
                        {(claim.report_id || report.report_id) && (
                            <div className="p-3 rounded-2xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-800/60 shadow-2xs space-y-2 mt-2">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-start gap-2.5">
                                        <div className="w-8 h-8 rounded-xl bg-sky-500/10 dark:bg-sky-400/10 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0 mt-0.5 border border-sky-200 dark:border-sky-800">
                                            <Camera className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h5 className="text-[11px] font-black text-sky-950 dark:text-sky-100 flex items-center gap-1.5">
                                                <span>Haven't received the handover photo yet?</span>
                                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-sky-200/70 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200 uppercase tracking-wider">
                                                    1-Click Request
                                                </span>
                                            </h5>
                                            <p className="text-[10px] text-sky-700 dark:text-sky-300 leading-relaxed mt-0.5">
                                                Send an instant in-app request to <strong>{owner.name || 'the claimant'}</strong>. Tapping it notifies them to upload proof of reunion with their animal.
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
                                                    The owner has been notified on their StraySafe resident app.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Section 3: Recipient ID Verification */}
                    <div className="space-y-3 pt-3 border-t border-gray-100">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                                <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                                <span>2. Government ID Presented {hasProofOnFile ? <span className="text-emerald-700 font-bold text-[10px] uppercase">(Optional)</span> : <span className="text-red-500">*</span>}</span>
                            </label>
                            <span className="text-[10px] font-bold text-gray-500">
                                Check ID in person
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                    Type of ID Presented {!hasProofOnFile && <span className="text-red-500">*</span>}
                                </span>
                                <select
                                    value={idType}
                                    onChange={(e) => setIdType(e.target.value)}
                                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-emerald-500"
                                >
                                    {ID_TYPES.map((t) => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                    Last 4 Digits of ID {!hasProofOnFile && <span className="text-red-500">*</span>}
                                </span>
                                <div className="relative">
                                    <input
                                        type="text"
                                        maxLength={4}
                                        inputMode="numeric"
                                        placeholder="e.g. 5678"
                                        value={idLast4}
                                        onChange={(e) => setIdLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono font-bold tracking-widest text-gray-900 focus:outline-none focus:border-emerald-500"
                                    />
                                    <span className="absolute left-3 top-2.5 text-gray-400 text-xs font-mono">#</span>
                                </div>
                            </div>
                        </div>

                        <p className="text-[10px] text-gray-400 leading-normal">
                            🔒 <strong>Privacy Assurance</strong>: Check the physical ID in person. Only the ID type and last 4 digits are recorded—photos of government IDs are never saved.
                        </p>
                    </div>

                    {/* Section 4: Transfer Details & Notes */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-gray-100">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                                Relationship
                            </label>
                            <select
                                value={relationship}
                                onChange={(e) => setRelationship(e.target.value)}
                                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-emerald-500"
                            >
                                <option value="Owner">Owner</option>
                                <option value="Co-Owner">Co-Owner</option>
                                <option value="Family Member">Family Member of Owner</option>
                                <option value="Authorized Representative">Authorized Representative</option>
                            </select>
                        </div>

                        <div className="sm:col-span-2 space-y-1">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                                Handover Remarks & Observations (Optional)
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Animal in healthy condition, rabies collar verified..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                maxLength={250}
                                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:border-emerald-500"
                            />
                        </div>
                    </div>

                    {/* Section 5: Automated System Synchronization Notice */}
                    <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-900 font-black text-xs uppercase tracking-wider">
                            <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Automated Synchronization Summary</span>
                        </div>
                        <ul className="text-[11px] text-emerald-800 space-y-1 pl-4 list-disc font-medium">
                            <li>Report #{claim.report_id} status moves to <strong>Claimed by Owner (Status 9)</strong>.</li>
                            <li>Holding Facility animal record is discharged automatically.</li>
                            <li>Registered pet record is set to <strong>Active</strong> with audit history.</li>
                            <li>Report Management is locked with <strong>"Animal Already Reunited"</strong>.</li>
                        </ul>
                        {staffUser && (
                            <p className="text-[10px] text-emerald-700/80 pt-1 border-t border-emerald-200/60 font-semibold">
                                Responsible Officer: <strong>{staffUser.name || 'Staff'}</strong> ({staffUser.role_name || staffUser.email || 'Personnel'})
                            </p>
                        )}
                    </div>
                </form>

                {/* Footer Buttons */}
                <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-black text-xs uppercase tracking-wider hover:bg-gray-100 transition-all cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={
                            isSubmitting ||
                            (!hasProofOnFile && (!handoverFile || idLast4.trim().length !== 4)) ||
                            (hasProofOnFile && idLast4.trim().length > 0 && idLast4.trim().length !== 4)
                        }
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Processing Handover...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Confirm & Complete Handover</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CompleteHandoverModal;
