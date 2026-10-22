import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';
import { getReportStatusLabel, getReportStatusBadgeStyle } from '../../utils/reportStatus';
import { SIGHTING_TITLE, sightingDateTime, sightingLandmark } from '../../utils/sighting';

// Report pins on phones: a tapped pin opens a small preview at the bottom of the map, just above the map credit line
// (photo, number, priority,
// status, place). Tapping it or swiping up opens a bottom sheet with the details and actions; swiping down closes
// it again. Larger screens keep MapComponent's side card.

export const PHONE_QUERY = '(max-width: 639px)';
export const useIsPhone = () => {
    const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PHONE_QUERY).matches);
    useEffect(() => {
        const mq = window.matchMedia?.(PHONE_QUERY);
        if (!mq) return;
        const update = () => setPhone(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);
    return phone;
};

const CLOSED_STATUS_IDS = [9, 10, 11, 12, 14, 17, 18];
const CLOSED_CUSTODY = ['Adopted', 'Impounded', 'Claimed', 'Claimed by Owner', 'Released', 'Deceased', 'Resolved', 'Dismissed'];
const CUSTODY_LABELS: Record<string, string> = {
    Sighting: 'Stray sighting (not handled)',
    Secured: 'Secured in a safe place by the reporter',
};
const isFacilityWord = (val?: string | null) => {
    if (!val) return false;
    const l = val.toLowerCase();
    return l.includes('holding pen') || l.includes('holding facility') || l.includes('barangay holding');
};
const known = (v: any) => (typeof v === 'string' && v.trim() && v.trim().toLowerCase() !== 'unknown' ? v.trim() : null);

/** Everything the report card shows about a pin, worked out once (phone preview, phone sheet and the side card). */
export function describeReportMarker(m: any) {
    const raw = m?.rawData || {};
    const statusId = raw.status_id || raw.current_status_id;
    // Same priority the lists show: "Low Priority" / "low" / "High" -> Low / Medium / High
    const rawPriority = String(m?.priority || raw.priority_level || 'Medium').toLowerCase();
    const priority = /high|emergency|critical/.test(rawPriority) ? 'High' : /low/.test(rawPriority) ? 'Low' : 'Medium';
    const priorityStyle = priority === 'High' ? 'bg-rose-50 text-rose-600 border border-rose-200'
        : priority === 'Low' ? 'bg-sky-50 text-sky-700 border border-sky-200'
            : 'bg-amber-50 text-amber-600 border border-amber-200';
    const statusLabel = raw.statusName || raw.status_name || raw.status?.status_name || (statusId ? getReportStatusLabel(statusId) : 'Under Review');
    const statusStyle = statusId ? getReportStatusBadgeStyle(statusId) : 'bg-amber-50 text-amber-700 border-amber-200';
    const media = Array.isArray(raw.media) ? raw.media : [];
    const firstMedia = media.length ? (typeof media[0] === 'string' ? media[0] : (media[0]?.file_url || media[0]?.url)) : null;
    const photo = m?.image_url || m?.photo || firstMedia || raw.image_url || raw.sighting_photo || raw.pet?.photo_url || DEFAULT_PET_AVATAR;
    const isClosed = CLOSED_STATUS_IDS.includes(statusId) || CLOSED_CUSTODY.includes(raw.custody_status || '');
    // The animal's reported sighting (not a facility pin): always labelled as the sighting, never the subdivision
    const isFacilityPin = ['Holding Facility', 'Historical Holding'].includes(m?.category) || (!isClosed && Boolean(raw.facility?.name));
    const facilityPlace = (!isClosed && raw.facility?.name)
        || (!isFacilityWord(raw.initial_landmark) && raw.initial_landmark)
        || (!isFacilityWord(raw.landmark) && raw.landmark)
        || raw.location_address
        || (m?.title && !isFacilityWord(m.title) ? m.title : null)
        || 'Incident Sighting Location';
    // The report's category when known (pages that pass only a title use it); shown only when there is one
    const category: string | null = raw.category_name || raw.category
        || (m?.title && !raw.report_id && !isFacilityWord(m.title) ? m.title : null);
    const lat = Number(m?.lat), lng = Number(m?.lng);
    const conditions: string[] = raw.observed_conditions
        ? (Array.isArray(raw.observed_conditions) ? raw.observed_conditions : [raw.observed_conditions]).filter(Boolean)
        : [];
    const animalType = raw.animal_type || (isFacilityPin ? (m?.category || 'Dog') : 'Animal');
    return {
        id: m?.id,
        number: `Report #${String(m?.id ?? '').padStart(4, '0')}`,
        emoji: String(raw.animal_type || m?.category || '').toLowerCase().includes('cat') ? '🐱' : '🐶',
        priority, priorityStyle, statusLabel, statusStyle, photo, photoCount: media.length,
        isClosed, isFacilityPin, facilityPlace, category, heading: category || 'Stray Animal Sighting',
        animalType, breed: known(raw.animal_breed), color: known(raw.animal_color),
        coords: Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : null,
        landmark: sightingLandmark(raw),
        when: sightingDateTime(raw),
        time: m?.time as string | undefined,
        reporter: raw.reporterName || raw.reporter_name || 'Citizen',
        custody: raw.custody_status ? (CUSTODY_LABELS[raw.custody_status] || raw.custody_status) : null,
        conditions,
        isHistory: isClosed || String(m?.category || '').includes('Historical'),
    };
}
export type ReportMarkerInfo = ReturnType<typeof describeReportMarker>;

export interface SheetAction {
    label: string;
    title?: string;
    tone: 'role' | 'dark';
    onClick: () => void;
}

interface ReportMarkerSheetProps {
    info: ReportMarkerInfo;
    /** Street address of the pin (looked up when it is selected), if found */
    address: string | null;
    onClose: () => void;
    /** Opens the full report; left out where the page hides that button */
    onViewFull?: () => void;
    /** Directions buttons the page allows (from me / from the hall) */
    actions: SheetAction[];
}

const SWIPE_PX = 40;

export default function ReportMarkerSheet({ info, address, onClose, onViewFull, actions }: ReportMarkerSheetProps) {
    const [expanded, setExpanded] = useState(false);
    const [dragY, setDragY] = useState(0);
    const previewRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const touch = useRef<{ y: number; moved: boolean; canPull: boolean } | null>(null);

    // Another pin was tapped: start again from the small preview
    useEffect(() => { setExpanded(false); setDragY(0); }, [info.id]);

    // While the sheet is open: the page behind does not scroll, and Escape steps back to the preview
    useEffect(() => {
        if (!expanded) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false); };
        window.addEventListener('keydown', onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
    }, [expanded]);

    const place = info.isFacilityPin ? info.facilityPlace : (address || info.landmark || info.coords || 'Reported location');

    // ----- small preview: tap or swipe up = details, swipe down = close -----
    const previewTouch = {
        onTouchStart: (e: React.TouchEvent) => { touch.current = { y: e.touches[0].clientY, moved: false, canPull: true }; },
        onTouchMove: (e: React.TouchEvent) => {
            if (!touch.current) return;
            const d = e.touches[0].clientY - touch.current.y;
            if (Math.abs(d) > 6) touch.current.moved = true;
            setDragY(d > 0 ? d : d / 3);
        },
        onTouchEnd: () => {
            const d = dragY;
            setDragY(0);
            if (d < -SWIPE_PX / 3) setExpanded(true);
            else if (d > SWIPE_PX) onClose();
        },
    };

    // ----- sheet: swipe down on the handle, or on the content when it is scrolled to the top = back to preview -----
    const sheetTouch = {
        onTouchStart: (e: React.TouchEvent) => {
            const inContent = contentRef.current?.contains(e.target as Node);
            touch.current = { y: e.touches[0].clientY, moved: false, canPull: !inContent || (contentRef.current?.scrollTop ?? 0) <= 0 };
        },
        onTouchMove: (e: React.TouchEvent) => {
            if (!touch.current?.canPull) return;
            const d = e.touches[0].clientY - touch.current.y;
            setDragY(d > 0 ? d : 0);
        },
        onTouchEnd: () => {
            const d = dragY;
            setDragY(0);
            if (d > SWIPE_PX * 2) setExpanded(false);
        },
    };

    const header = (big: boolean) => (
        <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`${big ? 'text-base' : 'text-sm'} font-black text-slate-900 leading-tight truncate`}>{info.number}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold shrink-0 ${info.priorityStyle}`}>{info.priority}</span>
                </div>
                <span className={`mt-1 inline-block max-w-full px-2 py-0.5 rounded-full text-[11px] font-bold border truncate align-top ${info.statusStyle}`}>{info.statusLabel}</span>
            </div>
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                className="w-10 h-10 -mr-1.5 -mt-1.5 rounded-full hover:bg-slate-100 active:bg-slate-200 text-slate-500 flex items-center justify-center text-base font-bold shrink-0 cursor-pointer"
                aria-label="Close"
                title="Close"
            >
                ✕
            </button>
        </div>
    );

    const photo = (className: string) => (
        <img
            src={info.photo}
            alt={`${info.animalType} in ${info.number}`}
            className={className}
            onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
        />
    );

    return (
        <>
            {/* Stage 1: small preview at the bottom of the map */}
            <div
                ref={previewRef}
                data-report-card
                data-report-preview
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-label={`${info.number}: show details`}
                onClick={() => { if (!touch.current?.moved) setExpanded(true); touch.current = null; }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true); } }}
                {...previewTouch}
                style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : 'transform 160ms ease-out', touchAction: 'none' }}
                className="absolute bottom-6 left-2 right-2 z-[1000] max-h-[calc(100%-32px)] overflow-hidden bg-white rounded-2xl shadow-2xl border border-slate-200/90 px-3 pt-1.5 pb-2 cursor-pointer select-none animate-in fade-in slide-in-from-bottom-4 duration-200"
            >
                <div className="mx-auto mb-1.5 h-1 w-9 rounded-full bg-slate-300" aria-hidden="true" />
                <div className="flex items-start gap-3 min-w-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-100 border border-slate-100 shrink-0">
                        {photo('w-full h-full object-cover')}
                    </div>
                    <div className="flex-1 min-w-0">
                        {header(false)}
                    </div>
                </div>
                <p className="mt-1.5 text-xs font-semibold text-slate-600 flex items-center gap-1 min-w-0">
                    <span className="text-rose-500 shrink-0" aria-hidden="true">📍</span>
                    <span className="truncate">{place}</span>
                </p>
                <p className="mt-1 text-[11px] font-bold text-role-hover text-center">Tap or swipe up for details</p>
            </div>

            {/* Stage 2: bottom sheet with the details and actions */}
            {expanded && createPortal(
                <div className="keep-modal-size fixed inset-0 z-[10500] flex flex-col justify-end" role="presentation">
                    <div className="absolute inset-0 bg-black/40 animate-in fade-in duration-150" onClick={() => setExpanded(false)} aria-hidden="true" />
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`${info.number} details`}
                        {...sheetTouch}
                        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, transition: dragY ? 'none' : 'transform 180ms ease-out' }}
                        className="relative w-full max-h-[88dvh] bg-white rounded-t-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-8 duration-200"
                    >
                        <div className="px-4 pt-2 pb-3 border-b border-slate-100 shrink-0" style={{ touchAction: 'none' }}>
                            <button type="button" onClick={() => setExpanded(false)} className="block mx-auto mb-2 h-5 w-16 cursor-pointer" aria-label="Show less">
                                <span className="block mx-auto h-1.5 w-10 rounded-full bg-slate-300" />
                            </button>
                            {header(true)}
                        </div>

                        <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
                            <div className="relative rounded-2xl overflow-hidden bg-slate-100 border border-slate-100">
                                {photo('w-full aspect-[4/3] max-h-[34dvh] object-cover')}
                                {info.photoCount > 1 && (
                                    <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-bold">{info.photoCount} photos</span>
                                )}
                            </div>

                            <div>
                                <h3 className="text-sm font-black text-slate-900">{info.isFacilityPin ? info.heading : SIGHTING_TITLE}</h3>
                                <p className="text-xs font-bold text-slate-600 mt-0.5 break-words">
                                    {info.emoji} {[info.animalType, info.breed, info.color].filter(Boolean).join(' • ')}
                                    {!info.isFacilityPin && info.category && info.category !== SIGHTING_TITLE && <span className="font-semibold text-slate-500"> • {info.category}</span>}
                                </p>
                            </div>

                            <dl className="rounded-2xl border border-slate-100 divide-y divide-slate-100 text-xs">
                                <Row label="Location">
                                    <span className="font-semibold text-slate-800 break-words">{info.isFacilityPin ? info.facilityPlace : (address || 'Street address not found')}</span>
                                    {info.coords && <span className="block text-[11px] text-slate-400 mt-0.5">{info.coords}</span>}
                                </Row>
                                {info.landmark && <Row label="Landmark"><span className="break-words">{info.landmark}</span></Row>}
                                <Row label="Reported">{info.when || info.time || 'Date not recorded'}</Row>
                                {info.custody && <Row label="Custody">{info.custody}</Row>}
                                <Row label="Reported by"><span className="break-words">{info.reporter}</span></Row>
                            </dl>

                            {info.conditions.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {info.conditions.map((c, i) => (
                                        <span key={i} className="px-2 py-0.5 rounded-md bg-role-soft text-role text-[11px] font-bold border border-role-muted">{c}</span>
                                    ))}
                                </div>
                            )}
                            {info.isHistory && (
                                <p className="p-2.5 rounded-xl bg-slate-100 text-slate-600 text-[11px] font-bold border border-slate-200">📍 Location history record · case closed</p>
                            )}
                        </div>

                        {(onViewFull || actions.length > 0) && (
                            <div className="shrink-0 border-t border-slate-100 px-4 pt-3 space-y-2" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                                {onViewFull && (
                                    <button type="button" onClick={() => { setExpanded(false); onViewFull(); }}
                                        className="w-full h-11 rounded-xl bg-role hover:bg-role-hover text-white text-sm font-black cursor-pointer">
                                        View full report
                                    </button>
                                )}
                                {actions.length > 0 && (
                                    <div className={`grid ${actions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                                        {actions.map((a) => (
                                            <button key={a.label} type="button" onClick={() => { setExpanded(false); a.onClick(); }} title={a.title}
                                                className={`h-11 px-2 rounded-xl text-xs font-bold cursor-pointer truncate ${a.tone === 'dark' ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'}`}>
                                                {a.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex gap-3 px-3 py-2.5 min-w-0">
            <dt className="w-24 shrink-0 font-bold text-slate-500">{label}</dt>
            <dd className="flex-1 min-w-0 text-slate-800">{children}</dd>
        </div>
    );
}
