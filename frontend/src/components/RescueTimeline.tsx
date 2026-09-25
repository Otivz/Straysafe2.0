import React, { useState } from 'react';
import {
    FileText,
    ShieldCheck,
    ArrowRightCircle,
    Rocket,
    CheckCircle2,
    GitMerge,
    Cpu,
    Clock,
    Ambulance,
    PawPrint,
    Hospital,
    Shield,
    Ban,
    Camera,
    X
} from 'lucide-react';
import RelativeTimestamp from './RelativeTimestamp';

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
        nodeBg: 'bg-[#F97316] text-white',
        nodeRing: 'ring-4 ring-orange-50/90 dark:ring-orange-950/40',
        cardBg: 'bg-white dark:bg-[#1E2738] hover:bg-orange-50/20 dark:hover:bg-orange-950/20',
        cardBorder: 'border-gray-100 dark:border-gray-800 hover:border-orange-200/80 dark:hover:border-orange-700/60',
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
}

const RescueTimeline: React.FC<RescueTimelineProps> = ({
    history,
    assignedLeaderName,
    reporterName,
    reportCreatedAt,
    animalType,
    landmark,
    endorsementLetter
}) => {
    const [activeMedia, setActiveMedia] = useState<Media | null>(null);

    // Initial Report Entry
    const initialTimestamp = reportCreatedAt || (history && history.length > 0 ? history[0].created_at : undefined);
    const initialEntry: TimelineItem = {
        id: 'initial',
        actionTitle: 'REPORT SUBMITTED',
        author: reporterName ? `by ${reporterName}` : 'by Resident',
        timestamp: initialTimestamp,
        description: `Incident filed for ${animalType || 'animal'}${landmark ? ` at ${landmark}` : ''}.`,
        type: 'blue',
        IconComponent: FileText
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

        // 1. Report Claimed
        if (remarksLower.includes('claimed the report') || remarksLower.includes('report claimed') || remarksLower.startsWith('claimed by')) {
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
        // 9. Relocation / Holding / Observation (check facility movement BEFORE animal secured so holding remarks don't get misclassified)
        else if (remarksLower.includes('relocated to') || remarksLower.includes('transferred to') || remarksLower.includes('relocation') || remarksLower.includes('transfer')) {
            actionTitle = 'FACILITY RELOCATION / TRANSFER';
            type = 'orange';
            IconComponent = Hospital;
            description = rawRemarks || 'Animal relocated to designated facility.';
        }
        else if (remarksLower.includes('stay limit') || remarksLower.includes('observation note') || remarksLower.includes('daily note')) {
            actionTitle = 'FACILITY OBSERVATION';
            type = 'blue';
            IconComponent = Clock;
            description = rawRemarks || 'Facility observation recorded.';
        }
        else if (statusId === 7 || statusId === 8 || remarksLower.includes('holding') || remarksLower.includes('facility') || remarksLower.includes('shelter')) {
            actionTitle = 'MOVED TO HOLDING FACILITY';
            type = 'orange';
            IconComponent = Hospital;
            description = rawRemarks || 'Animal safely admitted to temporary holding pen.';
        }
        // 10. Animal Picked Up / Secured (Status 6 in-transit only)
        else if (statusId === 6 || remarksLower.includes('picked up') || remarksLower.includes('animal secured')) {
            actionTitle = 'ANIMAL SECURED';
            type = 'green';
            IconComponent = PawPrint;
            description = 'Animal successfully captured and secured in transit.';
        }
        // 11. Claim Approved / Pet Claimed
        else if (remarksLower.includes('claim') || statusId === 9) {
            actionTitle = remarksLower.includes('approved') ? 'CLAIM APPROVED' : 'OWNERSHIP CLAIM FILED';
            type = 'green';
            IconComponent = Shield;
            description = rawRemarks || 'Pet ownership claim processed for custody handover.';
        }
        // 12. False Alarm / Dismissed / Rejected
        else if (remarksLower.includes('false alarm') || remarksLower.includes('reject') || statusId === 3 || statusId === 14) {
            actionTitle = remarksLower.includes('false alarm') ? 'FALSE ALARM RECORDED' : 'REPORT REJECTED';
            type = 'red';
            IconComponent = Ban;
            description = rawRemarks || 'Incident reviewed and dismissed.';
        }
        // 13. Incident Resolved
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
            isEscalation: (remarksLower.includes('escalat') || statusId === 4) && !!endorsementLetter
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
        title === 'MOVED TO HOLDING FACILITY' || title === 'FACILITY RELOCATION / TRANSFER';

    // Deduplicate consecutive events or merge facility movement events occurring within 5 minutes
    const deduplicatedParsedHistory: TimelineItem[] = [];
    for (const item of parsedHistory) {
        item.description = cleanRepeatedText(item.description);
        const last = deduplicatedParsedHistory[deduplicatedParsedHistory.length - 1];

        if (last) {
            const timeDiff = Math.abs(new Date(item.timestamp || 0).getTime() - new Date(last.timestamp || 0).getTime());

            // Case 1: Identical action titles within 3 minutes
            if (last.actionTitle === item.actionTitle && (timeDiff <= 180000 || last.description === item.description)) {
                if (item.media && item.media.length > 0) {
                    const existingIds = new Set((last.media || []).map((m: any) => m.media_id || m.file_url));
                    const newMedia = item.media.filter((m: any) => !existingIds.has(m.media_id || m.file_url));
                    last.media = [...(last.media || []), ...newMedia];
                }
                continue;
            }

            // Case 2: Redundant facility movement events (e.g. "MOVED TO HOLDING FACILITY" and "FACILITY RELOCATION / TRANSFER") within 5 minutes
            if (isFacilityMovement(last.actionTitle) && isFacilityMovement(item.actionTitle) && timeDiff <= 300000) {
                last.actionTitle = 'MOVED TO HOLDING FACILITY';

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

    return (
        <div className="relative pl-7">
            {/* Crisp continuous vertical line connecting all event nodes */}
            <div className="absolute left-[11px] top-3.5 bottom-3.5 w-[2px] bg-slate-200/90 dark:bg-gray-800 rounded-full" />

            <div className="space-y-3 relative">
                {allEvents.map((evt) => {
                    const style = typeStyles[evt.type] || typeStyles.gray;
                    const Icon = evt.IconComponent;

                    return (
                        <div key={evt.id} className="relative group">
                            {/* Circular Icon Node centered on vertical line */}
                            <div
                                className={`absolute -left-7 top-2.5 w-6 h-6 rounded-full ${style.nodeBg} ${style.nodeRing} flex items-center justify-center shadow-xs z-10 transition-transform duration-200 group-hover:scale-110`}
                            >
                                <Icon className="w-3 h-3" />
                            </div>

                            {/* Compact Event Card */}
                            <div
                                className={`p-3.5 rounded-2xl ${style.cardBg} border ${style.cardBorder} shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200`}
                            >
                                {/* Top Row: Action Title (Most prominent) & Timestamp */}
                                <div className="flex items-start justify-between gap-2">
                                    <h5 className="text-xs font-black uppercase tracking-wider text-gray-900 dark:text-white leading-tight">
                                        {evt.actionTitle}
                                    </h5>
                                    <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 whitespace-nowrap shrink-0 pt-0.5">
                                        <RelativeTimestamp date={evt.timestamp} />
                                    </span>
                                </div>

                                {/* Second Row: Person Responsible */}
                                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
                                    {evt.author}
                                </p>

                                {/* Third Row: Short, Readable Description */}
                                <p className="text-xs text-gray-600 dark:text-gray-300 font-medium mt-1 leading-snug">
                                    {evt.description}
                                </p>

                                {/* Endorsement Letter details if applicable */}
                                {evt.isEscalation && endorsementLetter && (
                                    <div className="mt-2.5 p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/30 border border-orange-200/70 dark:border-orange-900/40 text-xs">
                                        <p className="text-[10px] font-black text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">
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
                                                className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-orange-600 dark:text-orange-400 hover:underline"
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

                                    return (
                                        <div className="mt-2.5 space-y-2">
                                            {visualMedia.length > 0 && (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {visualMedia.map((item: Media) => (
                                                        <div
                                                            key={item.media_id || item.file_url}
                                                            onClick={() => setActiveMedia(item)}
                                                            className="relative aspect-video rounded-xl overflow-hidden cursor-pointer group/media border border-gray-100 dark:border-gray-700 shadow-2xs bg-gray-100 dark:bg-gray-800"
                                                        >
                                                            {item.media_type === 'Video' || item.file_url.match(/\.(mp4|webm|mov|avi)$/i) ? (
                                                                <div className="w-full h-full bg-black/90 flex items-center justify-center">
                                                                    <Camera className="w-4 h-4 text-white/80" />
                                                                </div>
                                                            ) : (
                                                                <img
                                                                    src={item.file_url}
                                                                    className="w-full h-full object-cover transition-transform group-hover/media:scale-105"
                                                                    alt="Evidence"
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
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200/70 dark:border-orange-900/40 text-[11px] font-bold text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900/60 transition-colors"
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
