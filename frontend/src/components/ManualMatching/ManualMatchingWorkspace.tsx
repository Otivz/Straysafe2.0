import { useCallback, useEffect, useState, useRef } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, MessageSquare, Shield, FileText, ArrowRight, ExternalLink, ZoomIn, ChevronDown } from 'lucide-react';
import api, { getAuthenticatedUser } from '../../utils/api';
import { useToast } from '../../context/ToastContext';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';
import MediaLightbox, { type LightboxItem } from '../MediaLightbox';
import ReportChatDrawer from '../Chat/ReportChatDrawer';
import AIMatchReviewModal from '../Modals/AIMatchReviewModal';

// Manual Report Matching (docs/01-system/MANUAL_REPORT_MATCHING.md). Works whether Gemini is ON or OFF.
// Nothing here scores or ranks a pair: "shared details" are plain facts, and only a staff decision makes a match.
// A report can be compared with another report or with a registered pet. Pets are owner-first: staff Send
// Confirmation, the owner answers YES or NO, and only after a YES do the staff's final verification actions appear.
// The backend enforces the same order (app/utils/pet_match_confirmation.py), so these buttons are never the only guard.

type Decision = 'CONFIRMED_MATCH' | 'NOT_A_MATCH' | 'UNABLE_TO_VERIFY';



interface Reporter { user_id: number; name: string; phone?: string | null; email?: string | null }

interface ReportCard {
    report_id: number;
    report_type: 'Lost Pet' | 'Stray Animal';
    category: string | null;
    photo_url: string | null;
    photos?: string[];
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    size: string | null;
    gender: string | null;
    coat_pattern: string | null;
    landmark: string | null;
    subdivision: string | null;
    latitude: number | null;
    longitude: number | null;
    created_at: string | null;
    status: string | null;
    case_id: number;
    reporter: Reporter | null;
    description?: string | null;
    description_preview?: string | null;
    condition?: string | null;
    custody_status?: string | null;
    // Candidates only
    pair?: { match_id: number; status: string; decided_manually: boolean } | null;
    distance_km?: number | null;
    shared_details?: string[];
}

interface ConfirmationInfo {
    request_id: number;
    status: string;
    status_label: string;
    can_finalize: boolean;
    requested_by_name: string | null;
    requested_at: string | null;
    staff_message: string | null;
    owner_response: 'YES' | 'NO' | null;
    owner_note: string | null;
    owner_response_at: string | null;
    cancel_reason: string | null;
    cancelled_at: string | null;
    final_decision: string | null;
    final_by_name: string | null;
    final_at: string | null;
}

interface PetCard {
    pet_id: number;
    reference_code: string | null;
    pet_name: string;
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    gender: string | null;
    size: string | null;
    distinctive_markings: string | null;
    photo_url: string | null;
    photos?: string[];
    pet_status: string | null;
    registered_address: string | null;
    last_seen_at: string | null;
    owner: { user_id: number; name: string; phone: string | null; email?: string | null; outside_area: boolean } | null;
    notes?: string | null;
    estimated_age?: string | null;
    temperament?: string | null;
    // Candidates only
    pair?: { match_id: number; status: string; owner_confirmation_status?: string; decided_manually: boolean; similarity_score?: number } | null;
    distance_km?: number | null;
    shared_details?: string[];
    // Owner-first state for this report and pet
    confirmation?: ConfirmationInfo | null;
    can_send_reason?: string | null;
}

type Target = { kind: 'report'; report: ReportCard } | { kind: 'pet'; pet: PetCard };

interface HistoryRow {
    decision_id: number;
    match_id: number | null;
    report_a_id: number;
    report_b_id: number | null;
    pet_id: number | null;
    pet_name: string | null;
    decision: Decision;
    decision_label: string;
    previous_status: string | null;
    notes: string;
    staff_name: string | null;
    staff_role: string | null;
    linked_case_id: number | null;
    ai_state: string | null;
    created_at: string | null;
}

interface FilterState {
    report_type: string;
    animal_type: string;
    breed: string;
    color: string;
    gender: string;
    location: string;
    features: string;
    date_from: string;
    date_to: string;
    radius_km: string;
    include_closed: boolean;
    pet_status: string;
}

const EMPTY_FILTERS: FilterState = {
    report_type: '', animal_type: '', breed: '', color: '', gender: '', location: '', features: '',
    date_from: '', date_to: '', radius_km: '', include_closed: false, pet_status: '',
};

const DECISION_STYLE: Record<string, string> = {
    CONFIRMED_MATCH: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    NOT_A_MATCH: 'bg-rose-50 text-rose-700 border-rose-200',
    UNABLE_TO_VERIFY: 'bg-amber-50 text-amber-700 border-amber-200',
};
const STATUS_LABEL: Record<string, string> = {
    CONFIRMED_MATCH: 'Confirmed Match',
    NOT_A_MATCH: 'Rejected',
    UNABLE_TO_VERIFY: 'Needs Further Verification',
    AI_SUGGESTED: 'Potential Match',
    PENDING_VERIFICATION: 'Pending Verification',
    COVERED_BY_CASE: 'Covered by Case',
    SUPERSEDED_BY_CASE: 'Superseded',
};
const REQUEST_STYLE: Record<string, string> = {
    AWAITING_OWNER_CONFIRMATION: 'border-sky-200 bg-sky-50 text-sky-700',
    OWNER_CONFIRMED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    OWNER_REJECTED: 'border-rose-200 bg-rose-50 text-rose-700',
    CANCELLED: 'border-slate-200 bg-slate-50 text-slate-500',
    NEEDS_FURTHER_VERIFICATION: 'border-amber-200 bg-amber-50 text-amber-700',
    VERIFIED_MATCH: 'border-emerald-300 bg-emerald-100 text-emerald-800',
    REJECTED_MATCH: 'border-rose-300 bg-rose-100 text-rose-800',
};
const OWNER_ANSWER: Record<string, string> = {
    OWNER_CONFIRMED: 'Owner confirmed', OWNER_REJECTED: 'Owner said no', UNSURE: 'Owner unsure', NO_RESPONSE: 'No owner answer',
};

const getOwnerFeedbackBadge = (status?: string | null) => {
    switch (status) {
        case 'OWNER_CONFIRMED':
        case 'YES':
            return <span className="px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-full text-xs font-semibold">✓ Owner Confirmed</span>;
        case 'OWNER_REJECTED':
        case 'NO':
            return <span className="px-2.5 py-0.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-full text-xs font-semibold">✕ Owner Reported Not Their Pet</span>;
        case 'AWAITING_OWNER_CONFIRMATION':
            return <span className="px-2.5 py-0.5 bg-sky-50 border border-sky-200 text-sky-700 rounded-full text-xs font-semibold">• Awaiting Owner Confirmation</span>;
        case 'NO_RESPONSE':
        case 'PENDING':
        default:
            return <span className="px-2.5 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 rounded-full text-xs font-semibold">• Owner Did Not Respond (Pending)</span>;
    }
};

const errorText = (e: unknown, fallback: string) => {
    const d = (e as { response?: { data?: { detail?: unknown } } } | null)?.response?.data?.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d.length) return d.map((x: { msg?: string }) => x?.msg || '').filter(Boolean).join('; ') || fallback;
    return fallback;
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '—');

const show = (v: string | null | undefined) => (v && v.trim() && v.toLowerCase() !== 'unknown' ? v : '—');

const toParams = (f: FilterState, center?: { lat: number; lng: number } | null) => {
    const p: Record<string, string | boolean> = {};
    (Object.keys(f) as (keyof FilterState)[]).forEach((k) => {
        const v = f[k];
        if (k === 'include_closed') { if (v) p[k] = true; return; }
        if (typeof v === 'string' && v.trim()) p[k] = v.trim();
    });
    if (p.radius_km && center) { p.lat = String(center.lat); p.lng = String(center.lng); }
    return p;
};

const inputCls = 'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100';

// ─── Manual Matching Guidance ──────────────────────────────────────────────
const ManualMatchingNotice = () => (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xs">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
        <div className="min-w-0">
            <p className="text-sm font-black text-slate-800">Staff-Operated Manual Matching</p>
            <p className="text-xs font-semibold text-slate-500">
                Search reports and registered pets, compare physical traits side-by-side, and request owner verification.
            </p>
        </div>
    </div>
);

const DOG_BREEDS = [
    'Aspin',
    'Shih Tzu',
    'Pomeranian',
    'Chihuahua',
    'Golden Retriever',
    'Labrador Retriever',
    'Siberian Husky',
    'German Shepherd',
    'Rottweiler',
    'Bulldog',
    'Poodle',
    'Pug',
    'Beagle',
    'Dachshund',
    'Chow Chow',
    'Doberman',
    'Pitbull',
    'Corgi',
    'Dalmatian',
    'Boxer',
    'Mixed Breed',
];

const CAT_BREEDS = [
    'Puspin',
    'Domestic Shorthair',
    'Domestic Longhair',
    'Siamese',
    'Persian',
    'Maine Coon',
    'Bengal',
    'British Shorthair',
    'Ragdoll',
    'Scottish Fold',
    'Russian Blue',
    'Sphynx',
    'Mixed Breed',
];

