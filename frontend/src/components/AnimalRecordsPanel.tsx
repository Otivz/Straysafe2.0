import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Layers, PawPrint, Plus, Undo2, Crop, Upload, X, Loader2, CheckCircle2, ChevronDown } from 'lucide-react';
import api from '../utils/api';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import { DEFAULT_PET_AVATAR } from '../utils/avatar';
import { checkAndUploadAnimalPhoto, uploadAnimalPhotoAnyway, AnimalPhotoCheckError } from '../utils/animalPhoto';
import PhotoCropper from './PhotoCropper';
import ReplaceAnimalPhotoButton from './ReplaceAnimalPhotoButton';

// Multi-animal reports (MULTI_ANIMAL_REPORT_PLAN.md). On a group report: its animal records, and (for the Subdivision
// Leader of the subdivision) "Add records per animal", "Add more animals" and "Undo split". On an animal record: which
// group it came from. Shows nothing for an ordinary one-animal report unless the leader may split it.

type AnimalDraft = {
    url?: string; preview?: string; busy?: boolean; error?: string;
    rejectedFile?: File;            // a crop the AI check doubted; the leader may still use it
    checkedByPerson?: boolean;      // used without the AI's agreement
    animal_type: string; animal_color: string; animal_breed: string; estimated_size: string; sex: string; notes: string;
};

// Same colour list as the report form (so AI colour suggestions line up) and the same breed suggestions as Add Pet
const COLORS = ['Black', 'Brown', 'White', 'Gray', 'Tan', 'Golden', 'Cream', 'Orange', 'Mixed'];
const DOG_BREEDS = ['Aspin', 'Shih Tzu', 'Chihuahua', 'Golden Retriever', 'Siberian Husky', 'Bulldog', 'Poodle', 'German Shepherd', 'Pug', 'Mixed Breed'];
const CAT_BREEDS = ['Puspin', 'Siamese', 'Persian', 'Maine Coon', 'Bengal', 'British Shorthair', 'Mixed Breed'];
// Breed names from TheDogAPI / TheCatAPI (same source and keys as the resident pet form), loaded once per page
const breedCache: Record<'Dog' | 'Cat', string[] | null> = { Dog: null, Cat: null };
async function loadBreeds(kind: 'Dog' | 'Cat'): Promise<string[]> {
    if (breedCache[kind]) return breedCache[kind]!;
    const url = kind === 'Dog' ? 'https://api.thedogapi.com/v1/breeds' : 'https://api.thecatapi.com/v1/breeds';
    const key = kind === 'Dog' ? (import.meta.env.VITE_DOG_API_KEY || '') : (import.meta.env.VITE_CAT_API_KEY || '');
    try {
        const res = await fetch(url, { headers: key ? { 'x-api-key': key } : {} });
        const data = res.ok ? await res.json() : [];
        breedCache[kind] = (Array.isArray(data) ? data : []).map((b: any) => String(b?.name || '')).filter(Boolean);
    } catch {
        breedCache[kind] = [];
    }
    return breedCache[kind]!;
}

// The AI may answer 'light brown' or 'black and white': map it onto the list when a listed colour is in it
const toListedColor = (c?: string | null) => {
    if (!c) return '';
    const low = c.toLowerCase();
    if (/ and |\/|,|mix/.test(low)) return 'Mixed';
    return COLORS.find((x) => low.includes(x.toLowerCase())) || (low.includes('grey') ? 'Gray' : c);
};

