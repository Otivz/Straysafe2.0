import React, { useState, useEffect } from 'react';
import {
    Layers,
    FileText,
    ShieldCheck,
    ArrowRightCircle,
    Rocket,
    CheckCircle2,
    GitMerge,
    Unlink,
    Cpu,
    Clock,
    Ambulance,
    PawPrint,
    Hospital,
    Ban,
    Camera,
    Heart,
    Lock,
    AlertTriangle,
    X,
    MapPin,
    Building2
} from 'lucide-react';
import RelativeTimestamp from './RelativeTimestamp';
import { sightingLandmark } from '../utils/sighting';

/** A place a timeline entry happened at (Phase 3 chips). */
export interface TimelinePlace {
    label: string;
    lat?: number | null;
    lng?: number | null;
    kind: 'facility' | 'landmark' | 'sighting';
}

const FACILITY_LIKE = /holding|facility|impound|shelter|\bpen\b/i;

/** The place named on a history entry: its facility, else a real landmark (never a placeholder or the subdivision). */
function placeOfEntry(hist: any): TimelinePlace | null {
    const num = (v: any) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const lat = num(hist?.latitude);
    const lng = num(hist?.longitude);
    const fac = String(hist?.facility_name || '').trim();
    if (fac) return { label: fac, lat, lng, kind: 'facility' };
    const lm = String(hist?.landmark || '').trim();
    if (!lm) return null;
    if (FACILITY_LIKE.test(lm)) return { label: lm, lat, lng, kind: 'facility' };
    const real = sightingLandmark({ landmark: lm });
    return real ? { label: real, lat, lng, kind: 'landmark' } : null;
}

export interface Media {
    media_id: number;
    file_url: string;
    media_type: string;
    uploaded_at: string;
}

export interface TimelineEntry {
    history_id: number;
    report_status_id: number;
    rescue_status_id?: number;
    remarks: string;
    created_at: string;
    updater_name?: string;
    updater_photo?: string;
    media?: Media[];
    [key: string]: any;
}

export interface RescueTimelineProps {
    history: TimelineEntry[];
    currentStatusId?: number;
    assignedLeaderName?: string;
    reporterName?: string;
    reportCreatedAt?: string;
    animalType?: string;
    landmark?: string;
    endorsementLetter?: {
        letter_id: number;
        report_id: number;
        leader_id: number;
        letter_content: string;
        file_url?: string;
        status_id?: number;
        issued_at: string;
    } | null;
    /** Phase 3 (resident page): show where entries happened as chips; staff pages leave it off */
    placeChips?: boolean;
    /** The sighting spot, shown on the "Report submitted" entry when placeChips is on */
    sightingPlace?: TimelinePlace | null;
    onPlaceClick?: (place: TimelinePlace) => void;
    /** Phase 4 (resident page): show the return to the owner as a highlighted card, saying who confirmed it */
    reunionCard?: { confirmedBy?: 'owner' | 'officer' | null } | null;
    /** Phase 5: 'oldest' (the full story, default) or 'newest' first. Only the display order changes. */
    order?: 'oldest' | 'newest';
    /** How many cards are shown (after repeats are merged), for a header count that matches what people see */
    onEventCount?: (count: number) => void;
}

const typeStyles: Record<string, {
    nodeBg: string;
    nodeRing: string;
    cardBg: string;
    cardBorder: string;
}> = {
    blue: {
        nodeBg: 'bg-blue-600 text-white',
        nodeRing: 'ring-4 ring-blue-50/90 dark:ring-blue-950/40',
        cardBg: 'bg-white dark:bg-[#1E2738] hover:bg-blue-50/20 dark:hover:bg-blue-950/20',
        cardBorder: 'border-gray-100 dark:border-gray-800 hover:border-blue-200/80 dark:hover:border-blue-700/60',
    },
    green: {
        nodeBg: 'bg-emerald-600 text-white',
        nodeRing: 'ring-4 ring-emerald-50/90 dark:ring-emerald-950/40',
        cardBg: 'bg-white dark:bg-[#1E2738] hover:bg-emerald-50/20 dark:hover:bg-emerald-950/20',
        cardBorder: 'border-gray-100 dark:border-gray-800 hover:border-emerald-200/80 dark:hover:border-emerald-700/60',
    },
    orange: {
        nodeBg: 'bg-role text-white',
        nodeRing: 'ring-4 ring-role-soft/90 dark:ring-role-strong/40',
        cardBg: 'bg-white dark:bg-[#1E2738] hover:bg-role-soft/20 dark:hover:bg-role-strong/20',
        cardBorder: 'border-gray-100 dark:border-gray-800 hover:border-role-border/80 dark:hover:border-role-strong/60',
    },
    red: {
        nodeBg: 'bg-rose-600 text-white',
        nodeRing: 'ring-4 ring-rose-50/90 dark:ring-rose-950/40',
        cardBg: 'bg-white dark:bg-[#1E2738] hover:bg-rose-50/20 dark:hover:bg-rose-950/20',
        cardBorder: 'border-gray-100 dark:border-gray-800 hover:border-rose-200/80 dark:hover:border-rose-700/60',
    },
    gray: {
        nodeBg: 'bg-slate-500 text-white',
        nodeRing: 'ring-4 ring-slate-100 dark:ring-slate-800',
        cardBg: 'bg-white dark:bg-[#1E2738] hover:bg-gray-50/60 dark:hover:bg-gray-800/60',
        cardBorder: 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700',
    }
};