const BreedCombobox = ({
    value,
    onChange,
    animalType,
    className,
}: {
    value: string;
    onChange: (val: string) => void;
    animalType: string;
    className: string;
}) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const searchLow = value.trim().toLowerCase();
    const filterList = (list: string[]) =>
        searchLow ? list.filter((b) => b.toLowerCase().includes(searchLow)) : list;

    const visibleDogs = filterList(DOG_BREEDS);
    const visibleCats = filterList(CAT_BREEDS);
    const hasExactMatch = [...DOG_BREEDS, ...CAT_BREEDS].some((b) => b.toLowerCase() === searchLow);

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative flex items-center">
                <input
                    type="text"
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    placeholder="e.g. Aspin (select or type)"
                    className={`${className} pr-7`}
                    maxLength={100}
                />
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setOpen((prev) => !prev)}
                    className="absolute right-2 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                    title="Toggle breed list"
                    aria-label="Toggle breed dropdown"
                >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180 text-orange-500' : ''}`} />
                </button>
            </div>

            {open && (
                <div className="absolute left-0 right-0 top-full mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg z-50 text-xs custom-scrollbar">
                    <button
                        type="button"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onChange('');
                            setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-bold transition-colors cursor-pointer ${
                            !value ? 'bg-orange-50 text-orange-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                    >
                        <span>Any breed</span>
                        {!value && <span className="text-[10px] text-orange-600 font-extrabold">✓</span>}
                    </button>

                    {(animalType === 'Dog' || !animalType) && visibleDogs.length > 0 && (
                        <div>
                            {!animalType && (
                                <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    Dog Breeds
                                </div>
                            )}
                            {visibleDogs.map((b) => (
                                <button
                                    key={`dog-${b}`}
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        onChange(b);
                                        setOpen(false);
                                    }}
                                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-medium transition-colors cursor-pointer ${
                                        value.toLowerCase() === b.toLowerCase()
                                            ? 'bg-orange-50 font-bold text-orange-700'
                                            : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>{b}</span>
                                    {value.toLowerCase() === b.toLowerCase() && (
                                        <span className="text-[10px] text-orange-600 font-extrabold">✓</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {(animalType === 'Cat' || !animalType) && visibleCats.length > 0 && (
                        <div>
                            {!animalType && (
                                <div className="mt-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    Cat Breeds
                                </div>
                            )}
                            {visibleCats.map((b) => (
                                <button
                                    key={`cat-${b}`}
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        onChange(b);
                                        setOpen(false);
                                    }}
                                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left font-medium transition-colors cursor-pointer ${
                                        value.toLowerCase() === b.toLowerCase()
                                            ? 'bg-orange-50 font-bold text-orange-700'
                                            : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                >
                                    <span>{b}</span>
                                    {value.toLowerCase() === b.toLowerCase() && (
                                        <span className="text-[10px] text-orange-600 font-extrabold">✓</span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {searchLow && !hasExactMatch && (
                        <div className="border-t border-slate-100 mt-1 pt-1">
                            <button
                                type="button"
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    onChange(value.trim());
                                    setOpen(false);
                                }}
                                className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold text-slate-700 hover:bg-orange-50 hover:text-orange-700 cursor-pointer"
                            >
                                <span className="text-slate-400">Use:</span>
                                <span>"{value.trim()}"</span>
                            </button>
                        </div>
                    )}

                    {visibleDogs.length === 0 && visibleCats.length === 0 && !searchLow && (
                        <div className="p-2 text-center text-xs text-slate-400">
                            No breeds available
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── Filters ────────────────────────────────────────────────────────────────
const FilterToolbar = ({ value, onChange, onSubmit, onReset, radiusHint, extra, mode = 'report' }: {
    mode?: 'report' | 'pet';
    value: FilterState;
    onChange: (f: FilterState) => void;
    onSubmit: () => void;
    onReset: () => void;
    radiusHint: string;
    extra?: ReactNode;
}) => {
    const set = (k: keyof FilterState) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        onChange({ ...value, [k]: k === 'include_closed' ? (e.target as HTMLInputElement).checked : e.target.value });

    const handleAnimalChange = (e: ChangeEvent<HTMLSelectElement>) => {
        const nextAnimal = e.target.value;
        let nextBreed = value.breed;
        if (nextAnimal === 'Dog' && CAT_BREEDS.includes(value.breed) && !DOG_BREEDS.includes(value.breed)) {
            nextBreed = '';
        } else if (nextAnimal === 'Cat' && DOG_BREEDS.includes(value.breed) && !CAT_BREEDS.includes(value.breed)) {
            nextBreed = '';
        }
        onChange({ ...value, animal_type: nextAnimal, breed: nextBreed });
    };

    return (
        <form
            className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4"
            onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {mode === 'report' ? (
                    <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Report type
                        <select className={inputCls} value={value.report_type} onChange={set('report_type')}>
                            <option value="">Any</option>
                            <option value="lost">Lost Pet</option>
                            <option value="stray">Stray Animal</option>
                        </select>
                    </label>
                ) : (
                    <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Pet status
                        <select className={inputCls} value={value.pet_status} onChange={set('pet_status')}>
                            <option value="">Any eligible</option>
                            <option value="Lost">Lost</option>
                            <option value="Active">Active</option>
                            <option value="Found">Found</option>
                            <option value="Rescued">Rescued</option>
                        </select>
                    </label>
                )}
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Animal
                    <select className={inputCls} value={value.animal_type} onChange={handleAnimalChange}>
                        <option value="">Any</option>
                        <option value="Dog">Dog</option>
                        <option value="Cat">Cat</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Sex
                    <select className={inputCls} value={value.gender} onChange={set('gender')}>
                        <option value="">Any</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Breed
                    <BreedCombobox
                        value={value.breed}
                        onChange={(b) => onChange({ ...value, breed: b })}
                        animalType={value.animal_type}
                        className={inputCls}
                    />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Color
                    <input className={inputCls} value={value.color} onChange={set('color')} placeholder="e.g. brown" maxLength={100} />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Location
                    <input className={inputCls} value={value.location} onChange={set('location')} placeholder={mode === 'pet' ? 'Registered address' : 'Landmark or subdivision'} maxLength={100} />
                </label>
                <label className="col-span-2 flex flex-col gap-1 text-[11px] font-bold text-slate-500">Distinguishing features
                    <input className={inputCls} value={value.features} onChange={set('features')} placeholder="e.g. red collar, limp, scar" maxLength={200} />
                </label>
                {mode === 'report' && (
                    <>
                        <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Reported from
                            <input type="date" className={inputCls} value={value.date_from} onChange={set('date_from')} />
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500">Reported to
                            <input type="date" className={inputCls} value={value.date_to} onChange={set('date_to')} />
                        </label>
                    </>
                )}
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-500" title={radiusHint}>Radius (km)
                    <input type="number" min={0.1} max={50} step={0.1} className={inputCls} value={value.radius_km} onChange={set('radius_km')} placeholder={radiusHint} />
                </label>
                {mode === 'report' && (
                    <label className="flex items-end gap-2 pb-2 text-[11px] font-bold text-slate-600">
                        <input type="checkbox" className="h-4 w-4 accent-orange-500" checked={value.include_closed} onChange={set('include_closed')} />
                        Include closed / merged
                    </label>
                )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="submit" className="h-9 rounded-xl bg-orange-500 px-4 text-xs font-black text-white hover:bg-orange-600">Search</button>
                <button type="button" onClick={onReset} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 hover:bg-slate-50">Clear filters</button>
                {extra}
            </div>
        </form>
    );
};

// ─── Result card ────────────────────────────────────────────────────────────
const TypePill = ({ type }: { type: string }) => (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${type === 'Lost Pet'
        ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>{type}</span>
);

const ResultCard = ({ r, actions, onPhotoClick }: { r: ReportCard; actions: ReactNode; onPhotoClick?: (url: string, title: string) => void }) => (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <div className="flex gap-3 p-3">
            <button
                type="button"
                onClick={() => onPhotoClick?.(r.photo_url || DEFAULT_PET_AVATAR, `Report #${r.report_id} animal`)}
                className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-[#FFF8EE] cursor-pointer"
                title="Click to view & zoom photo"
            >
                <img
                    src={r.photo_url || DEFAULT_PET_AVATAR}
                    alt={`Report #${r.report_id} animal`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-bold">
                    <ZoomIn className="w-4 h-4" />
                </span>
            </button>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-black text-slate-900">#{r.report_id}</span>
                    <TypePill type={r.report_type} />
                    {r.pair && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${DECISION_STYLE[r.pair.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {STATUS_LABEL[r.pair.status] || r.pair.status}
                        </span>
                    )}
                </div>
                <p className="truncate text-xs font-bold text-slate-700">
                    {[show(r.animal_type), show(r.breed), show(r.color)].filter((x) => x !== '—').join(' · ') || 'No details given'}
                    {r.gender ? ` · ${r.gender}` : ''}
                </p>
                <p className="truncate text-[11px] font-semibold text-slate-500">
                    📍 {r.landmark || r.subdivision || 'Location pinned on map'}
                    {r.distance_km !== undefined && r.distance_km !== null ? ` · ${r.distance_km} km away` : ''}
                </p>
                <p className="text-[11px] font-semibold text-slate-400">{fmtDate(r.created_at)} · {r.status || 'No status'}</p>
                {r.reporter && <p className="truncate text-[11px] font-semibold text-slate-500">Reporter: {r.reporter.name}{r.reporter.phone ? ` · ${r.reporter.phone}` : ''}</p>}
            </div>
        </div>
        {r.shared_details && r.shared_details.length > 0 && (
            <div className="flex flex-wrap gap-1 border-t border-slate-100 px-3 py-2">
                {r.shared_details.map((d) => (
                    <span key={d} className="rounded-md bg-[#FFF8EE] px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{d}</span>
                ))}
            </div>
        )}
        <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 bg-[#FCFBF8] px-3 py-2">{actions}</div>
    </div>
);

// The next step for a registered-pet candidate (all of them open the Potential Match Review modal)
const petActionLabel = (p: PetCard) => {
    const st = p.confirmation?.status || p.pair?.owner_confirmation_status;
    if (st === 'OWNER_CONFIRMED' || st === 'NEEDS_FURTHER_VERIFICATION') return 'Review & finalize';
    if (st === 'AWAITING_OWNER_CONFIRMATION') return 'Review potential match';
    if (st === 'OWNER_REJECTED' || st === 'VERIFIED_MATCH' || st === 'REJECTED_MATCH') return 'View match review';
    return 'Review potential match';
};

const PetResultCard = ({ p, actions, onPhotoClick }: { p: PetCard; actions: ReactNode; onPhotoClick?: (url: string, title: string) => void }) => (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        <div className="flex gap-3 p-3">
            <button
                type="button"
                onClick={() => onPhotoClick?.(p.photo_url || DEFAULT_PET_AVATAR, `Registered Pet: ${p.pet_name}`)}
                className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-[#FFF8EE] cursor-pointer"
                title="Click to view & zoom photo"
            >
                <img
                    src={p.photo_url || DEFAULT_PET_AVATAR}
                    alt={`Registered pet ${p.pet_name}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-[10px] font-bold">
                    <ZoomIn className="w-4 h-4" />
                </span>
            </button>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-black text-slate-900">{p.pet_name}</span>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-700">Registered pet</span>
                    {p.pair?.decided_manually && (
                        <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-black text-white">Manual Match – Staff Identified</span>
                    )}
                    {p.pet_status && (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${p.pet_status === 'Lost' ? 'border-orange-200 bg-orange-50 text-orange-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{p.pet_status}</span>
                    )}
                    {p.confirmation ? (
                        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${REQUEST_STYLE[p.confirmation.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                            {p.confirmation.status_label}
                        </span>
                    ) : !p.pair?.decided_manually ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-600">Potential Match</span>
                    ) : null}
                </div>
                <p className="truncate text-xs font-bold text-slate-700">
                    {[show(p.animal_type), show(p.breed), show(p.color)].filter((x) => x !== '—').join(' · ') || 'No details given'}
                    {p.gender ? ` · ${p.gender}` : ''}
                </p>
                <p className="truncate text-[11px] font-semibold text-slate-500">
                    🏠 {p.registered_address || 'No registered address'}
                    {p.distance_km !== undefined && p.distance_km !== null ? ` · ${p.distance_km} km away` : ''}
                </p>
                <p className="text-[11px] font-semibold text-slate-400">{p.reference_code || `Pet #${p.pet_id}`}{p.last_seen_at ? ` · last seen ${fmtDate(p.last_seen_at)}` : ''}</p>
                {p.owner && (
                    <p className="truncate text-[11px] font-semibold text-slate-500">
                        Owner: {p.owner.name}{p.owner.phone ? ` · ${p.owner.phone}` : p.owner.outside_area ? ' · outside your area' : ''}
                    </p>
                )}
                {p.confirmation?.status === 'OWNER_REJECTED' && (
                    <p className="text-[11px] font-bold text-rose-600">Owner said not their pet. Search for another registered pet.</p>
                )}
                {!p.confirmation && p.pair?.owner_confirmation_status && p.pair.owner_confirmation_status !== 'PENDING' && (
                    <p className="text-[11px] font-bold text-slate-500">{OWNER_ANSWER[p.pair.owner_confirmation_status] || p.pair.owner_confirmation_status}</p>
                )}
            </div>
        </div>
        {p.shared_details && p.shared_details.length > 0 && (
            <div className="flex flex-wrap gap-1 border-t border-slate-100 px-3 py-2">
                {p.shared_details.map((d) => (
                    <span key={d} className="rounded-md bg-[#FFF8EE] px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{d}</span>
                ))}
            </div>
        )}
        <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 bg-[#FCFBF8] px-3 py-2">{actions}</div>
    </div>
);

// ─── Side-by-side comparison + verification ─────────────────────────────────
// One aligned row per attribute; a registered pet fills the same rows from its own record
const ROWS = ['Record', 'Animal', 'Breed', 'Color', 'Sex', 'Size', 'Markings', 'Location', 'Date', 'Status', 'Contact', 'Description', 'Condition'] as const;
type RowLabel = typeof ROWS[number];

const reportRows = (r: ReportCard): Record<RowLabel, string> => ({
    Record: `${r.report_type}${r.category ? ` (${r.category})` : ''}`,
    Animal: show(r.animal_type),
    Breed: show(r.breed),
    Color: show(r.color),
    Sex: show(r.gender),
    Size: show(r.size),
    Markings: show(r.coat_pattern),
    Location: [r.landmark, r.subdivision].filter(Boolean).join(', ') || '—',
    Date: `Reported ${fmtDate(r.created_at)}`,
    Status: [r.status, r.custody_status].filter(Boolean).join(' · ') || '—',
    Contact: r.reporter ? `Reporter: ${[r.reporter.name, r.reporter.phone, r.reporter.email].filter(Boolean).join(' · ')}` : '—',
    Description: show(r.description),
    Condition: show(r.condition),
});

const petRows = (p: PetCard): Record<RowLabel, string> => ({
    Record: `Registered pet ${p.reference_code || `#${p.pet_id}`}`,
    Animal: show(p.animal_type),
    Breed: show(p.breed),
    Color: show(p.color),
    Sex: show(p.gender),
    Size: show(p.size),
    Markings: show(p.distinctive_markings),
    Location: p.registered_address ? `Home: ${p.registered_address}` : '—',
    Date: p.last_seen_at ? `Last seen ${fmtDate(p.last_seen_at)}` : '—',
    Status: show(p.pet_status),
    Contact: p.owner
        ? `Owner: ${[p.owner.name, p.owner.phone, p.owner.email].filter(Boolean).join(' · ')}${!p.owner.phone && p.owner.outside_area ? ' (outside your area)' : ''}`
        : 'No owner on record',
    Description: show(p.notes),
    Condition: [p.estimated_age, p.temperament].filter(Boolean).join(' · ') || '—',
});

const PetConfirmationPanel = ({ report, pet, onChanged }: { report: ReportCard; pet: PetCard; onChanged: () => void }) => {
    const toast = useToast();
    const [history, setHistory] = useState<ConfirmationInfo[] | null>(null);
    const [message, setMessage] = useState('');
    const [cancelReason, setCancelReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const current = pet.confirmation || null;
    const status = current?.status || null;
    const canSend = !pet.can_send_reason;

    useEffect(() => {
        let cancelled = false;
        api.get('/manual-matching/pet-confirmations', { params: { report_id: report.report_id, pet_id: pet.pet_id } })
            .then((r) => { if (!cancelled) setHistory(r.data.results || []); })
            .catch(() => { if (!cancelled) setHistory([]); });
        return () => { cancelled = true; };
    }, [report.report_id, pet.pet_id]);

    const run = async (fn: () => Promise<{ data?: { message?: string } }>, okTitle: string, failTitle: string) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fn();
            toast.success(okTitle, res.data?.message);
            onChanged();
        } catch (e) {
            const msg = errorText(e, 'Please try again.');
            setError(msg);
            toast.error(failTitle, msg);
        } finally {
            setBusy(false);
        }
    };

    const send = () => run(
        () => api.post('/manual-matching/pet-confirmations', { report_id: report.report_id, pet_id: pet.pet_id, message: message.trim() || null }),
        'Confirmation request sent', 'Request not sent',
    );
    const cancel = () => current && run(
        () => api.post(`/manual-matching/pet-confirmations/${current.request_id}/cancel`, { reason: cancelReason.trim() }),
        'Request cancelled', 'Request not cancelled',
    );

    return (
        <div className="space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800">Owner Confirmation Flow</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${status ? REQUEST_STYLE[status] : 'border-slate-200 bg-white text-slate-600'}`}>
                    {current ? current.status_label : 'Not Sent Yet'}
                </span>
            </div>

            {current?.owner_response && (
                <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${current.owner_response === 'YES' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
                    <p className="font-black">
                        Owner answered {current.owner_response === 'YES' ? '"Yes, this is my pet"' : '"No, this is not my pet"'} · {fmtDate(current.owner_response_at)}
                    </p>
                    {current.owner_note && <p className="mt-0.5">Owner's note: {current.owner_note}</p>}
                </div>
            )}

            {!current || status === 'CANCELLED' ? (
                canSend ? (
                    <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-500">
                            Staff can send this report to the registered owner so they can confirm if it is their pet.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                                maxLength={1000}
                                placeholder="Optional message to owner (e.g. check collar/markings)"
                                className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                                aria-label="Message to the owner"
                            />
                            <button type="button" onClick={send} disabled={busy}
                                className="h-9 px-4 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-xs font-black text-white disabled:opacity-50 shrink-0 cursor-pointer transition-all shadow-xs">
                                {busy ? 'Sending…' : 'Send Confirmation Request'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{pet.can_send_reason}</p>
                )
            ) : status === 'AWAITING_OWNER_CONFIRMATION' ? (
                <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/70 p-3">
                    <p className="text-xs font-bold text-sky-900">
                        Request sent by {current.requested_by_name || 'staff'} on {fmtDate(current.requested_at)}. Waiting for owner's response.
                        Final verification unlocks once the owner confirms this is their pet.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            maxLength={1000}
                            placeholder="Reason to cancel (e.g. sent for wrong pet)"
                            className={inputCls}
                            aria-label="Reason to cancel the request"
                        />
                        <button type="button" onClick={cancel} disabled={busy || cancelReason.trim().length < 5}
                            className="h-9 shrink-0 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer">
                            Cancel request
                        </button>
                    </div>
                </div>
            ) : status === 'OWNER_REJECTED' ? (
                <p className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700">
                    The owner reported this is not their pet. Mark this as Not a Match to conclude review.
                </p>
            ) : status === 'VERIFIED_MATCH' || status === 'REJECTED_MATCH' ? (
                <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
                    Final decision by {current.final_by_name || 'staff'} on {fmtDate(current.final_at)}: {current.status_label}.
                </p>
            ) : null}

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" role="alert">{error}</p>}

            {history && history.length > 0 && (
                <details className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <summary className="cursor-pointer text-[11px] font-black text-slate-600">Confirmation history ({history.length})</summary>
                    <ul className="mt-2 space-y-1.5">
                        {history.map((h) => (
                            <li key={h.request_id} className="text-[11px] font-semibold text-slate-600">
                                <span className={`mr-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${REQUEST_STYLE[h.status] || ''}`}>{h.status_label}</span>
                                #{h.request_id} sent {fmtDate(h.requested_at)} by {h.requested_by_name || 'staff'}
                                {h.owner_response ? ` · owner ${h.owner_response === 'YES' ? 'said yes' : 'said no'} ${fmtDate(h.owner_response_at)}` : ''}
                                {h.cancel_reason ? ` · cancelled: ${h.cancel_reason}` : ''}
                                {h.final_at ? ` · final ${fmtDate(h.final_at)} by ${h.final_by_name || 'staff'}` : ''}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
};

const ComparePanel = ({ a, target, distanceKm, pairStatus, reportPath, onClose, onSaved }: {
    a: ReportCard;
    target: Target;
    distanceKm: number | null | undefined;
    pairStatus: string | null;
    reportPath: (id: number) => string;
    onClose: () => void;
    onSaved: () => void;
}) => {
    const toast = useToast();
    const [decision, setDecision] = useState<Decision | null>(null);
    const [notes, setNotes] = useState('');
    const [linkCase, setLinkCase] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmedGuidance, setConfirmedGuidance] = useState<{
        matchId?: number;
        linkedCaseId?: number | null;
        linkedToPet?: boolean;
    } | null>(null);
    const [lightbox, setLightbox] = useState<{
        items?: LightboxItem[];
        startIndex?: number;
        title: string;
        compare?: {
            left: { title: string; badge?: string; items: LightboxItem[]; initialIndex?: number };
            right: { title: string; badge?: string; items: LightboxItem[]; initialIndex?: number };
        };
        initialMode?: 'split' | 'left' | 'right';
    } | null>(null);

    const [isChatOpen, setIsChatOpen] = useState(false);
    const currentUser = getAuthenticatedUser();

    const isPet = target.kind === 'pet';
    const pet = isPet ? target.pet : null;
    const isCommunityAnimal = isPet && !pet?.owner;
    const ownerStatus = pet?.confirmation?.owner_response || pet?.confirmation?.status || pet?.pair?.owner_confirmation_status;
    const isOwnerConfirmed = ownerStatus === 'OWNER_CONFIRMED' || ownerStatus === 'YES';
    const isOwnerRejected = ownerStatus === 'OWNER_REJECTED' || ownerStatus === 'NO';
    const isStaffConfirmed = pairStatus === 'CONFIRMED_MATCH' || pet?.pair?.status === 'CONFIRMED_MATCH';
    const targetName = isPet ? target.pet.pet_name : `Report #${target.report.report_id}`;
    const ownerName = pet?.owner?.name || 'Registered Owner';

    const reportPhotos = (r: ReportCard) => (r.photos && r.photos.length ? r.photos : r.photo_url ? [r.photo_url] : []);
    const targetPhotos = target.kind === 'pet'
        ? (target.pet.photos && target.pet.photos.length ? target.pet.photos : target.pet.photo_url ? [target.pet.photo_url] : [])
        : reportPhotos(target.report);

    const openCompare = (leftIdx = 0, rightIdx = 0, mode: 'split' | 'left' | 'right' = 'split') => {
        const leftPhotos = reportPhotos(a);
        const leftList: LightboxItem[] = (leftPhotos.length ? leftPhotos : [DEFAULT_PET_AVATAR]).map((u, idx) => ({ url: u, caption: `Report #${a.report_id} · Photo ${idx + 1}` }));
        const rightList: LightboxItem[] = (targetPhotos.length ? targetPhotos : [DEFAULT_PET_AVATAR]).map((u, idx) => ({ url: u, caption: `${targetName} · Photo ${idx + 1}` }));
        setLightbox({
            title: `Detail Inspection: Report #${a.report_id} vs ${targetName}`,
            compare: {
                left: {
                    title: `Report #${a.report_id}`,
                    badge: 'Reported Sighting',
                    items: leftList,
                    initialIndex: leftIdx,
                },
                right: {
                    title: targetName,
                    badge: target.kind === 'pet' ? 'Registered Pet' : 'Candidate',
                    items: rightList,
                    initialIndex: rightIdx,
                },
            },
            initialMode: mode,
        });
    };

    const photoGrid = (photos: string[], alt: string, isLeft: boolean) => {
        const list = photos.length ? photos.slice(0, 6) : [DEFAULT_PET_AVATAR];
        return (
            <div className="grid grid-cols-3 gap-1.5">
                {list.map((src, i) => (
                    <button
                        key={src + i}
                        type="button"
                        onClick={() => openCompare(isLeft ? i : 0, isLeft ? 0 : i)}
                        className={`group relative overflow-hidden rounded-xl border border-slate-100 bg-[#FFF8EE] text-left transition hover:ring-2 hover:ring-orange-400 cursor-pointer ${i === 0 ? 'col-span-3 h-48' : 'h-16'}`}
                        title="Click to inspect photo with side-by-side zoom"
                    >
                        <img src={src} alt={`${alt} photo ${i + 1}`} className="h-full w-full object-cover" />
                        <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white opacity-85 backdrop-blur-xs transition group-hover:opacity-100">
                            <ZoomIn className="w-3 h-3" /> Zoom
                        </span>
                    </button>
                ))}
            </div>
        );
    };

    const messagesBase = '/subd/messages';
    const claimsBase = '/subd/pet-claims';
    const chatPath = isPet
        ? `${messagesBase}?reportId=${a.report_id}${confirmedGuidance?.matchId ? `&matchId=${confirmedGuidance.matchId}&mode=match` : ''}`
        : `${messagesBase}?reportId=${a.report_id}`;

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving && !lightbox) onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, saving, lightbox]);

    const canSave = decision && notes.trim().length >= 5;
    const save = async () => {
        if (!decision) return;
        setSaving(true);
        setError(null);
        try {
            const body = target.kind === 'pet'
                ? { report_a_id: a.report_id, pet_id: target.pet.pet_id, decision, notes: notes.trim() }
                : { report_a_id: a.report_id, report_b_id: target.report.report_id, decision, notes: notes.trim(),
                    link_case: decision === 'CONFIRMED_MATCH' && linkCase };
            const res = await api.post('/manual-matching/decisions', body);
            toast.success('Decision saved', res.data?.message);
            onSaved();
            if (decision === 'CONFIRMED_MATCH') {
                setConfirmedGuidance({
                    matchId: res.data?.match_id,
                    linkedCaseId: res.data?.linked_case_id,
                    linkedToPet: res.data?.linked_to_pet,
                });
            } else {
                onClose();
            }
        } catch (e) {
            const msg = errorText(e, 'The decision could not be saved.');
            setError(msg);
            toast.error('Decision not saved', msg);
            setConfirming(false);
        } finally {
            setSaving(false);
        }
    };

    const left = reportRows(a);
    const right = target.kind === 'pet' ? petRows(target.pet) : reportRows(target.report);

    // If decision was saved as CONFIRMED_MATCH, show Next Step Guidance view
    if (confirmedGuidance) {
        return (
            <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Next steps after confirmed match">
                <div className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
                    <div className="border-b border-emerald-100 bg-emerald-50/80 px-6 py-5 text-center sm:text-left flex items-start gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-lg shadow-emerald-600/20">
                            <CheckCircle2 className="w-7 h-7" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-200/70 text-emerald-800 mb-1">
                                Decision Recorded
                            </span>
                            <h2 className="text-lg font-black text-slate-900">Match Confirmed Successfully!</h2>
                            <p className="text-xs text-slate-600 mt-0.5 font-medium">
                                {isPet ? (
                                    <>Report #{a.report_id} is now verified and linked to registered pet <strong className="text-slate-900">{target.pet.pet_name}</strong> (Owner: {target.pet.owner?.name || 'Registered Resident'}).</>
                                ) : (
                                    <>Report #{a.report_id} and Report #{target.report.report_id} are confirmed as matching incidents{confirmedGuidance.linkedCaseId ? ` under Case #${confirmedGuidance.linkedCaseId}` : ''}.</>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400">Recommended Next Steps</p>

                        <div className="grid gap-3">
                            <Link
                                to={chatPath}
                                onClick={onClose}
                                className="group flex items-center justify-between p-4 rounded-2xl border border-orange-200 bg-orange-50/50 hover:bg-orange-50 hover:border-orange-300 transition-all shadow-xs"
                            >
                                <div className="flex items-center gap-3.5 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                                        <MessageSquare className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-slate-900 group-hover:text-orange-600 transition-colors flex items-center gap-1.5">
                                            Open Direct Chat with {isPet ? 'Pet Owner' : 'Reporter'}
                                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-orange-200 text-orange-800 uppercase tracking-wide">Fastest</span>
                                        </p>
                                        <p className="text-[11px] text-slate-500 truncate">
                                            {isPet ? `Coordinate reunion, schedule pickup, or send photos to ${target.pet.owner?.name || 'owner'}.` : 'Message reporter with updates on this sighting.'}
                                        </p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-orange-500 shrink-0 group-hover:translate-x-1 transition-transform ml-2" />
                            </Link>

                            <Link
                                to={claimsBase}
                                onClick={onClose}
                                className="group flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs"
                            >
                                <div className="flex items-center gap-3.5 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                                        <Shield className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-slate-900 group-hover:text-slate-800 transition-colors">
                                            View Pet Claims & Handover
                                        </p>
                                        <p className="text-[11px] text-slate-500 truncate">
                                            Track ownership claims, verify claimant ID proofs, or complete community handover.
                                        </p>
                                    </div>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 group-hover:translate-x-1 transition-transform ml-2" />
                            </Link>

                            <Link
                                to={reportPath(a.report_id)}
                                onClick={onClose}
                                className="group flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-xs"
                            >
                                <div className="flex items-center gap-3.5 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                                        <FileText className="w-5 h-5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-black text-slate-900">
                                            Open Report #{a.report_id}
                                        </p>
                                        <p className="text-[11px] text-slate-500 truncate">
                                            Inspect updated status history, linked pet details, and audit records.
                                        </p>
                                    </div>
                                </div>
                                <ExternalLink className="w-4 h-4 text-slate-400 shrink-0 group-hover:translate-x-1 transition-transform ml-2" />
                            </Link>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 bg-[#FCFBF8] px-6 py-4 flex items-center justify-end">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                        >
                            Done & Return to Workspace
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Compare records">
            <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-[#FAFAF9] sm:rounded-3xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
                    <div>
                        <h2 className="text-base font-black text-slate-900">Compare Report #{a.report_id} and {targetName}</h2>
                        <p className="text-[11px] font-semibold text-slate-500">
                            {distanceKm !== null && distanceKm !== undefined ? `${distanceKm} km apart · ` : ''}
                            {pairStatus ? `Current decision: ${STATUS_LABEL[pairStatus] || pairStatus}` : 'No decision recorded yet'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label="Close comparison">✕ Close</button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    <div className="grid grid-cols-2 gap-3 sm:gap-5">
                        <div className="min-w-0 space-y-2">
                            <div className="flex items-center gap-2">
                                <Link to={reportPath(a.report_id)} className="text-sm font-black text-slate-900 hover:text-orange-600 hover:underline">Report #{a.report_id}</Link>
                                <TypePill type={a.report_type} />
                            </div>
                            {photoGrid(reportPhotos(a), `Report #${a.report_id}`, true)}
                        </div>
                        <div className="min-w-0 space-y-2">
                            {target.kind === 'pet' ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-slate-900">{target.pet.pet_name}</span>
                                    <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-violet-700">Registered pet</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Link to={reportPath(target.report.report_id)} className="text-sm font-black text-slate-900 hover:text-orange-600 hover:underline">Report #{target.report.report_id}</Link>
                                    <TypePill type={target.report.report_type} />
                                </div>
                            )}
                            {photoGrid(targetPhotos, targetName, false)}
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-4 mb-1">
                        <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Attribute Comparison</span>
                        <button
                            type="button"
                            onClick={() => openCompare(0, 0, 'split')}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-xl border border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100 text-xs font-black transition cursor-pointer shadow-2xs"
                        >
                            <ZoomIn className="w-3.5 h-3.5 text-orange-600" /> Side-by-Side Dual-Zoom Inspection
                        </button>
                    </div>

                    <table className="w-full table-fixed overflow-hidden rounded-2xl border border-slate-200 bg-white text-xs">
                        <tbody>
                            {ROWS.map((label) => (
                                <tr key={label} className="border-b border-slate-100 last:border-0 align-top">
                                    <th scope="row" className="w-24 bg-[#FCFBF8] px-2 py-1.5 text-left text-[10px] font-black uppercase tracking-wide text-slate-500 sm:w-32">{label}</th>
                                    <td className="break-words px-2 py-1.5 font-semibold text-slate-700">{left[label]}</td>
                                    <td className="break-words border-l border-slate-100 px-2 py-1.5 font-semibold text-slate-700">{right[label]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <p className="mt-2 text-[11px] font-semibold text-slate-500">
                        Similar breed, color or location alone does not make them the same animal. Check the photos and distinguishing features with zoom.
                    </p>

                    {/* Look-Alike Registered Pet Detected Banner */}
                    {isPet && pet && (
                        <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white border border-blue-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs mt-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0 sm:min-w-[280px]">
                                <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center text-lg font-black shadow-md shadow-blue-500/20 shrink-0">
                                    💬
                                </div>
                                <div className="space-y-0.5">
                                    <h4 className="text-xs font-black text-blue-950 uppercase tracking-wide flex items-center gap-2">
                                        <span>Staff-Identified Potential Match</span>
                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[10px] font-extrabold lowercase">
                                            message owner
                                        </span>
                                    </h4>
                                    <p className="text-xs text-gray-600 font-medium leading-relaxed">
                                        Staff identified this possible match with registered pet '{pet.pet_name}' owned by {ownerName}. Message the registered pet owner directly so they can review and verify whether the animal is theirs.
                                    </p>
                                </div>
                            </div>
                            {pet.owner ? (
                                <button
                                    type="button"
                                    onClick={() => setIsChatOpen(true)}
                                    className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer text-center"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    Message Owner ({ownerName})
                                </button>
                            ) : (
                                <div className="text-[11px] text-slate-500 font-semibold bg-slate-100 px-3 py-2 rounded-xl">
                                    Community animal (no registered owner)
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="space-y-3 border-t border-slate-200 bg-white p-4">
                    {isPet && pet && (
                        <div className="space-y-3">
                            {/* Two-Way Confirmation Status Bar */}
                            <div className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                                <span className="font-semibold">Two-Way Confirmation:</span>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`px-2.5 py-0.5 rounded-full border font-semibold ${
                                        isStaffConfirmed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-100 border-gray-200 text-gray-600'
                                    }`}>
                                        {isStaffConfirmed ? '✓ Staff Confirmed' : '• Staff Pending'}
                                    </span>
                                    {isCommunityAnimal ? (
                                        <span className="px-2.5 py-0.5 rounded-full border bg-gray-100 border-gray-200 text-gray-600 font-semibold">
                                            No owner — staff confirmation only
                                        </span>
                                    ) : (
                                        getOwnerFeedbackBadge(ownerStatus)
                                    )}
                                    {isStaffConfirmed && (isCommunityAnimal || isOwnerConfirmed) && (
                                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-bold">
                                            Linked to Pet Record
                                        </span>
                                    )}
                                </div>
                            </div>

                            <PetConfirmationPanel report={a} pet={pet} onChanged={onSaved} />
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <div className="text-xs text-gray-500 font-medium">
                            <strong className="text-gray-800">{isPet ? 'Final Verification Rule:' : 'Duplicate Action:'}</strong>{' '}
                            {isPet
                                ? 'A pet match is linked to the pet record only after both staff and the pet owner confirm it.'
                                : 'If these show the same animal, the reports join one case. The report filed first stays the main case, and every report keeps its own photos and history.'}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Not a Match Button */}
                            {pairStatus === 'NOT_A_MATCH' ? (
                                <button disabled className="px-4 py-2.5 rounded-xl border border-red-900 bg-red-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-not-allowed opacity-80">
                                    <span>✕</span> Marked Not a Match
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    disabled={pairStatus === 'CONFIRMED_MATCH'}
                                    onClick={() => { setDecision('NOT_A_MATCH'); setConfirming(false); setLinkCase(false); }}
                                    className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                                        pairStatus === 'CONFIRMED_MATCH'
                                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                            : decision === 'NOT_A_MATCH'
                                            ? 'border-red-400 bg-red-100 text-red-800 ring-2 ring-red-300'
                                            : 'border-red-200 bg-red-50 hover:bg-red-100 text-red-700 cursor-pointer'
                                    }`}
                                >
                                    <span>✕</span> {isPet ? 'Not a Match' : 'Separate / Different'}
                                </button>
                            )}

                            {/* Needs Further Verification (for pets) */}
                            {isPet && (
                                <button
                                    type="button"
                                    disabled={pairStatus === 'CONFIRMED_MATCH' || pairStatus === 'NOT_A_MATCH'}
                                    onClick={() => { setDecision('UNABLE_TO_VERIFY'); setConfirming(false); setLinkCase(false); }}
                                    className={`px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-2xs ${
                                        pairStatus === 'CONFIRMED_MATCH' || pairStatus === 'NOT_A_MATCH'
                                            ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-50'
                                            : decision === 'UNABLE_TO_VERIFY'
                                            ? 'border-amber-400 bg-amber-100 text-amber-800 ring-2 ring-amber-300'
                                            : 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 cursor-pointer'
                                    }`}
                                >
                                    <span>?</span> Needs Further Verification
                                </button>
                            )}

                            {/* Confirm Match Button */}
                            {pairStatus === 'CONFIRMED_MATCH' ? (
                                <button disabled className="px-5 py-2.5 rounded-xl border border-emerald-900 bg-emerald-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-not-allowed opacity-80">
                                    <span>✓</span> Match Confirmed
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    disabled={pairStatus === 'NOT_A_MATCH' || (isPet && isOwnerRejected) || (isPet && !isCommunityAnimal && !isOwnerConfirmed)}
                                    title={
                                        isPet && isOwnerRejected
                                            ? 'Cannot confirm match because the owner reported this is not their pet'
                                            : isPet && !isCommunityAnimal && !isOwnerConfirmed
                                            ? 'Final verification unlocks after the owner confirms this is their pet'
                                            : undefined
                                    }
                                    onClick={() => {
                                        if (!isPet || isCommunityAnimal || isOwnerConfirmed) {
                                            setDecision('CONFIRMED_MATCH');
                                            setConfirming(false);
                                        }
                                    }}
                                    className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                                        pairStatus === 'NOT_A_MATCH' || (isPet && isOwnerRejected) || (isPet && !isCommunityAnimal && !isOwnerConfirmed)
                                            ? 'border border-gray-300 bg-gray-200 text-gray-400 cursor-not-allowed opacity-50'
                                            : decision === 'CONFIRMED_MATCH'
                                            ? 'bg-emerald-700 text-white ring-2 ring-emerald-400'
                                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20 cursor-pointer'
                                    }`}
                                >
                                    <span>✓</span> {isPet ? 'Confirm Match' : 'Matched: Same Animal'}
                                </button>
                            )}
                        </div>
                    </div>

                    {decision && (
                        <div className="space-y-2 pt-2 border-t border-slate-100">
                            {/* Decision Explanation Notice */}
                            <div className={`p-3 rounded-xl border text-xs font-medium leading-relaxed ${
                                decision === 'CONFIRMED_MATCH'
                                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                                    : decision === 'NOT_A_MATCH'
                                    ? 'bg-red-50/80 border-red-200 text-red-900'
                                    : 'bg-amber-50/80 border-amber-200 text-amber-900'
                            }`}>
                                {decision === 'CONFIRMED_MATCH' ? (
                                    isPet ? (
                                        <span>
                                            <strong>Confirmation Notice:</strong> Report #{a.report_id} will be verified and linked to <strong>{targetName}</strong>'s pet record.
                                        </span>
                                    ) : (
                                        <span>
                                            <strong>Duplicate Confirmation Notice:</strong> Report #{a.report_id} and Report #{target.report.report_id} will be linked as the same animal incident.
                                        </span>
                                    )
                                ) : decision === 'NOT_A_MATCH' ? (
                                    <span>
                                        <strong>Rejection Notice:</strong> Report #{a.report_id} will be marked as not matching <strong>{targetName}</strong>.
                                    </span>
                                ) : (
                                    <span>
                                        <strong>Further Verification Notice:</strong> Mark this pair as requiring further observation, photos, or resident review before a final conclusion.
                                    </span>
                                )}
                            </div>

                            <textarea
                                value={notes}
                                onChange={(e) => { setNotes(e.target.value); setConfirming(false); }}
                                rows={2}
                                maxLength={2000}
                                placeholder="Explain the decision: what you compared and what you found (required, at least 5 characters)"
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
                                aria-label="Decision notes"
                            />

                            {decision === 'CONFIRMED_MATCH' && !isPet && (
                                <label className="flex items-start gap-2 text-[11px] font-semibold text-slate-600">
                                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-orange-500" checked={linkCase} onChange={(e) => { setLinkCase(e.target.checked); setConfirming(false); }} />
                                    <span>Also link both reports into one case. The later report becomes "Merged — Duplicate" under the earlier one (reversible with Unmerge). Leave unticked to only record the match.</span>
                                </label>
                            )}

                            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" role="alert">{error}</p>}

                            {!confirming ? (
                                <button type="button" disabled={!canSave} onClick={() => setConfirming(true)}
                                    className="h-10 w-full rounded-xl bg-orange-500 text-xs font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">
                                    Review and save decision
                                </button>
                            ) : (
                                <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                                    <p className="text-xs font-bold text-orange-900">
                                        Record "{STATUS_LABEL[decision]}" for Report #{a.report_id} and {targetName}
                                        {decision === 'CONFIRMED_MATCH' && linkCase && !isPet ? ' and link them into one case' : ''}? This is saved under your name.
                                    </p>
                                    <div className="mt-2 flex gap-2">
                                        <button type="button" onClick={save} disabled={saving} className="h-9 flex-1 rounded-xl bg-orange-500 text-xs font-black text-white hover:bg-orange-600 disabled:opacity-50 cursor-pointer">
                                            {saving ? 'Saving…' : 'Yes, save decision'}
                                        </button>
                                        <button type="button" onClick={() => setConfirming(false)} disabled={saving} className="h-9 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 cursor-pointer">Back</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {lightbox && (
                <MediaLightbox
                    items={lightbox.items}
                    startIndex={lightbox.startIndex}
                    title={lightbox.title}
                    compare={lightbox.compare}
                    initialMode={lightbox.initialMode}
                    onClose={() => setLightbox(null)}
                />
            )}

            {isPet && pet && (
                <ReportChatDrawer
                    isOpen={isChatOpen}
                    onClose={() => setIsChatOpen(false)}
                    report={{
                        report_id: a.report_id,
                        user_id: a.reporter?.user_id,
                        reporter_name: a.reporter?.name,
                        animal_type: a.animal_type || 'Dog',
                        landmark: a.landmark || 'Subdivision Area',
                        created_at: a.created_at || undefined,
                        photo_url: a.photo_url || a.photos?.[0],
                        media: (a.photos && a.photos.length ? a.photos : a.photo_url ? [a.photo_url] : []).map(url => ({ file_url: url })),
                        description: a.description || undefined,
                    }}
                    currentUser={currentUser ? {
                        ...currentUser,
                        name: currentUser.name || 'Staff User',
                        role_id: currentUser.role_id || 2,
                    } : null}
                    matchId={pet.pair?.match_id}
                    threadMode="match"
                    customCounterpartName={ownerName}
                    customCounterpartRole="Pet Owner"
                    initialMessageSnippet={`Hello, ${ownerName}! A STRAYSAFE staff member identified a possible match between your registered pet and Report #${a.report_id}. Please review the animal information and confirm whether the reported animal is yours.`}
                    matchedPet={{
                        pet_id: pet.pet_id,
                        pet_name: pet.pet_name,
                        photo_url: pet.photo_url || pet.photos?.[0],
                        species: pet.animal_type || "Dog",
                        breed: pet.breed || "Registered Breed",
                        color: pet.color || "Registered Color",
                        size: pet.size || "Medium",
                        owner_name: ownerName,
                        registered_address: pet.registered_address || (ownerName ? `Registered by ${ownerName}` : 'Registered Pet'),
                        similarity_score: 0,
                        is_manual: true,
                        sighting_photo_url: a.photo_url || a.photos?.[0],
                        sighting_species: a.animal_type || "Dog",
                        sighting_breed: a.breed || "Reported Breed",
                        sighting_color: a.color || "Reported Color",
                        sighting_size: a.size || "Medium",
                        sighting_landmark: a.landmark || "Subdivision Area",
                        sighting_description: a.description || undefined,
                        key_evidence_bullets: pet.shared_details || [],
                    }}
                />
            )}
        </div>
    );
};

// ─── History ────────────────────────────────────────────────────────────────
const HistoryTable = ({ rows, loading, filter, onFilter, reportPath }: {
    rows: HistoryRow[];
    loading: boolean;
    filter: string;
    onFilter: (v: string) => void;
    reportPath: (id: number) => string;
}) => (
    <div className="rounded-2xl border border-slate-200/80 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3">
            <p className="text-sm font-black text-slate-800">Matching history</p>
            <select className={`${inputCls} w-auto`} value={filter} onChange={(e) => onFilter(e.target.value)} aria-label="Filter history by decision">
                <option value="">All decisions</option>
                <option value="CONFIRMED_MATCH">Confirmed</option>
                <option value="NOT_A_MATCH">Rejected</option>
                <option value="UNABLE_TO_VERIFY">Needs further verification</option>
            </select>
        </div>
        {loading ? (
            <p className="p-6 text-center text-xs font-semibold text-slate-400">Loading history…</p>
        ) : rows.length === 0 ? (
            <p className="p-6 text-center text-xs font-semibold text-slate-400">No manual decisions recorded yet.</p>
        ) : (
            <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-xs">
                    <thead className="bg-[#FCFBF8] text-left text-[10px] font-black uppercase tracking-wide text-slate-500">
                        <tr>
                            <th className="px-3 py-2">When</th><th className="px-3 py-2">Pair</th><th className="px-3 py-2">Decision</th>
                            <th className="px-3 py-2">Staff</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((h) => (
                            <tr key={h.decision_id} className="border-t border-slate-100 align-top">
                                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-500">{fmtDate(h.created_at)}</td>
                                <td className="whitespace-nowrap px-3 py-2 font-black text-slate-800">
                                    <Link className="hover:text-orange-600 hover:underline" to={reportPath(h.report_a_id)}>#{h.report_a_id}</Link>
                                    {' ↔ '}
                                    {h.report_b_id
                                        ? <Link className="hover:text-orange-600 hover:underline" to={reportPath(h.report_b_id)}>#{h.report_b_id}</Link>
                                        : <span className="text-violet-700">🐾 {h.pet_name || `Pet #${h.pet_id}`}</span>}
                                </td>
                                <td className="px-3 py-2">
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${DECISION_STYLE[h.decision]}`}>{h.decision_label}</span>
                                    {h.previous_status && <p className="mt-1 text-[10px] font-semibold text-slate-400">was {STATUS_LABEL[h.previous_status] || h.previous_status}</p>}
                                    {h.linked_case_id && <p className="mt-1 text-[10px] font-bold text-slate-500">Linked into Case #{h.linked_case_id}</p>}
                                </td>
                                <td className="px-3 py-2 font-semibold text-slate-600">{h.staff_name || '—'}<p className="text-[10px] text-slate-400">{h.staff_role}</p></td>
                                <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-500">Manual Match</td>
                                <td className="max-w-xs px-3 py-2 font-semibold text-slate-600">{h.notes}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);

// ─── Workspace ──────────────────────────────────────────────────────────────
// The server enforces the subdivision search boundary (backend/app/utils/matching_scope.py).
const ManualMatchingWorkspace = ({ reportPath }: { reportPath: (id: number) => string }) => {
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const [tab, setTab] = useState<'find' | 'history'>('find');

    const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
    const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
    const [results, setResults] = useState<ReportCard[]>([]);
    const [searching, setSearching] = useState(true);
    const [searchError, setSearchError] = useState<string | null>(null);

    const [source, setSource] = useState<ReportCard | null>(null);
    const [candFilters, setCandFilters] = useState<FilterState>(EMPTY_FILTERS);
    const [candidates, setCandidates] = useState<ReportCard[]>([]);
    const [loadingCands, setLoadingCands] = useState(false);
    const [candError, setCandError] = useState<string | null>(null);
    const [candKind, setCandKind] = useState<'report' | 'pet'>('report');
    const [petFilters, setPetFilters] = useState<FilterState>(EMPTY_FILTERS);
    const [petCandidates, setPetCandidates] = useState<PetCard[]>([]);
    const [petBlocked, setPetBlocked] = useState<string | null>(null);
    const [compare, setCompare] = useState<{ a: ReportCard; target: Target; distance: number | null | undefined; pair: string | null } | null>(null);
    const [cardLightbox, setCardLightbox] = useState<{ url: string; title: string } | null>(null);

    const [history, setHistory] = useState<HistoryRow[]>([]);
    const [historyFilter, setHistoryFilter] = useState('');
    const [loadingHistory, setLoadingHistory] = useState(false);



    const search = useCallback(async (f: FilterState = filters) => {
        if (f.radius_km && !center) {
            setSearchError('Set a center with "Use my location" to search by radius, or open a report to search around it.');
            return;
        }
        setSearching(true);
        setSearchError(null);
        try {
            const r = await api.get('/manual-matching/reports', { params: toParams(f, center) });
            setResults(r.data.results || []);
        } catch (e) {
            setSearchError(errorText(e, 'Could not load reports.'));
        } finally {
            setSearching(false);
        }
    }, [filters, center]);

    useEffect(() => {
        let cancelled = false;
        api.get('/manual-matching/reports')
            .then((r) => { if (!cancelled) setResults(r.data.results || []); })
            .catch((e) => { if (!cancelled) setSearchError(errorText(e, 'Could not load reports.')); })
            .finally(() => { if (!cancelled) setSearching(false); });
        return () => { cancelled = true; };
    }, []);

    const loadCandidates = useCallback(async (src: ReportCard, f: FilterState) => {
        setLoadingCands(true);
        setCandError(null);
        try {
            const r = await api.get(`/manual-matching/reports/${src.report_id}/candidates`, { params: toParams(f) });
            setSource(r.data.source);
            setCandidates(r.data.results || []);
        } catch (e) {
            setCandError(errorText(e, 'Could not load possible matches.'));
        } finally {
            setLoadingCands(false);
        }
    }, []);

    const loadPetCandidates = useCallback(async (src: ReportCard, f: FilterState) => {
        setLoadingCands(true);
        setCandError(null);
        try {
            const r = await api.get(`/manual-matching/reports/${src.report_id}/pet-candidates`, { params: toParams(f) });
            setSource(r.data.source);
            setPetCandidates(r.data.results || []);
            setPetBlocked(r.data.blocked_reason || null);
        } catch (e) {
            setCandError(errorText(e, 'Could not load registered pets.'));
        } finally {
            setLoadingCands(false);
        }
    }, []);

    const loadHistory = useCallback(async (decision: string = historyFilter) => {
        setLoadingHistory(true);
        try {
            const r = await api.get('/manual-matching/history', { params: decision ? { decision } : {} });
            setHistory(r.data.results || []);
        } catch (e) {
            toast.error('Could not load matching history', errorText(e, ''));
        } finally {
            setLoadingHistory(false);
        }
    }, [historyFilter, toast]);

    const openSource = useCallback((r: ReportCard, kind: 'report' | 'pet' = 'report') => {
        // Defaults: the other report type, same animal, within 3 km. Pets: same animal from any area. Staff can widen these.
        const animal = r.animal_type === 'Dog' || r.animal_type === 'Cat' ? r.animal_type : '';
        const f: FilterState = { ...EMPTY_FILTERS, report_type: r.report_type === 'Lost Pet' ? 'stray' : '', animal_type: animal, radius_km: '3' };
        const pf: FilterState = { ...EMPTY_FILTERS, animal_type: animal };
        setSource(r);
        setCandidates([]);
        setPetCandidates([]);
        setPetBlocked(null);
        setCandFilters(f);
        setPetFilters(pf);
        setCandKind(kind);
        if (kind === 'pet') loadPetCandidates(r, pf); else loadCandidates(r, f);
    }, [loadCandidates, loadPetCandidates]);

    // Opened from a report page (?report=ID): start with that report's possible matches
    const startReport = searchParams.get('report');
    useEffect(() => {
        const id = Number(startReport);
        if (!startReport || !Number.isInteger(id) || id <= 0) return;
        let cancelled = false;
        api.get(`/manual-matching/reports/${id}`)
            .then((r) => { if (!cancelled) openSource(r.data, searchParams.get('kind') === 'pet' ? 'pet' : 'report'); })
            .catch((e) => { if (!cancelled) toast.error('Could not open that report', errorText(e, '')); });
        return () => { cancelled = true; };
    }, [startReport]); // eslint-disable-line react-hooks/exhaustive-deps

    const closeSource = () => {
        setSource(null);
        setCandidates([]);
        setPetCandidates([]);
        if (searchParams.get('report')) setSearchParams({}, { replace: true });
    };

    const switchKind = (kind: 'report' | 'pet') => {
        if (!source || kind === candKind) return;
        setCandKind(kind);
        if (kind === 'pet') loadPetCandidates(source, petFilters); else loadCandidates(source, candFilters);
    };

    const useMyLocation = () => {
        if (!navigator.geolocation) { toast.error('Location is not available on this device'); return; }
        navigator.geolocation.getCurrentPosition(
            (p) => { setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); toast.success('Search center set to your location'); },
            (err) => toast.error('Could not get your location', err.message),
            { enableHighAccuracy: true, timeout: 10000 },
        );
    };

    const [activeMatch, setActiveMatch] = useState<any | null>(null);
    const [loadingMatch, setLoadingMatch] = useState(false);

    const openCompare = async (cand: ReportCard) => {
        if (!source) return;
        setLoadingMatch(true);
        try {
            const res = await api.post('/manual-matching/match-pair', {
                report_id: source.report_id,
                matched_report_id: cand.report_id,
            });
            setActiveMatch(res.data);
        } catch {
            // Fallback to legacy report compare panel if needed
            try {
                const r = await api.get(`/manual-matching/reports/${cand.report_id}`);
                setCompare({ a: source, target: { kind: 'report', report: r.data }, distance: cand.distance_km, pair: cand.pair?.status || null });
            } catch (e) {
                toast.error('Could not open the report comparison', errorText(e, ''));
            }
        } finally {
            setLoadingMatch(false);
        }
    };

    const openPetCompare = async (cand: PetCard) => {
        if (!source) return;
        setLoadingMatch(true);
        try {
            const res = await api.post('/manual-matching/match-pair', {
                report_id: source.report_id,
                pet_id: cand.pet_id,
            });
            setActiveMatch(res.data);
        } catch (e) {
            toast.error('Could not open the potential match review', errorText(e, ''));
        } finally {
            setLoadingMatch(false);
        }
    };

    const afterDecision = () => {
        setCompare(null);
        setActiveMatch(null);
        if (source) {
            if (candKind === 'pet') loadPetCandidates(source, petFilters); else loadCandidates(source, candFilters);
        }
        search();
        loadHistory();
    };

    const tabBtn = (id: 'find' | 'history', label: string) => (
        <button type="button" onClick={() => { setTab(id); if (id === 'history') loadHistory(); }} aria-pressed={tab === id}
            className={`h-9 rounded-xl px-4 text-xs font-black transition ${tab === id ? 'bg-orange-500 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>{label}</button>
    );

    return (
        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-3 sm:gap-4">
            <div className="md:hidden">
                <h1 className="text-lg font-black leading-tight tracking-tight text-gray-900">Manual Matching</h1>
                <p className="text-xs font-semibold text-gray-500">Search, compare and verify possible report matches.</p>
            </div>
            <ManualMatchingNotice />
            <div className="flex gap-2">{tabBtn('find', 'Find Matches')}{tabBtn('history', 'Matching History')}</div>

            {tab === 'history' ? (
                <HistoryTable rows={history} loading={loadingHistory} filter={historyFilter} onFilter={(v) => { setHistoryFilter(v); loadHistory(v); }} reportPath={reportPath} />
            ) : source ? (
                <>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={closeSource} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">← Back to all reports</button>
                        <p className="text-sm font-black text-slate-800">Possible matches for Report #{source.report_id}</p>
                    </div>
                    <ResultCard r={source} onPhotoClick={(url, title) => setCardLightbox({ url, title })} actions={<Link to={reportPath(source.report_id)} className="text-xs font-bold text-orange-600 hover:underline">Open full report</Link>} />
                    <div className="flex gap-2" role="group" aria-label="Compare with">
                        {(['report', 'pet'] as const).map((k) => (
                            <button key={k} type="button" onClick={() => switchKind(k)} aria-pressed={candKind === k}
                                className={`h-9 rounded-xl px-4 text-xs font-black transition ${candKind === k ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                                {k === 'report' ? 'Other reports' : 'Registered pets'}
                            </button>
                        ))}
                    </div>
                    {candKind === 'report' ? (
                        <FilterToolbar
                            value={candFilters}
                            onChange={setCandFilters}
                            onSubmit={() => loadCandidates(source, candFilters)}
                            onReset={() => { setCandFilters(EMPTY_FILTERS); loadCandidates(source, EMPTY_FILTERS); }}
                            radiusHint={`from Report #${source.report_id}`}
                        />
                    ) : (
                        <>
                        <FilterToolbar
                            mode="pet"
                            value={petFilters}
                            onChange={setPetFilters}
                            onSubmit={() => loadPetCandidates(source, petFilters)}
                            onReset={() => { setPetFilters(EMPTY_FILTERS); loadPetCandidates(source, EMPTY_FILTERS); }}
                            radiusHint={`from Report #${source.report_id}`}
                        />
                        </>
                    )}
                    {candError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" role="alert">{candError}</p>}
                    {loadingCands ? (
                        <p className="py-8 text-center text-xs font-semibold text-slate-400">Searching possible matches…</p>
                    ) : candKind === 'pet' ? (
                        petBlocked ? (
                            <p className="rounded-2xl border border-violet-200 bg-violet-50 py-6 text-center text-xs font-bold text-violet-800">{petBlocked}</p>
                        ) : petCandidates.length === 0 ? (
                            <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-xs font-semibold text-slate-500" data-testid="pet-candidates-empty">
                                No eligible registered pets from your subdivision match these filters.
                            </p>
                        ) : (
                            <>
                                <p className="text-[11px] font-semibold text-slate-500">
                                    {petCandidates.length} registered pet{petCandidates.length === 1 ? '' : 's'} (eligible for matching, registered in your subdivision). Not ranked: compare each one before deciding.
                                </p>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {petCandidates.map((p) => (
                                        <PetResultCard key={p.pet_id} p={p} onPhotoClick={(url, title) => setCardLightbox({ url, title })} actions={
                                            <button type="button" onClick={() => openPetCompare(p)} className="h-8 rounded-lg bg-orange-500 px-3 text-xs font-black text-white hover:bg-orange-600 cursor-pointer">
                                                {petActionLabel(p)}
                                            </button>
                                        } />
                                    ))}
                                </div>
                            </>
                        )
                    ) : candidates.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-white py-8 text-center text-xs font-semibold text-slate-400">No reports match these filters. Try a wider radius or fewer filters.</p>
                    ) : (
                        <>
                            <p className="text-[11px] font-semibold text-slate-500">{candidates.length} report{candidates.length === 1 ? '' : 's'}, newest first. Not ranked: compare each one before deciding.</p>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                                <div className="contents">
                                    {candidates.map((c) => (
                                        <ResultCard key={c.report_id} r={c} onPhotoClick={(url, title) => setCardLightbox({ url, title })} actions={
                                            <button type="button" onClick={() => openCompare(c)} className="h-8 rounded-lg bg-orange-500 px-3 text-xs font-black text-white hover:bg-orange-600 cursor-pointer">Compare side by side</button>
                                        } />
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </>
            ) : (
                <>
                    <FilterToolbar
                        value={filters}
                        onChange={setFilters}
                        onSubmit={() => search()}
                        onReset={() => { setFilters(EMPTY_FILTERS); setCenter(null); search(EMPTY_FILTERS); }}
                        radiusHint={center ? 'from your location' : 'set a center first'}
                        extra={
                            <button type="button" onClick={useMyLocation} className="h-9 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-bold text-orange-700 hover:bg-orange-100 cursor-pointer">
                                {center ? '📍 Location set' : '📍 Use my location'}
                            </button>
                        }
                    />
                    {searchError && <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" role="alert">{searchError}</p>}
                    {searching ? (
                        <p className="py-8 text-center text-xs font-semibold text-slate-400">Loading reports…</p>
                    ) : results.length === 0 ? (
                        <p className="rounded-2xl border border-dashed border-slate-200 bg-white py-8 text-center text-xs font-semibold text-slate-400">No reports found in your area for these filters.</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {results.map((r) => (
                                <ResultCard key={r.report_id} r={r} onPhotoClick={(url, title) => setCardLightbox({ url, title })} actions={
                                    <>
                                        <button type="button" onClick={() => openSource(r)} className="h-8 rounded-lg bg-orange-500 px-3 text-xs font-black text-white hover:bg-orange-600 cursor-pointer">Find possible matches</button>
                                        <button type="button" onClick={() => openSource(r, 'pet')} className="h-8 rounded-lg border border-violet-200 bg-violet-50 px-3 text-xs font-bold text-violet-700 hover:bg-violet-100 cursor-pointer">Check registered pets</button>
                                        <Link to={reportPath(r.report_id)} className="flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">Open report</Link>
                                    </>
                                } />
                            ))}
                        </div>
                    )}
                </>
            )}

            {loadingMatch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-lg border border-slate-200">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                        <span className="text-xs font-bold text-slate-700">Opening Potential Match Review...</span>
                    </div>
                </div>
            )}

            {activeMatch && (
                <AIMatchReviewModal
                    isOpen={Boolean(activeMatch)}
                    match={activeMatch}
                    onClose={() => setActiveMatch(null)}
                    onVerified={() => {
                        setActiveMatch(null);
                        afterDecision();
                    }}
                    isStaff={true}
                    isManual={true}
                />
            )}

            {compare && (
                <ComparePanel
                    a={compare.a}
                    target={compare.target}
                    distanceKm={compare.distance}
                    pairStatus={compare.pair}
                    reportPath={reportPath}
                    onClose={() => setCompare(null)}
                    onSaved={afterDecision}
                />
            )}

            {cardLightbox && (
                <MediaLightbox
                    items={[{ url: cardLightbox.url, caption: cardLightbox.title }]}
                    title={cardLightbox.title}
                    onClose={() => setCardLightbox(null)}
                />
            )}
        </div>
    );
};

export default ManualMatchingWorkspace;