const newToken = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `split-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function AnimalRecordsPanel({ reportId, basePath, animalCount, onChanged, compact = false }: {
    reportId: number | string;
    basePath: string;              // e.g. "/subd/reports", "/brgy/reports", "/resident/reports"
    animalCount?: number | null;
    onChanged?: () => void;
    /** Inside a dialog (holding Manage modal): a tap-to-expand row with even-width actions */
    compact?: boolean;
}) {
    const [info, setInfo] = useState<any>(null);
    const [expanded, setExpanded] = useState(false);
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [fewerOpen, setFewerOpen] = useState(false);   // "Fewer were found" reason form
    const [fewerReason, setFewerReason] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await api.get(`/reports/${reportId}/split-group`);
            setInfo(res.data);
        } catch {
            setInfo(null);
        }
    }, [reportId]);
    useEffect(() => { load(); }, [load]);

    const [confirmUndo, setConfirmUndo] = useState(false);
    const undo = async () => {
        setConfirmUndo(false);
        setBusy(true);
        setError('');
        try {
            await api.post(`/reports/${reportId}/unsplit`);
            await load();
            onChanged?.();
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Could not undo the split.');
        } finally {
            setBusy(false);
        }
    };

    const saveFewer = async () => {
        setBusy(true);
        setError('');
        try {
            const res = await api.post(`/reports/${reportId}/count-note`, { reason: fewerReason.trim() });
            setInfo((prev: any) => ({ ...prev, ...res.data }));
            setFewerOpen(false);
            setFewerReason('');
            onChanged?.();
        } catch (e: any) {
            const d = e?.response?.data?.detail;
            setError(typeof d === 'string' ? d : 'Write a short reason (at least 5 characters).');
        } finally {
            setBusy(false);
        }
    };

    if (!info) return null;
    const children: any[] = info.children || [];
    const reported = Number(animalCount || info.group?.animal_count || 1);

    // An animal record: show where it came from
    if (info.is_animal_record) {
        return (
            <div className="rounded-2xl border border-role-border bg-role-soft/60 p-3 flex flex-wrap items-center gap-2.5">
                <PawPrint className="w-4 h-4 text-role shrink-0" />
                <p className="text-[11px] font-bold text-gray-800 dark:text-gray-100 flex-1">
                    {info.label || 'Animal record'}
                </p>
                {info.group && (
                    <Link to={`${basePath}/${info.group.report_id}`} className="text-[10px] font-black text-role hover:underline shrink-0">
                        Open group report
                    </Link>
                )}
                {info.can_replace_photo && <ReplaceAnimalPhotoButton reportId={reportId} onDone={() => { load(); onChanged?.(); }} />}
            </div>
        );
    }

    // An ordinary one-animal report (or one this user can't split): no "Animals in this report" box. Splitting is offered
    // only when the report says 2 or more animals (developer's decision, 2026-10-28); a close-up can still be swapped in.
    if (!info.is_group && (!info.can_split || reported <= 1)) {
        return info.can_replace_photo
            ? <ReplaceAnimalPhotoButton reportId={reportId} onDone={() => { load(); onChanged?.(); }} />
            : null;
    }

    return (
        <div className={`rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#151B26] ${compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'}`}>
            {compact ? (
                <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
                    className="w-full flex items-center gap-2 text-left cursor-pointer">
                    <Layers className="w-4 h-4 text-role shrink-0" />
                    <span className="text-xs font-black text-gray-800 dark:text-gray-100 flex-1">
                        {info.is_group ? `Group report · ${children.length} animal record${children.length === 1 ? '' : 's'}` : 'Animals in this report'}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400">{expanded ? 'Hide' : 'Show'}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </button>
            ) : (
                <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-role" />
                    <p className="text-xs font-black uppercase tracking-wider text-gray-800 dark:text-gray-100 flex-1">
                        {info.is_group ? `Group report · ${children.length} animal record${children.length === 1 ? '' : 's'}` : 'Animals in this report'}
                    </p>
                </div>
            )}
            {(!compact || expanded) && (<>

            {!info.is_group && (
                <p className="text-[11px] font-semibold text-gray-500">
                    {reported > 1
                        ? `This report has ${reported} animals. Add a record for each one so every animal can be matched, held, claimed or adopted on its own.`
                        : 'If this report actually shows more than one animal, add a record for each one.'}
                </p>
            )}

            {/* Reported vs recorded: fewer animal records than the resident reported */}
            {info.is_group && (info.reported_count || 0) > (info.recorded_count || 0) && (
                info.count_note ? (
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 p-2.5 rounded-xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                        {info.recorded_count} of {info.reported_count} reported animals recorded: {info.count_note.reason}
                        {info.count_note.by ? <span className="text-gray-400"> (noted by {info.count_note.by})</span> : null}
                    </p>
                ) : (
                    <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                        <p className="text-[11px] font-black text-amber-900">
                            {info.recorded_count} of {info.reported_count} reported animals recorded.
                        </p>
                        {info.can_unsplit && !fewerOpen && (
                            <p className="text-[10px] font-semibold text-amber-800">
                                Use <strong>Add more animals</strong> for the rest, or{' '}
                                <button type="button" onClick={() => setFewerOpen(true)} className="font-black underline cursor-pointer">say why fewer were found</button>.
                            </p>
                        )}
                        {fewerOpen && (
                            <div className="flex flex-col sm:flex-row gap-2">
                                <input value={fewerReason} onChange={(e) => setFewerReason(e.target.value)} maxLength={300}
                                    placeholder="e.g. Only 2 dogs were on site"
                                    className="flex-1 p-2 rounded-lg border border-amber-200 bg-white text-xs" />
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => { setFewerOpen(false); setFewerReason(''); }}
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-[10px] font-black text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
                                    <button type="button" onClick={saveFewer} disabled={busy || fewerReason.trim().length < 5}
                                        className="px-3 py-2 rounded-lg bg-role hover:bg-role-hover text-white text-[10px] font-black disabled:opacity-50 cursor-pointer">Save</button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            )}

            {children.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {children.map((c) => (
                        <Link key={c.report_id} to={`${basePath}/${c.report_id}`}
                            className="flex items-center gap-2.5 p-2 rounded-xl border border-gray-100 dark:border-white/10 hover:border-role-border hover:bg-role-soft/40 transition-colors">
                            <img src={cloudinaryResized(c.photo_url, 120) || DEFAULT_PET_AVATAR} alt="" loading="lazy"
                                className="w-11 h-11 rounded-lg object-cover border border-gray-200 shrink-0"
                                onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                            <div className="min-w-0">
                                <p className="text-[11px] font-black text-gray-900 dark:text-white truncate">{c.label} · #{c.report_id}</p>
                                <p className="text-[10px] font-semibold text-gray-500 truncate">
                                    {[c.animal_type, c.animal_color].filter(Boolean).join(' · ') || 'Animal'}
                                    {c.status_name ? ` · ${c.status_name}` : ''}{c.holding_id ? ' · in holding' : ''}
                                </p>
                            </div>
                        </Link>
                    ))}
                </div>
            )}

            <div className={compact ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
                {info.can_split && children.length < (info.max_animals || 50) && (
                    <button type="button" onClick={() => setOpen(true)}
                        className={`px-3 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 cursor-pointer ${compact ? 'h-10 justify-center' : ''}`}>
                        <Plus className="w-3.5 h-3.5" /> {info.is_group ? 'Add more animals' : 'Add records per animal'}
                    </button>
                )}
                {!info.is_group && info.can_replace_photo && (
                    <ReplaceAnimalPhotoButton reportId={reportId} onDone={() => { load(); onChanged?.(); }}
                        className={compact ? '[&>label]:w-full [&>label]:h-10 [&>label]:justify-center' : ''} />
                )}
                {info.can_unsplit && (
                    <button type="button" onClick={() => setConfirmUndo(true)} disabled={busy}
                        className="px-3 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer">
                        <Undo2 className="w-3.5 h-3.5" /> Undo split
                    </button>
                )}
            </div>
            {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
            </>)}

            {confirmUndo && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmUndo(false)}>
                    <div className="bg-white dark:bg-[#151B26] rounded-3xl w-full max-w-sm p-5 space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <p className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                            <Undo2 className="w-4 h-4 text-role" /> Undo the split?
                        </p>
                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                            The {children.length} animal record{children.length === 1 ? '' : 's'} will be folded back into this report.
                            Nothing is deleted: they stay in the report's history. You can add records per animal again later.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setConfirmUndo(false)}
                                className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
                            <button type="button" onClick={undo} disabled={busy}
                                className="px-4 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-black disabled:opacity-50 cursor-pointer">Yes, undo split</button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {open && (
                <SplitAnimalsModal reportId={reportId} info={info} reported={reported}
                    onClose={() => setOpen(false)}
                    onDone={async () => { setOpen(false); await load(); onChanged?.(); }} />
            )}
        </div>
    );
}

function SplitAnimalsModal({ reportId, info, reported, onClose, onDone }: {
    reportId: number | string; info: any; reported: number; onClose: () => void; onDone: () => void;
}) {
    const firstBatch = !info.is_group;
    const max = info.max_per_split || 10;
    const existing = (info.children || []).length;
    const room = Math.min(max, (info.max_animals || 50) - existing);
    const initial = firstBatch ? Math.min(max, Math.max(2, reported)) : 1;
    const blank = (): AnimalDraft => ({ animal_type: 'Dog', animal_color: '', animal_breed: '', estimated_size: '', sex: 'Unknown', notes: '' });
    const [count, setCount] = useState(Math.min(initial, room));
    const [drafts, setDrafts] = useState<AnimalDraft[]>(() => Array.from({ length: Math.min(initial, room) }, blank));
    const [token] = useState(newToken);                       // one per opened form: a double click never duplicates
    const [cropFor, setCropFor] = useState<{ index: number; src: string } | null>(null);
    const [carry, setCarry] = useState<{ holding?: number; pet?: number; claims?: number }>({});
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const sources: string[] = info.source_photos || [];
    const [apiBreeds, setApiBreeds] = useState<{ Dog: string[]; Cat: string[] }>({ Dog: [], Cat: [] });
    useEffect(() => {
        let alive = true;
        Promise.all([loadBreeds('Dog'), loadBreeds('Cat')]).then(([d, c]) => { if (alive) setApiBreeds({ Dog: d, Cat: c }); });
        return () => { alive = false; };
    }, []);
    const breedList = (kind: 'Dog' | 'Cat') => {
        const local = kind === 'Dog' ? DOG_BREEDS : CAT_BREEDS;
        const seen = new Set(local.map((b) => b.toLowerCase()));
        return [...local, ...apiBreeds[kind].filter((b) => !seen.has(b.toLowerCase()))];
    };
    const needs = info.carry_needed || {};

    const setN = (n: number) => {
        const v = Math.max(firstBatch ? 2 : 1, Math.min(room, n));
        setCount(v);
        setDrafts((d) => (v > d.length ? [...d, ...Array.from({ length: v - d.length }, blank)] : d.slice(0, v)));
    };
    const patch = (i: number, p: Partial<AnimalDraft>) => setDrafts((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));

    const applyCrop = async (i: number, file: File, preview: string) => {
        setCropFor(null);
        patch(i, { busy: true, error: '', preview });
        try {
            const r = await checkAndUploadAnimalPhoto(file);
            setDrafts((d) => d.map((x, j) => (j === i ? {
                ...x, url: r.url, busy: false,
                animal_type: r.animalType && ['Dog', 'Cat'].includes(r.animalType) ? r.animalType : x.animal_type,
                animal_color: x.animal_color || toListedColor(r.color),
            } : x)));
        } catch (e: any) {
            const doubted = e instanceof AnimalPhotoCheckError && (e.code === 'multiple' || e.code === 'no_animal');
            patch(i, { busy: false, url: undefined, error: e?.message || 'This photo could not be used.',
                       rejectedFile: doubted ? file : undefined, checkedByPerson: false });
        }
    };
    const confirmAnyway = async (i: number) => {
        const file = drafts[i]?.rejectedFile;
        if (!file) return;
        patch(i, { busy: true, error: '' });
        try {
            const r = await uploadAnimalPhotoAnyway(file);
            patch(i, { busy: false, url: r.url, rejectedFile: undefined, checkedByPerson: true });
        } catch (e: any) {
            patch(i, { busy: false, error: e?.message || 'Upload failed.' });
        }
    };

    const ready = drafts.length === count && drafts.every((d) => d.url && !d.busy);
    const carryMissing = firstBatch && (['holding', 'pet', 'claims'] as const).some((k) => needs[k] && carry[k] === undefined);

    const submit = async () => {
        if (!ready || carryMissing) return;
        setSaving(true);
        setError('');
        try {
            await api.post(`/reports/${reportId}/split`, {
                client_token: token,
                animals: drafts.map((d) => ({
                    photo_url: d.url, animal_type: d.animal_type || undefined, animal_color: d.animal_color.trim() || undefined,
                    animal_breed: d.animal_breed.trim() || undefined,
                    estimated_size: d.estimated_size || undefined, sex: d.sex || undefined, notes: d.notes.trim() || undefined,
                })),
                carry: firstBatch ? carry : {},
            });
            onDone();
        } catch (e: any) {
            setError(e?.response?.data?.detail || 'Could not save the animal records.');
        } finally {
            setSaving(false);
        }
    };

    const label = (i: number) => `Animal ${existing + i + 1}`;
    const carryRows = useMemo(() => ([
        ['holding', 'Already in the holding place'], ['pet', 'Confirmed registered pet'], ['claims', 'Open owner claims'],
    ] as const).filter(([k]) => needs[k]), [needs]);

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-[#151B26] rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <p className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                        <Layers className="w-4 h-4 text-role" /> {firstBatch ? 'Add a record for each animal' : 'Add more animals'}
                    </p>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-[11px] font-semibold text-gray-500">
                    Crop each animal out of the report photo (or upload a close-up). The original photo stays on this report as evidence.
                    Up to {max} animals at a time; if there are more, add these first and then use <strong>Add more animals</strong>.
                </p>

                <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black text-gray-700 dark:text-gray-200">Number of animals</span>
                    <input type="number" min={firstBatch ? 2 : 1} max={room} value={count}
                        onChange={(e) => setN(parseInt(e.target.value) || 0)}
                        className="w-20 p-2 rounded-lg border border-gray-200 text-sm font-bold" />
                    <span className="text-[10px] font-semibold text-gray-400">max {room} now</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {drafts.map((d, i) => (
                        <div key={i} className="p-3 rounded-2xl border border-gray-200 dark:border-white/10 space-y-2">
                            <p className="text-[11px] font-black text-gray-900 dark:text-white">{label(i)}</p>
                            <div className="flex gap-2 items-start">
                                <div className="w-20 h-20 rounded-xl border border-dashed border-gray-300 overflow-hidden shrink-0 flex items-center justify-center bg-gray-50">
                                    {d.busy ? <Loader2 className="w-5 h-5 animate-spin text-role" />
                                        : d.preview ? <img src={d.preview} alt="" className="w-full h-full object-cover" />
                                            : <PawPrint className="w-5 h-5 text-gray-300" />}
                                </div>
                                <div className="flex-1 space-y-1.5">
                                    {sources.length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {sources.map((s, si) => (
                                                <button key={si} type="button" onClick={() => setCropFor({ index: i, src: s })}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-role-border text-role text-[10px] font-black hover:bg-role-soft cursor-pointer">
                                                    <Crop className="w-3 h-3" /> Crop photo {si + 1}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <label className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-200 text-gray-600 text-[10px] font-black hover:bg-gray-50 cursor-pointer">
                                        <Upload className="w-3 h-3" /> Upload a photo
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) setCropFor({ index: i, src: URL.createObjectURL(f) });
                                            e.target.value = '';
                                        }} />
                                    </label>
                                    {d.url && !d.busy && (
                                        <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" /> {d.checkedByPerson ? 'Photo confirmed by you' : 'Photo checked'}
                                        </p>
                                    )}
                                    {d.error && <p className="text-[10px] font-semibold text-rose-600">{d.error}</p>}
                                    {d.rejectedFile && !d.busy && (
                                        <button type="button" onClick={() => confirmAnyway(i)}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 text-[10px] font-black hover:bg-amber-100 cursor-pointer">
                                            It's one animal, use this photo anyway
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                <select value={d.animal_type} onChange={(e) => patch(i, { animal_type: e.target.value })} className="p-2 rounded-lg border border-gray-200 text-xs">
                                    <option value="Dog">Dog</option><option value="Cat">Cat</option><option value="Unknown">Unknown</option>
                                </select>
                                <select value={d.sex} onChange={(e) => patch(i, { sex: e.target.value })} className="p-2 rounded-lg border border-gray-200 text-xs">
                                    <option value="Unknown">Sex unknown</option><option value="Male">Male</option><option value="Female">Female</option>
                                </select>
                                <input value={d.animal_color} onChange={(e) => patch(i, { animal_color: e.target.value })} maxLength={255}
                                    list="split-animal-colors" placeholder="Main colour (type to search)" autoComplete="off"
                                    className="p-2 rounded-lg border border-gray-200 text-xs" />
                                <input value={d.animal_breed} onChange={(e) => patch(i, { animal_breed: e.target.value })} maxLength={100}
                                    list={d.animal_type === 'Cat' ? 'split-cat-breeds' : 'split-dog-breeds'}
                                    placeholder="Breed (type to search)" autoComplete="off"
                                    className="p-2 rounded-lg border border-gray-200 text-xs" />
                                <select value={d.estimated_size} onChange={(e) => patch(i, { estimated_size: e.target.value })} className="col-span-2 p-2 rounded-lg border border-gray-200 text-xs">
                                    <option value="">Size</option><option value="Small">Small</option><option value="Medium">Medium</option><option value="Large">Large</option>
                                </select>
                            </div>
                            <input value={d.notes} onChange={(e) => patch(i, { notes: e.target.value })} maxLength={1000}
                                placeholder="Notes, e.g. torn left ear" className="w-full p-2 rounded-lg border border-gray-200 text-xs" />
                        </div>
                    ))}
                </div>

                <datalist id="split-animal-colors">{COLORS.map((c) => <option key={c} value={c} />)}</datalist>
                <datalist id="split-dog-breeds">{breedList('Dog').map((b) => <option key={b} value={b} />)}</datalist>
                <datalist id="split-cat-breeds">{breedList('Cat').map((b) => <option key={b} value={b} />)}</datalist>

                {firstBatch && carryRows.length > 0 && (
                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                        <p className="text-[11px] font-black text-amber-900">This report already has records. Which animal do they belong to?</p>
                        {carryRows.map(([k, text]) => (
                            <div key={k} className="flex items-center gap-2">
                                <span className="text-[11px] font-semibold text-amber-900 flex-1">{text}</span>
                                <select value={carry[k] ?? ''} onChange={(e) => setCarry((c) => ({ ...c, [k]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                                    className="p-1.5 rounded-lg border border-amber-200 text-xs">
                                    <option value="">Choose…</option>
                                    {drafts.map((_, i) => <option key={i} value={i}>{label(i)}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>
                )}

                {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                {(!ready || carryMissing) && !saving && (
                    <p className="text-[11px] font-semibold text-amber-700 text-right">
                        {drafts.some((d) => d.busy) ? 'Checking photos…'
                            : !ready ? `Still needs a photo: ${drafts.map((d, i) => (!d.url ? label(i) : null)).filter(Boolean).join(', ')}.`
                                : 'Choose which animal the existing records belong to.'}
                    </p>
                )}
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50 cursor-pointer">Cancel</button>
                    <button type="button" onClick={submit} disabled={!ready || carryMissing || saving}
                        className="px-4 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-black disabled:opacity-50 cursor-pointer">
                        {saving ? 'Saving…' : `Save ${count} animal record${count === 1 ? '' : 's'}`}
                    </button>
                </div>
            </div>
            {cropFor && (
                <PhotoCropper src={cropFor.src} title={`Crop ${label(cropFor.index)}`}
                    onClose={() => setCropFor(null)} onCropped={(f, prev) => applyCrop(cropFor.index, f, prev)} />
            )}
        </div>,
        document.body,
    );
}
