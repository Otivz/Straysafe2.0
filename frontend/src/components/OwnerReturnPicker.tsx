import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import { compressImageFile } from '../utils/imageCompress';

/** Value edited by the picker. Sent as `owner_return` after prepareOwnerReturn() uploads the photos. */
export interface OwnerReturnValue {
    has_account: boolean;
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

export const EMPTY_OWNER_RETURN: OwnerReturnValue = { has_account: true, owner_user_id: null };

export const ID_TYPES = [
    'PhilSys National ID', "Driver's License", 'Passport', 'UMID / SSS ID', 'PhilHealth ID', "Voter's ID",
    'Postal ID', 'PRC ID', 'Senior Citizen ID', 'Barangay ID', 'Student / School ID', 'Other Government ID',
];

/** True when the selected account already owns the report's registered pet (ID not needed). */
export const isVerifiedByRecord = (v: OwnerReturnValue, petOwnerId?: number | null) =>
    Boolean(v.has_account && v.owner_user_id && petOwnerId && v.owner_user_id === petOwnerId);

/** Client-side check mirroring the backend rules; returns an error message or null. */
export const ownerReturnError = (v: OwnerReturnValue, petOwnerId?: number | null): string | null => {
    if (v.has_account) {
        if (!v.owner_user_id) return "Search and select the owner's StraySafe account.";
    } else {
        if ((v.owner_name || '').trim().length < 2) return "Enter the owner's full name.";
        if (!(v.owner_phone || '').trim() && !(v.owner_address || '').trim()) return "Enter at least the owner's contact number or address.";
    }
    if (!v.handoverFile) return 'Take or attach a handover photo (owner with the animal).';
    const last4 = (v.id_last4 || '').trim();
    if (!isVerifiedByRecord(v, petOwnerId)) {
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
}

const inputCls = 'w-full px-3 py-2.5 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-xl text-xs font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-emerald-500';

const OwnerReturnPicker: React.FC<Props> = ({ value, onChange, petOwnerId }) => {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<OwnerHit[]>([]);
    const [searching, setSearching] = useState(false);
    const [selected, setSelected] = useState<OwnerHit | null>(null);
    const [handoverPreview, setHandoverPreview] = useState<string | null>(null);

    useEffect(() => {
        if (!value.has_account || selected) return;
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
    }, [query, value.has_account, selected]);

    useEffect(() => {
        if (!value.handoverFile) { setHandoverPreview(null); return; }
        const url = URL.createObjectURL(value.handoverFile);
        setHandoverPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [value.handoverFile]);

    const set = (patch: Partial<OwnerReturnValue>) => onChange({ ...value, ...patch });
    const verified = isVerifiedByRecord(value, petOwnerId);

    const setMode = (has_account: boolean) => {
        setSelected(null);
        setQuery('');
        setHits([]);
        onChange({
            has_account,
            owner_user_id: null,
            relationship_to_animal: value.relationship_to_animal,
            id_type: value.id_type,
            id_last4: value.id_last4,
            notes: value.notes,
            handoverFile: value.handoverFile,
            proofFiles: value.proofFiles,
        });
    };

    const pick = (u: OwnerHit) => {
        setSelected(u);
        setHits([]);
        set({ owner_user_id: u.user_id });
    };

    return (
        <div className="space-y-3 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/10" data-testid="owner-return-picker">
            <p className="text-[10px] font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-widest">
                Who was the animal returned to? <span className="text-red-500">*</span>
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                    { key: true, title: 'Owner has a StraySafe account', sub: 'Search and link the existing account' },
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
                selected ? (
                    <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-white dark:bg-stone-900 border border-emerald-300">
                        <div className="min-w-0 text-xs">
                            <p className="font-black text-gray-900 dark:text-white truncate">{selected.name}</p>
                            <p className="text-[10px] text-gray-500 truncate">
                                {[selected.phone, selected.email].filter(Boolean).join(' • ') || 'No contact on file'}
                            </p>
                            {selected.address && <p className="text-[10px] text-gray-500 truncate">{selected.address}</p>}
                        </div>
                        <button
                            type="button"
                            onClick={() => { setSelected(null); set({ owner_user_id: null }); }}
                            className="text-[10px] font-black text-emerald-700 hover:text-emerald-900 uppercase cursor-pointer shrink-0"
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
                        {searching && <p className="text-[10px] text-gray-500">Searching…</p>}
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
                )
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input className={`${inputCls} sm:col-span-2`} placeholder="Owner's full name *" value={value.owner_name || ''} onChange={(e) => set({ owner_name: e.target.value })} maxLength={150} />
                    <input className={inputCls} placeholder="Contact number" value={value.owner_phone || ''} onChange={(e) => set({ owner_phone: e.target.value })} maxLength={30} inputMode="tel" />
                    <input className={inputCls} placeholder="Email (optional)" value={value.owner_email || ''} onChange={(e) => set({ owner_email: e.target.value })} maxLength={120} type="email" />
                    <input className={`${inputCls} sm:col-span-2`} placeholder="Address" value={value.owner_address || ''} onChange={(e) => set({ owner_address: e.target.value })} maxLength={255} />
                    <p className="sm:col-span-2 text-[10px] text-gray-500">A contact number or address is required. No StraySafe account will be created.</p>
                </div>
            )}

            <select className={inputCls} value={value.relationship_to_animal || 'Owner'} onChange={(e) => set({ relationship_to_animal: e.target.value })}>
                <option value="Owner">Owner</option>
                <option value="Family Member">Family member of owner</option>
                <option value="Caregiver">Caregiver</option>
                <option value="Authorized Representative">Authorized representative</option>
            </select>

            {/* Proof of return */}
            <div className="space-y-2 pt-2 border-t border-emerald-200/70 dark:border-emerald-900/50">
                <p className="text-[10px] font-black text-emerald-900 dark:text-emerald-200 uppercase tracking-widest">Proof of Return</p>

                {verified && (
                    <p className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/70 rounded-lg px-2.5 py-1.5">
                        ✓ This account is the registered owner of the pet record — ID is optional.
                    </p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select className={inputCls} value={value.id_type || ''} onChange={(e) => set({ id_type: e.target.value })}>
                        <option value="">{verified ? 'ID presented (optional)' : 'ID presented *'}</option>
                        {ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                        className={inputCls}
                        placeholder={verified ? 'Last 4 digits of ID (optional)' : 'Last 4 digits of ID *'}
                        value={value.id_last4 || ''}
                        onChange={(e) => set({ id_last4: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        inputMode="numeric"
                        maxLength={4}
                    />
                </div>
                <p className="text-[10px] text-gray-500">Check the ID in person. Only the ID type and last 4 digits are saved, never a photo of the ID.</p>

                <label className="block">
                    <span className="block text-[10px] font-bold text-gray-700 dark:text-stone-300 mb-1">
                        Handover photo (owner with the animal) <span className="text-red-500">*</span>
                    </span>
                    <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => set({ handoverFile: e.target.files?.[0] || null })}
                        className="block w-full text-[11px] file:mr-2 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:font-bold file:cursor-pointer"
                    />
                </label>
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
