import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZoomIn } from 'lucide-react';
import api from '../utils/api';
import { DEFAULT_PET_AVATAR } from '../utils/avatar';
import MediaLightbox from './MediaLightbox';
import ManualComparisonCards from './ManualMatching/ManualComparisonCards';
import { petFields, petIdLabel, reportFields } from '../utils/manualMatchFields';

// Owner side of owner-first pet matching (docs/01-system/MANUAL_REPORT_MATCHING.md): staff ask "Is this the animal
// you registered as your pet?" and the owner answers YES or NO. An answer never finalizes a match; staff still verify.

interface ReportedAnimal {
    report_id: number;
    photos: string[];
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    size: string | null;
    description: string | null;
    condition: string | null;
    landmark: string | null;
    initial_landmark?: string | null;
    animal_count?: number | null;
    subdivision: string | null;
    reported_at: string | null;
}

interface YourPet {
    pet_id: number;
    pet_name: string;
    reference_code: string | null;
    photos: string[];
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    gender: string | null;
    distinctive_markings: string | null;
    size?: string | null;
    registered_address?: string | null;
    notes?: string | null;
    estimated_age?: string | null;
    is_neutered?: boolean | null;
    owner_name?: string | null;
}

interface ConfirmationRequest {
    request_id: number;
    question: string;
    status: string;
    status_label: string;
    requested_at: string | null;
    requested_by_name: string | null;
    staff_message: string | null;
    owner_response: 'YES' | 'NO' | null;
    owner_note: string | null;
    owner_response_at: string | null;
    final_label: string | null;
    final_at: string | null;
    reported_animal: ReportedAnimal | null;
    your_pet: YourPet | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '—');

const STATUS_STYLE: Record<string, string> = {
    AWAITING_OWNER_CONFIRMATION: 'bg-sky-50 text-sky-700 border-sky-200',
    OWNER_CONFIRMED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    OWNER_REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
    CANCELLED: 'bg-gray-50 text-gray-500 border-gray-200',
    NEEDS_FURTHER_VERIFICATION: 'bg-amber-50 text-amber-700 border-amber-200',
    VERIFIED_MATCH: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    REJECTED_MATCH: 'bg-rose-100 text-rose-800 border-rose-300',
};

const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    return typeof d === 'string' ? d : fallback;
};