interface TimelineItem {
    id: string | number;
    actionTitle: string;
    author: string;
    timestamp: string | Date | undefined;
    description: string;
    type: 'blue' | 'green' | 'orange' | 'red' | 'gray';
    IconComponent: any;
    media?: Media[];
    isEscalation?: boolean;
    // From the history entry: used to tell an officer's claim photo from an owner's claim / return photo
    remarks?: string;
    report_status_id?: number;
    rescue_status_id?: number;
    place?: TimelinePlace | null;
    /** Came from a case this report was later separated from (kept for the record, no longer applies) */
    separatedFromCase?: number | null;
}

const RescueTimeline: React.FC<RescueTimelineProps> = ({
    history,
    assignedLeaderName,
    reporterName,
    reportCreatedAt,
    animalType,
    landmark,
    endorsementLetter,
    placeChips = false,
    sightingPlace = null,
    onPlaceClick,
    reunionCard = null,
    order = 'oldest',
    onEventCount
}) => {
    const [activeMedia, setActiveMedia] = useState<Media | null>(null);

    // Initial Report Entry
    const initialTimestamp = reportCreatedAt || (history && history.length > 0 ? history[0].created_at : undefined);
    const initialLocation = placeChips ? sightingPlace?.label : landmark;
    const initialEntry: TimelineItem = {
        id: 'initial',
        actionTitle: 'REPORT SUBMITTED',
        author: reporterName ? `by ${reporterName}` : 'by Resident',
        timestamp: initialTimestamp,
        description: `Incident filed for ${animalType || 'animal'}${initialLocation ? ` at ${initialLocation}` : ''}.${placeChips && !initialLocation ? ' Original sighting location unavailable.' : ''}`,
        type: 'blue',
        IconComponent: FileText,
        // This is the saved original sighting, which can legitimately be at a facility.
        place: placeChips ? sightingPlace : null
    };

    // Filter out redundant initial report remarks from backend history
    const rawHistory = (history || []).filter((h: any) => (h.remarks || '').trim() !== 'Initial report submitted by resident.');

    const parsedHistory: TimelineItem[] = rawHistory.map((hist: any, index: number) => {
        const rawRemarks = (hist.remarks || '').trim();
        const remarksLower = rawRemarks.toLowerCase();
        const statusId = hist.report_status_id;

        let actionTitle = 'INCIDENT UPDATE';
        let author = hist.updater_name || hist.user_name || hist.staff_name || '';
        let description = rawRemarks;
        let type: 'blue' | 'green' | 'orange' | 'red' | 'gray' = 'gray';
        let IconComponent: any = Clock;

        // Extract author if mentioned in remarks e.g. "by Emmanuel Vito Cruz"
        const byMatch = rawRemarks.match(/\bby\s+([A-Z][a-zA-Z\s]+?)(?:\.|\s+Reason|\s+Linked|\s+and|$)/);

        // 0. Unmerged: checked first, since the reason text can contain words the later rules look for
        //    ("Separated from Case #11 by ... Reason: ..." on the reopened report,
        //     "Linked duplicate Report #12 was unmerged/separated by ... Reason: ..." on the main case)
        const unmergedFrom = rawRemarks.match(/^Separated from Case\s*#?(\d+)/i);
        const unmergedChild = rawRemarks.match(/^Linked duplicate Report\s*#?(\d+)\s+was unmerged/i);
        // Multi-animal reports (MULTI_ANIMAL_REPORT_PLAN.md): these entries keep the report's status (e.g. 2), so the
        // status rules below would mislabel them (a split showed as "Incident Verified"). Their own text is kept.
        const multiAnimal: [RegExp, string, 'blue' | 'green' | 'orange' | 'red' | 'gray'][] = [
            [/^split into individual animal records/i, 'SPLIT INTO ANIMAL RECORDS', 'orange'],
            [/^added into individual animal records/i, 'ANIMAL RECORDS ADDED', 'orange'],
            [/^animal record created from group report/i, 'ANIMAL RECORD CREATED', 'orange'],
            [/^\d+ of \d+ reported animals recorded/i, 'ANIMAL COUNT CONFIRMED', 'blue'],
            [/^split undone|^animal record folded back/i, 'SPLIT UNDONE', 'gray'],
            [/^main photo replaced/i, 'PHOTO REPLACED', 'blue'],
            [/^animal \S+.* from this report \(record #\d+\)/i, 'ANIMAL UPDATE', 'blue'],
            [/^all \d+ animal records from this report are closed/i, 'GROUP REPORT RESOLVED', 'green'],
            [/^status follows group report/i, 'STATUS FOLLOWS GROUP', 'gray'],
        ];
        const multiAnimalRule = multiAnimal.find(([re]) => re.test(rawRemarks));
        if (multiAnimalRule) {
            actionTitle = multiAnimalRule[1];
            type = multiAnimalRule[2];
            IconComponent = Layers;
            description = rawRemarks;
            const doneBy = rawRemarks.match(/\bby\s+([^.;]+?)[.;)]/i);
            if (doneBy && !author) author = doneBy[1].trim();
        }
        else if (unmergedFrom || unmergedChild) {
            actionTitle = 'REPORT UNMERGED';
            type = 'orange';
            IconComponent = Unlink;
            const reasonMatch = rawRemarks.match(/Reason:\s*(.+)$/i);
            const reason = reasonMatch ? ` Reason: ${reasonMatch[1].trim()}` : '';
            description = unmergedFrom
                ? `Separated from Case #${unmergedFrom[1]} and reopened as its own case.${reason}`
                : `Report #${unmergedChild![1]} was separated from this case and reopened as its own case.${reason}`;
            const unmergedBy = rawRemarks.match(/\bby\s+(.+?)\.\s*(?:Reason:|$)/i);
            if (unmergedBy && (!author || author === 'Officer' || author === 'Barangay Officer' || author === 'Subdivision Officer')) {
                author = unmergedBy[1].trim();
            }
        }
        // 1. Report Claimed
        else if (remarksLower.includes('claimed the report') || remarksLower.includes('report claimed') || remarksLower.startsWith('claimed by')) {
            actionTitle = 'REPORT CLAIMED';
            type = 'green';
            IconComponent = ShieldCheck;
            description = 'Officer claimed the report and is now handling the case.';
            if (byMatch && (!author || author === 'Officer' || author === 'Barangay Officer' || author === 'Subdivision Officer')) {
                author = byMatch[1].trim();
            }
        }
        // 2. Forwarded to Barangay
        else if (remarksLower.includes('forwarded to barangay') || remarksLower.includes('forwarded for official review')) {
            actionTitle = 'FORWARDED TO BARANGAY';
            type = 'orange';
            IconComponent = ArrowRightCircle;
            description = 'Report forwarded for official review and approval.';
            if (byMatch && (!author || author === 'Officer' || author === 'Barangay Officer' || author === 'Subdivision Officer')) {
                author = byMatch[1].trim();
            }
        }
        // 3. Escalated
        else if (remarksLower.includes('escalat') || statusId === 4) {
            actionTitle = 'ESCALATED TO BARANGAY';
            type = 'orange';
            IconComponent = Rocket;
            description = 'Incident escalated for priority barangay intervention.';
        }
        // 4. Duplicate Confirmed
        else if (remarksLower.includes('duplicate of case') || remarksLower.includes('confirmed as duplicate') || remarksLower.includes('duplicate confirmed')) {
            actionTitle = 'DUPLICATE CONFIRMED';
            type = 'green';
            IconComponent = CheckCircle2;

            const caseMatch = rawRemarks.match(/Case\s*#?(\d+)/i);
            const matchPctMatch = rawRemarks.match(/(\d+)%\s*(?:match|visual)/i);
            const caseNum = caseMatch ? caseMatch[1] : null;
            const matchPct = matchPctMatch ? matchPctMatch[1] : null;

            if (caseNum && matchPct) {
                description = `Confirmed as duplicate of Case #${caseNum}. AI confirmed a ${matchPct}% visual/attribute match.`;
            } else if (caseNum) {
                description = `Confirmed as duplicate of Case #${caseNum} based on verified incident attributes.`;
            } else {
                description = 'Confirmed as duplicate sighting of an existing incident report.';
            }

            if (byMatch && (!author || author === 'Officer' || author === 'Barangay Officer' || author === 'Subdivision Officer')) {
                author = byMatch[1].trim();
            }
        }
        // 5. Case Consolidated / Merged
        else if (remarksLower.includes('merged reports') || remarksLower.includes('case consolidated') || remarksLower.includes('consolidated reports') || remarksLower.includes('consolidated for unified')) {
            actionTitle = 'CASE CONSOLIDATED';
            type = 'green';
            IconComponent = GitMerge;
            description = 'Merged reports for unified processing.';
        }
        // 6. System Update
        else if (remarksLower.startsWith('status changed to') || remarksLower.includes('system update') || remarksLower.includes('status updated')) {
            actionTitle = 'SYSTEM UPDATE';
            type = 'gray';
            IconComponent = Cpu;
            if (!author) author = 'System';
            const statusMatch = rawRemarks.match(/status changed to\s*["']?([^"'.]+)["']?/i);
            if (statusMatch) {
                description = `Status changed to “${statusMatch[1].trim()}”.`;
            }
        }
        // 7. Incident Verified
        else if (remarksLower.includes('verified') || statusId === 2) {
            actionTitle = 'INCIDENT VERIFIED';
            type = 'green';
            IconComponent = CheckCircle2;
            description = 'Incident verified on-site by responding personnel.';
        }
        // 8. Rescue Team Dispatched
        else if (remarksLower.includes('dispatch') || remarksLower.includes('assign-team') || remarksLower.includes('team assigned') || statusId === 5) {
            actionTitle = 'RESCUE TEAM DISPATCHED';
            type = 'orange';
            IconComponent = Ambulance;
            description = 'Response team deployed to secure and contain the animal.';
        }
        // 9. Animal Impounded
        else if (statusId === 8 || /impounded|impoundment/.test(remarksLower)) {
            actionTitle = 'ANIMAL IMPOUNDED';
            type = 'orange';
            IconComponent = Lock;
            description = rawRemarks || 'Animal officially impounded in facility custody.';
        }
        // 11. Stay Limit Notice
        else if (remarksLower.includes('stay limit')) {
            actionTitle = 'STAY LIMIT NOTICE';
            type = 'orange';
            IconComponent = Clock;
            description = rawRemarks || 'Facility stay limit notice issued.';
        }
        // 12. Relocation / Holding / Observation
        else if (remarksLower.includes('relocated to') || remarksLower.includes('transferred to') || remarksLower.includes('relocation') || remarksLower.includes('transfer')) {
            actionTitle = 'FACILITY RELOCATION / TRANSFER';
            type = 'orange';
            IconComponent = Hospital;
            description = rawRemarks || 'Animal relocated to designated facility.';
        }
        else if (remarksLower.includes('observation note') || remarksLower.includes('daily note') || remarksLower.includes('medical note')) {
            actionTitle = 'FACILITY OBSERVATION';
            type = 'blue';
            IconComponent = Clock;
            description = rawRemarks || 'Facility observation recorded.';
        }
        else if (statusId === 7 || remarksLower.includes('holding') || remarksLower.includes('facility') || remarksLower.includes('shelter')) {
            actionTitle = 'MOVED TO HOLDING PLACE';
            type = 'orange';
            IconComponent = Hospital;
            description = rawRemarks || 'Animal safely admitted to temporary holding pen.';
        }
        // 13. Animal Picked Up / Secured (Status 6 in-transit only)
        else if (statusId === 6 || remarksLower.includes('picked up') || remarksLower.includes('animal secured')) {
            actionTitle = 'ANIMAL SECURED';
            type = 'green';
            IconComponent = PawPrint;
            description = 'Animal successfully captured and secured in transit.';
        }
        // 14. Claim Approved / Pet Claimed
        else if (remarksLower.includes('claim') || remarksLower.includes('pet received') || remarksLower.includes('returned to owner') || remarksLower.includes('reunion') || statusId === 9) {
            actionTitle = (remarksLower.includes('pet received') || remarksLower.includes('pet receipt') || remarksLower.includes('claimed by') || remarksLower.includes('returned to owner') || statusId === 9)
                ? 'CLAIMED BY OWNER' 
                : (remarksLower.includes('approved') ? 'CLAIM APPROVED' : 'OWNERSHIP CLAIM FILED');
            type = 'green';
            IconComponent = ShieldCheck;
            description = rawRemarks || 'Pet ownership claim processed and dog safely reunited with owner.';
        }
        // 12. False Alarm / Dismissed / Rejected
        else if (remarksLower.includes('false alarm') || remarksLower.includes('reject') || statusId === 3 || statusId === 14) {
            actionTitle = remarksLower.includes('false alarm') ? 'FALSE ALARM RECORDED' : 'REPORT REJECTED';
            type = 'red';
            IconComponent = Ban;
            description = rawRemarks || 'Incident reviewed and dismissed.';
        }
        // 13. Official Warning Issued
        else if (remarksLower.includes('warning issued') || remarksLower.includes('official warning') || remarksLower.includes('citation issued')) {
            actionTitle = 'WARNING ISSUED';
            type = 'red';
            IconComponent = AlertTriangle;
            description = rawRemarks || 'Official warning citation issued for this incident report.';
        }
        // 14. Incident Resolved
        else if (remarksLower.includes('resolved') || statusId === 11 || statusId === 12) {
            actionTitle = 'INCIDENT RESOLVED';
            type = 'green';
            IconComponent = CheckCircle2;
            description = rawRemarks || 'All response actions complete. Incident closed.';
        }
        // 14. Default fallback
        else {
            actionTitle = 'OFFICIAL ACTION LOGGED';
            type = 'blue';
            IconComponent = FileText;
            description = rawRemarks || 'Activity logged in incident audit trail.';
        }

        if (!author) {
            if (assignedLeaderName) author = assignedLeaderName;
            else if (rawRemarks.toLowerCase().includes('subdivision') || rawRemarks.toLowerCase().includes('selera') || (hist as any).subdivision_id) author = 'Subdivision Officer';
            else author = 'Authorized Personnel';
        }
        if (author.toLowerCase().startsWith('by ')) {
            author = author.substring(3).trim();
        }

        // Only keep media with valid, non-empty file_url
        const validHistMedia = (hist.media || []).filter((m: any) => 
            m && m.file_url && typeof m.file_url === 'string' && m.file_url.trim() !== '' && m.file_url !== 'null' && m.file_url !== 'undefined'
        );

        return {
            id: hist.history_id || `hist-${index}`,
            actionTitle,
            author: `by ${author}`,
            timestamp: hist.created_at || hist.timestamp,
            description,
            type,
            IconComponent,
            media: validHistMedia,
            isEscalation: (remarksLower.includes('escalat') || statusId === 4) && !!endorsementLetter,
            remarks: rawRemarks,
            report_status_id: hist.report_status_id,
            rescue_status_id: hist.rescue_status_id,
            place: placeChips ? placeOfEntry(hist) : null
        };
    });

    const cleanRepeatedText = (text: string): string => {
        if (!text) return text;
        const parts = text.split(/(?<=[.;])\s+/);
        const seen = new Set<string>();
        const cleaned: string[] = [];
        for (const part of parts) {
            const trimmed = part.trim();
            const base = trimmed.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();
            if (base && seen.has(base)) {
                const prevIdx = cleaned.findIndex(p => p.trim().replace(/\s*\([^)]*\)\s*$/, '').toLowerCase() === base);
                if (prevIdx !== -1 && trimmed.length > cleaned[prevIdx].length) {
                    cleaned[prevIdx] = trimmed;
                }
                continue;
            }
            if (base) seen.add(base);
            cleaned.push(trimmed);
        }
        return cleaned.join(' ');
    };

    const isFacilityMovement = (title: string) => 
        title === 'MOVED TO HOLDING PLACE' || title === 'FACILITY RELOCATION / TRANSFER';

    // Deduplicate consecutive events or merge facility movement events occurring within 5 minutes
    const deduplicatedParsedHistory: TimelineItem[] = [];
    for (const item of parsedHistory) {
        item.description = cleanRepeatedText(item.description);
        const last = deduplicatedParsedHistory[deduplicatedParsedHistory.length - 1];

        if (last) {
            const timeDiff = Math.abs(new Date(item.timestamp || 0).getTime() - new Date(last.timestamp || 0).getTime());

            // Case 1: Identical action titles within 3 minutes
            if (last.actionTitle === item.actionTitle && (timeDiff <= 180000 || last.description === item.description)) {
                if (!last.place && item.place) last.place = item.place;
                if (item.media && item.media.length > 0) {
                    const existingIds = new Set((last.media || []).map((m: any) => m.media_id || m.file_url));
                    const newMedia = item.media.filter((m: any) => !existingIds.has(m.media_id || m.file_url));
                    last.media = [...(last.media || []), ...newMedia];
                }
                continue;
            }

            // Case 2: Redundant facility movement events (e.g. "MOVED TO HOLDING FACILITY" and "FACILITY RELOCATION / TRANSFER") within 5 minutes
            if (isFacilityMovement(last.actionTitle) && isFacilityMovement(item.actionTitle) && timeDiff <= 300000) {
                last.actionTitle = 'MOVED TO HOLDING PLACE';
                if (!last.place && item.place) last.place = item.place;

                // Merge media attachments so evidence is preserved
                if (item.media && item.media.length > 0) {
                    const existingIds = new Set((last.media || []).map((m: any) => m.media_id || m.file_url));
                    const newMedia = item.media.filter((m: any) => !existingIds.has(m.media_id || m.file_url));
                    last.media = [...(last.media || []), ...newMedia];
                }

                // If the second item has extra details, incorporate cleanly
                if (item.description && !last.description.includes(item.description)) {
                    last.description = cleanRepeatedText(`${last.description} ${item.description}`);
                }
                continue;
            }
        }

        deduplicatedParsedHistory.push(item);
    }

    const allEvents = [initialEntry, ...deduplicatedParsedHistory];
    useEffect(() => { onEventCount?.(allEvents.length); }, [allEvents.length, onEventCount]);
    // A report separated from a case keeps the history it had while merged (the audit trail), but entries about
    // that case (merged as its duplicate, closed or linked to a pet "via / through Case #N") no longer apply to it.
    for (const sep of allEvents) {
        const m = (sep.remarks || '').match(/^Separated from Case\s*#?(\d+)/i);
        if (!m) continue;
        const caseNo = m[1];
        const sepAt = new Date(sep.timestamp || 0).getTime();
        const mentions = new RegExp(`(Case|Report)\\s*#${caseNo}(?!\\d)`, 'i');
        for (const e of allEvents) {
            if (e === sep || e.id === 'initial' || /^Separated from Case/i.test(e.remarks || '')) continue;
            if (new Date(e.timestamp || 0).getTime() <= sepAt && mentions.test(e.remarks || '')) e.separatedFromCase = Number(caseNo);
        }
    }
    // The return to the owner: the latest "claimed by owner" entry
    const reunionId = reunionCard
        ? [...allEvents].reverse().find((e) => !e.separatedFromCase && (e.report_status_id === 9 || e.actionTitle === 'CLAIMED BY OWNER'))?.id ?? null
        : null;
    const shownPlaceIds = new Set<string | number>();
    if (placeChips) {
        let lastLabel = '';
        for (const evt of allEvents) {
            // a facility chip only on an entry that is about the facility (moved, held, impounded), not on e.g. a merge
            const aboutFacility = [7, 8].includes(Number(evt.report_status_id)) || /FACILITY|IMPOUND|HOLDING/.test(evt.actionTitle || '');
            if (evt.place?.kind === 'facility' && !aboutFacility) continue;
            const label = (evt.place?.label || '').trim().toLowerCase();
            if (label && label !== lastLabel) {
                shownPlaceIds.add(evt.id);
                lastLabel = label;
            }
        }
    }

    return (
        <div className="relative pl-7">
            {/* Crisp continuous vertical line connecting all event nodes */}
            <div className="absolute left-[11px] top-3.5 bottom-3.5 w-[2px] bg-slate-200/90 dark:bg-gray-800 rounded-full" />

            <div className="space-y-3 relative">
                {(order === 'newest' ? [...allEvents].reverse() : allEvents).map((evt) => {
                    const isReunion = reunionId !== null && evt.id === reunionId;
                    const style = typeStyles[evt.type] || typeStyles.gray;
                    const Icon = isReunion ? Heart : evt.IconComponent;

                    return (
                        <div key={evt.id} className="relative group"
                            // anchors for the resident stage stepper (CaseStageStepper scrolls to an entry)
                            data-timeline-id={String(evt.id)}
                            data-status-id={evt.id === 'initial' ? 1 : (evt.report_status_id ?? '')}>
                            {/* Circular Icon Node centered on vertical line */}
                            <div
                                className={`absolute -left-7 top-2.5 w-6 h-6 rounded-full ${style.nodeBg} ${style.nodeRing} flex items-center justify-center shadow-xs z-10 transition-transform duration-200 group-hover:scale-110`}
                            >
                                <Icon className="w-3 h-3" />
                            </div>

                            {/* Compact Event Card */}
                            <div
                                style={evt.separatedFromCase ? { opacity: 0.6 } : undefined}
                                className={isReunion
                                    ? 'p-3.5 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-amber-50 dark:from-emerald-950/40 dark:via-[#1E2738] dark:to-amber-950/20 border-2 border-emerald-300 dark:border-emerald-800 shadow-sm'
                                    : `p-3.5 rounded-2xl ${style.cardBg} border ${style.cardBorder} shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200`}
                            >
                                {/* Top Row: Action Title (Most prominent) & Timestamp */}
                                <div className="flex items-start justify-between gap-2">
                                    <h5 className={`text-xs font-black uppercase tracking-wider leading-tight ${isReunion ? 'text-emerald-800 dark:text-emerald-300' : 'text-gray-900 dark:text-white'} ${evt.separatedFromCase ? 'line-through decoration-2 decoration-gray-500' : ''}`}
                                        title={evt.separatedFromCase ? `No longer applies: separated from Case #${evt.separatedFromCase}` : undefined}>
                                        {isReunion ? 'Back home with its owner 🎉' : evt.actionTitle}
                                    </h5>
                                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0 pt-0.5">
                                        <RelativeTimestamp date={evt.timestamp} />
                                    </span>
                                </div>

                                {/* No longer applies: this happened while the report was part of another case */}
                                {evt.separatedFromCase && (
                                    <p className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[9px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                        <Unlink className="w-3 h-3" /> No longer applies: separated from Case #{evt.separatedFromCase}
                                    </p>
                                )}

                                {/* Second Row: Person Responsible */}
                                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
                                    {evt.author}
                                </p>

                                {/* Who confirmed the return (the two are not the same: an owner's own confirmation vs an officer's handover) */}
                                {isReunion && reunionCard?.confirmedBy && (
                                    <p className={`mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ${reunionCard.confirmedBy === 'officer' ? 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50' : 'bg-emerald-100/70 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50'}`}>
                                        {reunionCard.confirmedBy === 'officer'
                                            ? <><ShieldCheck className="w-3 h-3" /> Handover checked by an officer</>
                                            : <><CheckCircle2 className="w-3 h-3" /> Confirmed by the owner</>}
                                    </p>
                                )}

                                {/* Third Row: Short, Readable Description */}
                                <p className="text-xs text-gray-600 dark:text-gray-300 font-medium mt-1 leading-snug">
                                    {evt.description}
                                </p>

                                {/* Where it happened (resident page): only when the place changes */}
                                {evt.place && shownPlaceIds.has(evt.id) && (() => {
                                    const pl = evt.place;
                                    const canFocus = Boolean(onPlaceClick) && pl.lat != null && pl.lng != null;
                                    const PlaceIcon = pl.kind === 'facility' ? Building2 : MapPin;
                                    return (
                                        <button type="button" disabled={!canFocus} onClick={() => canFocus && onPlaceClick?.(pl)}
                                            title={canFocus ? 'Show on the map' : undefined}
                                            className={`mt-1.5 inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-full border text-[10px] font-bold transition-colors ${pl.kind === 'facility' ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/50' : 'bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-800/60 dark:text-gray-200 dark:border-gray-700'} ${canFocus ? 'cursor-pointer hover:border-role-border hover:text-role' : 'cursor-default'}`}>
                                            <PlaceIcon className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{pl.label}</span>
                                        </button>
                                    );
                                })()}

                                {/* Endorsement Letter details if applicable */}
                                {evt.isEscalation && endorsementLetter && (
                                    <div className="mt-2.5 p-3 rounded-xl bg-role-soft/70 dark:bg-role-strong/30 border border-role-border/70 dark:border-role-strong/40 text-xs">
                                        <p className="text-[10px] font-black text-role-hover dark:text-role uppercase tracking-wider mb-1">
                                            Official Endorsement Sighting
                                        </p>
                                        <p className="text-gray-700 dark:text-gray-300 italic text-[11px] leading-relaxed">
                                            "{endorsementLetter.letter_content}"
                                        </p>
                                        {endorsementLetter.file_url && (
                                            <a
                                                href={endorsementLetter.file_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-role-hover dark:text-role hover:underline"
                                            >
                                                <FileText className="w-3.5 h-3.5" />
                                                View Official Endorsement Document
                                            </a>
                                        )}
                                    </div>
                                )}

                                {/* Media Attachments */}
                                {(() => {
                                    const allMedia = (evt.media || []).filter((m: Media) => 
                                        m && m.file_url && typeof m.file_url === 'string' && m.file_url.trim() !== '' && m.file_url !== 'null' && m.file_url !== 'undefined'
                                    );
                                    const visualMedia = allMedia.filter((m: Media) => 
                                        m.media_type !== 'Document' && !m.file_url.toLowerCase().endsWith('.pdf') && !m.file_url.toLowerCase().includes('/raw/')
                                    );
                                    const docMedia = allMedia.filter((m: Media) => 
                                        m.media_type === 'Document' || m.file_url.toLowerCase().endsWith('.pdf') || m.file_url.toLowerCase().includes('/raw/')
                                    );

                                    if (visualMedia.length === 0 && docMedia.length === 0) return null;

                                    const isOfficerClaim = evt.actionTitle === 'REPORT CLAIMED' ||
                                        (evt.remarks && (
                                            evt.remarks.toLowerCase().includes('claimed the report') ||
                                            evt.remarks.toLowerCase().includes('report claimed') ||
                                            evt.remarks.toLowerCase().includes('officer claimed')
                                        ));

                                    const isClaimedOrReturned = !isOfficerClaim && (
                                        evt.actionTitle === 'CLAIMED BY OWNER' ||
                                        evt.report_status_id === 9 || 
                                        evt.rescue_status_id === 9 ||
                                        (evt.actionTitle && (
                                            evt.actionTitle.toLowerCase().includes('reunited') ||
                                            evt.actionTitle.toLowerCase().includes('claim approved')
                                        )) ||
                                        (evt.remarks && (
                                            evt.remarks.toLowerCase().includes('returned to owner') ||
                                            evt.remarks.toLowerCase().includes('reunited') ||
                                            evt.remarks.toLowerCase().includes('pet received') ||
                                            evt.remarks.toLowerCase().includes('claimed by owner') ||
                                            evt.remarks.toLowerCase().includes('safely claimed') ||
                                            evt.remarks.toLowerCase().includes('safely recovered')
                                        ))
                                    );

                                    return (
                                        <div className="mt-2.5 space-y-2">
                                            {isClaimedOrReturned && visualMedia.length > 0 && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-300 w-fit">
                                                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                                    <span className="text-[10px] font-black uppercase tracking-wider">
                                                        🐾 Owner Reunion & Possession Proof
                                                    </span>
                                                </div>
                                            )}
                                            {visualMedia.length > 0 && (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {visualMedia.map((item: Media) => (
                                                        <div
                                                            key={item.media_id || item.file_url}
                                                            onClick={() => setActiveMedia(item)}
                                                            className={`relative aspect-video rounded-xl overflow-hidden cursor-pointer group/media border shadow-2xs bg-gray-100 dark:bg-gray-800 ${isClaimedOrReturned ? 'border-2 border-emerald-400 dark:border-emerald-600 ring-2 ring-emerald-100 dark:ring-emerald-950/60' : 'border-gray-100 dark:border-gray-700'}`}
                                                        >
                                                            {item.media_type === 'Video' || item.file_url.match(/\.(mp4|webm|mov|avi)$/i) ? (
                                                                <div className="w-full h-full bg-black/90 flex items-center justify-center">
                                                                    <Camera className="w-4 h-4 text-white/80" />
                                                                </div>
                                                            ) : (
                                                                <img
                                                                    src={item.file_url}
                                                                    className="w-full h-full object-cover transition-transform group-hover/media:scale-105"
                                                                    alt="Reunion / Evidence Proof"
                                                                    loading="lazy"
                                                                    onError={(e) => {
                                                                        // Cleanly hide container if image fails to load or 404s
                                                                        const parent = e.currentTarget.parentElement;
                                                                        if (parent) parent.style.display = 'none';
                                                                    }}
                                                                />
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {docMedia.length > 0 && (
                                                <div className="flex flex-wrap gap-2">
                                                    {docMedia.map((item: Media) => (
                                                        <a
                                                            key={item.media_id || item.file_url}
                                                            href={item.file_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-role-soft dark:bg-role-strong/40 border border-role-border/70 dark:border-role-strong/40 text-[11px] font-bold text-role-strong dark:text-role hover:bg-role-muted dark:hover:bg-role-strong/60 transition-colors"
                                                        >
                                                            <FileText className="w-3.5 h-3.5 shrink-0" />
                                                            <span>View Attached Document</span>
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Lightbox Media Viewer Modal */}
            {activeMedia && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
                    onClick={() => setActiveMedia(null)}
                >
                    <button
                        className="absolute top-6 right-6 text-white/70 hover:text-white p-2.5 rounded-full bg-white/10 hover:bg-white/20 transition-all"
                        onClick={() => setActiveMedia(null)}
                    >
                        <X className="w-6 h-6" />
                    </button>
                    {activeMedia.media_type === 'Video' ? (
                        <video
                            src={activeMedia.file_url}
                            controls
                            autoPlay
                            className="max-w-full max-h-[85vh] rounded-2xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <img
                            src={activeMedia.file_url}
                            className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                            alt="Full View"
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default RescueTimeline;
