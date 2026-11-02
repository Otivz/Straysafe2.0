import React, { useEffect, useRef, useState } from 'react';
import { Camera, X, Send, ImagePlus, Trash2, Clock } from 'lucide-react';
import {
    OWNER_COMPLIANCE_OPTIONS,
    OWNER_UPDATE_MAX_PHOTOS,
    OWNER_UPDATE_REMARKS_MAX,
    checkOwnerUpdatePhotos,
    validateOwnerUpdateForm,
    createOwnerUpdateRequestId,
    getApiErrorMessage,
    type OwnerObservationUpdate,
} from '../utils/ownerObservationUpdates';
import { submitOwnerObservationUpdate } from '../utils/ownerObservationUpdatesApi';

interface OwnerObservationUpdateModalProps {
    followupId: number;
    reportId: number;
    animalName: string;
    onClose: () => void;
    onSaved: (update: OwnerObservationUpdate) => void;
}

interface SelectedPhoto {
    file: File;
    previewUrl: string;
}

const OwnerObservationUpdateModal: React.FC<OwnerObservationUpdateModalProps> = ({
    followupId,
    reportId,
    animalName,
    onClose,
    onSaved,
}) => {
    const [complianceStatus, setComplianceStatus] = useState('');
    const [remarks, setRemarks] = useState('');
    const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [photoErrors, setPhotoErrors] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    // Synchronous guard against a fast double click, plus one key per draft so a retry cannot save twice.
    const inFlight = useRef(false);
    const [requestId] = useState(createOwnerUpdateRequestId);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const photosRef = useRef<SelectedPhoto[]>([]);
    useEffect(() => {
        photosRef.current = photos;
    }, [photos]);

    // Release preview object URLs when the modal closes.
    useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

    useEffect(() => {
        const original = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !inFlight.current) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = original;
            window.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    const handlePickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files || []);
        e.target.value = '';
        const { accepted, errors } = checkOwnerUpdatePhotos(picked, photos.length);
        setPhotoErrors(errors);
        if (accepted.length) {
            setPhotos((prev) => [...prev, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
        }
    };

    const removePhoto = (index: number) => {
        setPhotos((prev) => {
            URL.revokeObjectURL(prev[index].previewUrl);
            return prev.filter((_, i) => i !== index);
        });
        setPhotoErrors([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (inFlight.current) return;
        const invalid = validateOwnerUpdateForm(complianceStatus, remarks);
        if (invalid) {
            setErrorMessage(invalid);
            return;
        }
        inFlight.current = true;
        setIsSubmitting(true);
        setErrorMessage(null);
        try {
            const saved = await submitOwnerObservationUpdate(followupId, {
                complianceStatus,
                remarks,
                photos: photos.map((p) => p.file),
                requestId,
            });
            onSaved(saved);
        } catch (err: unknown) {
            setErrorMessage(getApiErrorMessage(err, 'Your update could not be submitted. Your entries are kept; please try again.'));
        } finally {
            inFlight.current = false;
            setIsSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[1500] bg-stone-900/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => { if (!inFlight.current) onClose(); }}
            role="presentation"
        >
            <form
                onSubmit={handleSubmit}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="owner-update-title"
                className="w-full sm:max-w-xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-orange-100 dark:border-gray-800 overflow-hidden"
            >
                {/* Header */}
                <div className="px-5 py-4 border-b border-orange-100 dark:border-gray-800 flex items-start justify-between gap-3 bg-gradient-to-r from-orange-50 to-white dark:from-orange-950/30 dark:to-gray-900">
                    <div>
                        <h3 id="owner-update-title" className="text-sm font-black uppercase tracking-wider text-[#1a1208] dark:text-white flex items-center gap-2">
                            <Send className="w-4 h-4 text-[#F97316]" /> Submit Observation Update
                        </h3>
                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                            {animalName} · Report #{reportId}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close"
                        className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-xs">
                    {errorMessage && (
                        <div role="alert" className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                            {errorMessage}
                        </div>
                    )}

                    <fieldset disabled={isSubmitting}>
                        <legend className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
                            Compliance Status <span className="text-rose-500">*</span>
                        </legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {OWNER_COMPLIANCE_OPTIONS.map((opt) => {
                                const selected = complianceStatus === opt.value;
                                return (
                                    <label
                                        key={opt.value}
                                        className={`p-2.5 rounded-xl border-2 cursor-pointer transition-all ${
                                            selected
                                                ? 'border-[#F97316] bg-orange-50 dark:bg-orange-950/40'
                                                : 'border-gray-200 dark:border-gray-700 hover:border-orange-200'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="compliance_status"
                                            value={opt.value}
                                            checked={selected}
                                            onChange={() => setComplianceStatus(opt.value)}
                                            className="sr-only"
                                        />
                                        <span className="block font-black text-[#1a1208] dark:text-white">{opt.label}</span>
                                        <span className="block text-[10px] text-gray-500 font-medium mt-0.5">{opt.hint}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>

                    <div>
                        <label htmlFor="owner-update-remarks" className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
                            Owner Remarks <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                            id="owner-update-remarks"
                            rows={4}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            disabled={isSubmitting}
                            maxLength={OWNER_UPDATE_REMARKS_MAX}
                            placeholder="Explain what you did to address the reported violation (e.g., fixed the gate latch, pet now kept indoors, walks on a leash)."
                            className="w-full px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/30"
                        />
                        <p className="text-[10px] text-gray-400 text-right mt-0.5">{remarks.length}/{OWNER_UPDATE_REMARKS_MAX}</p>
                    </div>

                    <div>
                        <span className="block text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1.5">
                            Photo Evidence <span className="text-gray-400 normal-case font-bold">(optional, up to {OWNER_UPDATE_MAX_PHOTOS})</span>
                        </span>
                        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                            {photos.map((p, i) => (
                                <div key={p.previewUrl} className="relative aspect-square rounded-xl overflow-hidden border border-orange-200 bg-gray-100">
                                    <img src={p.previewUrl} alt={`Selected photo ${i + 1}`} className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => removePhoto(i)}
                                        disabled={isSubmitting}
                                        aria-label={`Remove photo ${i + 1}`}
                                        className="absolute top-1 right-1 p-1 rounded-lg bg-white/90 text-rose-600 shadow cursor-pointer disabled:opacity-40"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                            {photos.length < OWNER_UPDATE_MAX_PHOTOS && (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isSubmitting}
                                    className="aspect-square rounded-xl border-2 border-dashed border-orange-300 text-[#F97316] hover:bg-orange-50 flex flex-col items-center justify-center gap-1 font-black text-[10px] uppercase cursor-pointer disabled:opacity-40"
                                >
                                    <ImagePlus className="w-5 h-5" />
                                    Add Photo
                                </button>
                            )}
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={handlePickPhotos}
                            className="hidden"
                        />
                        {photoErrors.map((msg) => (
                            <p key={msg} className="text-[10px] text-rose-600 font-bold mt-1">{msg}</p>
                        ))}
                    </div>

                    <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center gap-2 text-gray-600 dark:text-gray-300">
                        <Clock className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                        <span className="font-medium">
                            <span className="font-black">Submission date:</span> recorded automatically by the server when you submit.
                        </span>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold text-xs cursor-pointer disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        aria-busy={isSubmitting}
                        className="px-5 py-2 rounded-xl bg-[#F97316] hover:bg-[#EA580C] disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                    >
                        <Camera className="w-3.5 h-3.5" />
                        {isSubmitting ? (photos.length ? 'Uploading & Saving...' : 'Saving...') : 'Submit Update'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default OwnerObservationUpdateModal;
