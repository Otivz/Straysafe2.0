import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ImageIcon, MessageSquare, User, Home } from 'lucide-react';
import {
    COMPLIANCE_BADGE_CLASSES,
    getComplianceLabel,
    getApiErrorMessage,
    type OwnerObservationUpdate,
} from '../utils/ownerObservationUpdates';
import { reviewOwnerObservationUpdate } from '../utils/ownerObservationUpdatesApi';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import RelativeTimestamp from './RelativeTimestamp';

const formatDateTime = (value: string | null | undefined): string => {
    if (!value) return 'Not recorded';
    const d = new Date(value.includes(' ') && !value.includes('T') ? value.replace(' ', 'T') : value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

interface SubdOwnerUpdatesSectionProps {
    followupId: number;
    updates: OwnerObservationUpdate[];
    canReview: boolean;
    onReviewed: (update: OwnerObservationUpdate) => void;
}

interface UpdateCardProps {
    followupId: number;
    update: OwnerObservationUpdate;
    canReview: boolean;
    onReviewed: (update: OwnerObservationUpdate) => void;
}

const OwnerUpdateCard: React.FC<UpdateCardProps> = ({ followupId, update, canReview, onReviewed }) => {
    const [expanded, setExpanded] = useState(!update.is_reviewed);
    const [remarks, setRemarks] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleReview = async () => {
        if (saving) return;
        setSaving(true);
        setError(null);
        try {
            onReviewed(await reviewOwnerObservationUpdate(followupId, update.update_id, remarks));
            setRemarks('');
        } catch (err: unknown) {
            setError(getApiErrorMessage(err, 'The review could not be saved. Please try again.'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <li className={`rounded-2xl border transition-all duration-300 ${update.is_reviewed ? 'border-gray-200/90 bg-stone-50/60 hover:bg-white hover:border-gray-300' : 'border-sky-200 bg-sky-50/40 hover:bg-sky-50/70 hover:border-sky-300'} overflow-hidden shadow-2xs hover:shadow-md hover:-translate-y-0.5 group/card`}>
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="w-full p-4 sm:p-5 flex items-start justify-between gap-3 text-left cursor-pointer transition-colors"
            >
                <div className="min-w-0 space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                        {!update.is_reviewed && (
                            <span className="px-2 py-0.5 rounded-full bg-sky-600 text-white text-[9px] font-black uppercase tracking-wider animate-pulse">New</span>
                        )}
                        <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-black ${COMPLIANCE_BADGE_CLASSES[update.compliance_status] || 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                            {getComplianceLabel(update.compliance_status)}
                        </span>
                        {update.photos.length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-full bg-white border border-gray-200 text-[10px] font-bold text-gray-600 inline-flex items-center gap-1 shadow-2xs">
                                <ImageIcon className="w-3 h-3 text-sky-600" /> {update.photos.length}
                            </span>
                        )}
                    </div>
                    <p className="text-[11px] text-gray-700 font-bold flex flex-wrap items-center gap-x-1.5">
                        <span className="inline-flex items-center gap-1 text-gray-900">
                            <User className="w-3 h-3 text-gray-400" /> {update.owner_name || 'Pet Owner'}
                        </span>
                        <span className="text-gray-300">·</span>
                        <span className="text-amber-800 font-extrabold">{update.animal_name || 'Animal'}</span>
                        <span className="text-gray-300">·</span>
                        <span className="text-gray-500 font-semibold">Report #{update.report_id}</span>
                    </p>
                    {!expanded && (
                        <div className="mt-1 p-2.5 sm:p-3 rounded-xl bg-white/90 border border-stone-200/70 text-xs text-gray-700 font-medium line-clamp-1 italic shadow-2xs group-hover/card:border-sky-300/80 transition-colors">
                            "{update.owner_remarks}"
                        </div>
                    )}
                </div>
                <div className="text-right shrink-0 space-y-0.5 pl-2">
                    <span className="block text-[11px] text-gray-800 font-black">{formatDateTime(update.submitted_at)}</span>
                    <span className="block text-[10px] text-gray-400 font-medium"><RelativeTimestamp date={update.submitted_at} /></span>
                    <div className={`w-7 h-7 rounded-xl bg-gray-100 group-hover/card:bg-sky-100 group-hover/card:text-sky-700 flex items-center justify-center ml-auto mt-1.5 transition-all duration-300 ${expanded ? 'rotate-180 bg-sky-200 text-sky-800' : ''}`}>
                        <ChevronDown className="w-3.5 h-3.5" />
                    </div>
                </div>
            </button>

            {expanded && (
                <div className="px-4 pb-4 space-y-3.5 text-xs border-t border-gray-100/80 pt-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div>
                        <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">Owner Remarks</span>
                        <div className="p-3.5 rounded-2xl bg-white border border-stone-200/80 text-gray-800 font-medium whitespace-pre-wrap break-words leading-relaxed shadow-2xs">
                            "{update.owner_remarks}"
                        </div>
                    </div>

                    {update.photos.length > 0 && (
                        <div>
                            <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">Uploaded Evidence</span>
                            <div className="flex flex-wrap gap-2.5">
                                {update.photos.map((ph, i) => (
                                    <a
                                        key={ph.photo_id}
                                        href={ph.photo_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title="Open full-size photo"
                                        className="group/img block rounded-2xl overflow-hidden border border-gray-200 hover:ring-2 hover:ring-sky-400 shadow-2xs transition-all duration-300 hover:scale-105"
                                    >
                                        <img src={cloudinaryResized(ph.photo_url, 240)} alt={`Owner evidence ${i + 1}`} className="w-24 h-24 object-cover group-hover/img:scale-110 transition-transform duration-300" loading="lazy" />
                                    </a>
                                ))}
                            </div>
                        </div>
                    )}

                    {update.is_reviewed ? (
                        <div className="p-3.5 rounded-2xl bg-emerald-50/90 border border-emerald-200/90 text-emerald-950 space-y-1.5 shadow-2xs">
                            <p className="font-black flex items-center gap-1.5 text-xs text-emerald-900">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                <span>Reviewed by {update.reviewer_name || 'Staff'} · {formatDateTime(update.reviewed_at)}</span>
                            </p>
                            {update.review_remarks && (
                                <p className="font-medium flex gap-1.5 text-xs text-emerald-800 pl-5">
                                    <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
                                    <span>{update.review_remarks}</span>
                                </p>
                            )}
                        </div>
                    ) : canReview ? (
                        <div className="p-4 rounded-2xl bg-white border border-sky-200/90 space-y-2.5 shadow-2xs">
                            <label htmlFor={`review-${update.update_id}`} className="block text-[10px] font-black uppercase tracking-wider text-gray-500">
                                Staff Review Remarks <span className="normal-case font-bold text-gray-400">(optional)</span>
                            </label>
                            <textarea
                                id={`review-${update.update_id}`}
                                rows={2}
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                disabled={saving}
                                maxLength={2000}
                                placeholder="e.g., Photo shows gate latched; confirm on next inspection."
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-sky-500/20 transition-all"
                            />
                            {error && <p role="alert" className="text-[11px] text-rose-700 font-bold">{error}</p>}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                                <p className="text-[10px] text-gray-500 font-medium">
                                    Reviewing does not verify the case as resolved. Use “Verify &amp; Mark Resolved” after an on-site check.
                                </p>
                                <button
                                    type="button"
                                    onClick={handleReview}
                                    disabled={saving}
                                    aria-busy={saving}
                                    className="shrink-0 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 active:scale-95 disabled:opacity-50 text-white font-black text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Mark as Reviewed'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <p className="text-[11px] text-amber-700 font-bold">Not yet reviewed by subdivision staff.</p>
                    )}
                </div>
            )}
        </li>
    );
};

// "OWNER OBSERVATION UPDATES": what the pet owner submitted. Kept separate from the
// staff "Monitoring History & Follow-up Logs" section on purpose.
const SubdOwnerUpdatesSection: React.FC<SubdOwnerUpdatesSectionProps> = ({ followupId, updates, canReview, onReviewed }) => {
    const unreviewed = updates.filter((u) => !u.is_reviewed).length;
    return (
        <div className="bg-white rounded-3xl border border-sky-200/80 p-5 sm:p-6 shadow-xs hover:shadow-md transition-all duration-300 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-600 flex items-center justify-center shrink-0">
                        <Home className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                            Owner Observation Updates
                        </h3>
                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">Submitted by the pet owner from their account. Newest first.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {unreviewed > 0 && (
                        <span className="px-2.5 py-1.5 rounded-xl bg-sky-600 text-white text-xs font-black shadow-xs">{unreviewed} New</span>
                    )}
                    <span className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-800 text-xs font-bold border border-gray-200">
                        {updates.length} {updates.length === 1 ? 'Update' : 'Updates'}
                    </span>
                </div>
            </div>
            {updates.length === 0 ? (
                <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 text-center text-xs text-gray-400 font-medium">
                    The owner has not submitted an update yet. Owner submissions appear here automatically.
                </div>
            ) : (
                <ul className="space-y-3">
                    {updates.map((u) => (
                        <OwnerUpdateCard key={u.update_id} followupId={followupId} update={u} canReview={canReview} onReviewed={onReviewed} />
                    ))}
                </ul>
            )}
        </div>
    );
};

export default SubdOwnerUpdatesSection;