const Comparison = ({ r, onInspect }: { r: ConfirmationRequest; onInspect: (leftIdx?: number, rightIdx?: number) => void }) => {
    const rep = r.reported_animal;
    const pet = r.your_pet;
    if (!rep || !pet) return null;
    // The stray report as submitted and your pet's record as saved, side by side (no AI analysis, no score)
    return (
        <>
            <button
                type="button"
                onClick={() => onInspect(0, 0)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-orange-200 bg-orange-50/70 hover:bg-orange-100 text-orange-950 text-xs font-black transition cursor-pointer shadow-2xs"
            >
                <ZoomIn className="w-4 h-4 text-orange-600" />
                <span>Side-by-Side Dual-Zoom (Inspect Markings & Details)</span>
            </button>
            <ManualComparisonCards
                report={{
                    label: `Report #${rep.report_id}`,
                    photo: rep.photos[0] || null,
                    photoCount: rep.photos.length,
                    fields: reportFields({
                        report_id: rep.report_id, animal_type: rep.animal_type, animal_breed: rep.breed, animal_color: rep.color,
                        estimated_size: rep.size, description: rep.description, condition: rep.condition, landmark: rep.landmark,
                        initial_landmark: rep.initial_landmark, created_at: rep.reported_at, animal_count: rep.animal_count,
                    }),
                }}
                pet={{
                    label: `${pet.pet_name} · ${petIdLabel(pet)}`,
                    photo: pet.photos[0] || null,
                    photoCount: pet.photos.length,
                    fields: petFields({
                        pet_id: pet.pet_id, pet_name: pet.pet_name, reference_code: pet.reference_code, pet_type: pet.animal_type,
                        breed: pet.breed, color_markings: pet.color, size_category: pet.size, distinctive_markings: pet.distinctive_markings,
                        registered_address: pet.registered_address, owner_name: pet.owner_name, notes: pet.notes, gender: pet.gender,
                        estimated_age: pet.estimated_age, is_neutered: pet.is_neutered,
                    }),
                }}
                onInspectReport={() => onInspect(0, 0)}
                onInspectPet={() => onInspect(0, 0)}
            />
        </>
    );
};

/** My Pets inbox: staff found an animal that may be your pet. Answer YES or NO; staff make the final decision. */
const PetMatchConfirmationRequests = () => {
    const [items, setItems] = useState<ConfirmationRequest[]>([]);
    const [answering, setAnswering] = useState<{ item: ConfirmationRequest; answer: 'YES' | 'NO' } | null>(null);
    const [inspectItem, setInspectItem] = useState<{ r: ConfirmationRequest; leftIdx: number; rightIdx: number } | null>(null);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [searchParams] = useSearchParams();
    const focusId = Number(searchParams.get('confirm')) || null;

    const load = useCallback(async () => {
        try {
            const res = await api.get('/pet-match-confirmations/mine');
            setItems(Array.isArray(res.data?.results) ? res.data.results : []);
        } catch {
            setItems([]);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        api.get('/pet-match-confirmations/mine')
            .then((res) => { if (!cancelled) setItems(Array.isArray(res.data?.results) ? res.data.results : []); })
            .catch(() => { if (!cancelled) setItems([]); });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (focusId && items.length) document.getElementById(`pet-confirm-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, [focusId, items.length]);

    const submit = async () => {
        if (!answering) return;
        setBusy(true);
        setError(null);
        try {
            const res = await api.post(`/pet-match-confirmations/${answering.item.request_id}/respond`, {
                answer: answering.answer, note: note.trim() || null,
            });
            setNotice(res.data?.message || 'Your answer was saved.');
            setAnswering(null);
            setNote('');
            await load();
        } catch (e) {
            setError(errorText(e, 'Could not send your answer. Please try again.'));
        } finally {
            setBusy(false);
        }
    };

    if (items.length === 0) return null;
    const pending = items.filter((i) => i.status === 'AWAITING_OWNER_CONFIRMATION');
    const past = items.filter((i) => i.status !== 'AWAITING_OWNER_CONFIRMATION');

    return (
        <section className="mb-6 space-y-3" data-testid="pet-match-confirmations">
            {pending.length > 0 && (
                <div className="flex items-center gap-2">
                    <span className="text-lg" aria-hidden="true">🔎</span>
                    <h2 className="text-sm font-black uppercase tracking-wider text-[#1a1208] dark:text-white">
                        Is this your pet? ({pending.length})
                    </h2>
                </div>
            )}
            {notice && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700" role="status">{notice}</p>}
            {error && !answering && <p className="text-xs font-bold text-rose-600" role="alert">{error}</p>}

            {pending.map((item) => (
                <div
                    key={item.request_id}
                    id={`pet-confirm-${item.request_id}`}
                    className={`space-y-3 rounded-2xl border-2 bg-role-soft/60 p-4 dark:bg-role-strong/20 ${focusId === item.request_id ? 'border-orange-400' : 'border-role-border dark:border-role-strong'}`}
                >
                    <div>
                        <p className="text-sm font-black text-[#1a1208] dark:text-white">{item.question}</p>
                        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                            {item.requested_by_name || 'A staff member'} found an animal that may be {item.your_pet?.pet_name || 'your pet'} · {fmt(item.requested_at)}
                        </p>
                        {item.staff_message && <p className="mt-1 text-xs font-semibold text-gray-700 dark:text-gray-200">Message from staff: {item.staff_message}</p>}
                    </div>
                    <Comparison
                        r={item}
                        onInspect={(leftIdx = 0, rightIdx = 0) => setInspectItem({ r: item, leftIdx, rightIdx })}
                    />
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => { setAnswering({ item, answer: 'YES' }); setNote(''); setError(null); }}
                            className="flex-1 cursor-pointer rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700"
                        >
                            Yes, this is my pet
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAnswering({ item, answer: 'NO' }); setNote(''); setError(null); }}
                            className="flex-1 cursor-pointer rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-rose-700 hover:bg-rose-50"
                        >
                            No, this is not my pet
                        </button>
                    </div>
                    <p className="text-[11px] font-semibold text-gray-500">Your answer helps staff decide. Staff still make the final verification.</p>
                </div>
            ))}

            {past.length > 0 && (
                <details className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-[#1A1A1A]">
                    <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-gray-600 dark:text-gray-300">
                        Pet confirmation history ({past.length})
                    </summary>
                    <ul className="mt-3 space-y-2">
                        {past.map((item) => (
                            <li key={item.request_id} id={`pet-confirm-${item.request_id}`} className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[item.status] || ''}`}>{item.status_label}</span>
                                <span className="font-bold">{item.your_pet?.pet_name}</span>
                                <span>Report #{item.reported_animal?.report_id}</span>
                                {item.owner_response && <span>· you answered {item.owner_response === 'YES' ? 'yes' : 'no'} on {fmt(item.owner_response_at)}</span>}
                                {item.final_label && <span>· staff decision: {item.final_label} ({fmt(item.final_at)})</span>}
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            {answering && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
                    <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#1A1A1A]">
                        <h3 className="text-base font-black text-gray-900 dark:text-white">
                            {answering.answer === 'YES'
                                ? `Confirm this is ${answering.item.your_pet?.pet_name || 'your pet'}?`
                                : `This is not ${answering.item.your_pet?.pet_name || 'your pet'}?`}
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            {answering.answer === 'YES'
                                ? 'Staff will review your answer and make the final verification.'
                                : 'Staff will be told it is not your pet and will look for the right owner.'}
                        </p>
                        <textarea
                            rows={3}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={1000}
                            placeholder={answering.answer === 'YES' ? 'Optional: e.g. that is his red collar' : 'Optional: e.g. my dog is at home'}
                            className="w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-xs focus:border-orange-400 focus:outline-none dark:border-gray-700 dark:bg-[#121212]"
                            aria-label="Optional note to staff"
                        />
                        {error && <p className="text-xs font-bold text-rose-600" role="alert">{error}</p>}
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setAnswering(null)} disabled={busy}
                                className="flex-1 cursor-pointer rounded-xl border border-gray-200 py-2.5 text-xs font-black uppercase text-gray-700 dark:text-gray-200">
                                Back
                            </button>
                            <button type="button" onClick={submit} disabled={busy}
                                className={`flex-1 cursor-pointer rounded-xl py-2.5 text-xs font-black uppercase text-white disabled:opacity-50 ${answering.answer === 'YES' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
                                {busy ? 'Sending…' : answering.answer === 'YES' ? 'Yes, this is my pet' : 'No, not my pet'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {inspectItem && inspectItem.r.reported_animal && inspectItem.r.your_pet && (
                <MediaLightbox
                    title={`Detail Inspection: Report #${inspectItem.r.reported_animal.report_id} vs ${inspectItem.r.your_pet.pet_name}`}
                    onClose={() => setInspectItem(null)}
                    compare={{
                        left: {
                            title: `Report #${inspectItem.r.reported_animal.report_id}`,
                            badge: 'Reported Animal',
                            items: (inspectItem.r.reported_animal.photos.length ? inspectItem.r.reported_animal.photos : [DEFAULT_PET_AVATAR]).map((src, i) => ({
                                url: src,
                                caption: `Report #${inspectItem.r.reported_animal?.report_id} · Photo ${i + 1}`,
                            })),
                            initialIndex: inspectItem.leftIdx,
                        },
                        right: {
                            title: inspectItem.r.your_pet.pet_name,
                            badge: 'Your Registered Pet',
                            items: (inspectItem.r.your_pet.photos.length ? inspectItem.r.your_pet.photos : [DEFAULT_PET_AVATAR]).map((src, i) => ({
                                url: src,
                                caption: `${inspectItem.r.your_pet?.pet_name} · Photo ${i + 1}`,
                            })),
                            initialIndex: inspectItem.rightIdx,
                        },
                    }}
                />
            )}
        </section>
    );
};

export default PetMatchConfirmationRequests;
