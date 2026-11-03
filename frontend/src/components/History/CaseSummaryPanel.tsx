import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { getReportStatusBadgeStyle } from '../../utils/reportStatus';
import { cloudinaryResized } from '../../utils/cloudinaryImage';
import { visibilityBadge } from '../../utils/reportVisibility';
import { printCaseRecord } from '../../utils/casePrint';
import {
    aiMadeLikelihood, aiPhotoDetailsText, behaviorFound, caseOutcome, casePet, caseRejection, caseVerification, formatCaseDate,
    knownText, observationStatusLabel, orderedComments, returnMethodLabel, reunionConfirmedLabel, type CaseSummaryReport,
} from '../../utils/caseSummary';

// Read-only summary of a case for the history pages (docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md).
// Names only: no phone numbers, emails or addresses, whatever the API returns.

function AiTag() {
    return <span className="ml-0.5 align-middle px-1.5 py-px rounded-md bg-violet-50 text-violet-600 border border-violet-100 text-[9px] font-black uppercase tracking-wider">AI</span>;
}

/** A reported value, with the AI's suggestion shown only when nothing was reported or it differs. */
function reportedWithAi(reported?: string | null, ai?: string | null): ReactNode {
    const r = knownText(reported);
    const a = knownText(ai);
    if (!r && !a) return null;
    if (!r) return <>{a} <AiTag /></>;
    if (!a || a.toLowerCase() === r.toLowerCase()) return r;
    return <>{r} <span className="text-gray-400 font-medium">· {a} <AiTag /></span></>;
}

type Row = [label: string, value: ReactNode];

function Rows({ rows }: { rows: Row[] }) {
    const shown = rows.filter(([, value]) => value !== null && value !== undefined && value !== '');
    if (shown.length === 0) return null;
    return (
        <dl className="space-y-2.5">
            {shown.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 text-sm leading-relaxed">
                    <dt className="text-gray-500">{label}</dt>
                    <dd className="text-gray-900 break-words min-w-0">{value}</dd>
                </div>
            ))}
        </dl>
    );
}

const hasValue = (rows: Row[]) => rows.some(([, value]) => value !== null && value !== undefined && value !== '');

function Section({ title, rows = [], note, testId, children }: { title: string; rows?: Row[]; note?: ReactNode; testId: string; children?: ReactNode }) {
    if (!hasValue(rows) && !note && !children) return null;
    return (
        <section data-summary-section={testId} className="min-w-0 border-t border-gray-100 py-5">
            <h4 className="text-sm font-semibold text-gray-900 mb-4">{title}</h4>
            <Rows rows={rows} />
            {children}
            {note && <p className="mt-3 text-[11px] font-medium text-gray-500">{note}</p>}
        </section>
    );
}

interface CaseSummaryPanelProps {
    report: CaseSummaryReport;
    /** Where another report of the case opens (merged or split reports); plain text when not given. */
    reportHref?: (reportId: number) => string;
    /** Show "Print / Save as PDF" (officials' pages): a formal case record built from this report (utils/casePrint.ts). */
    printable?: boolean;
}

export default function CaseSummaryPanel({ report, reportHref, printable }: CaseSummaryPanelProps) {
    const [printing, setPrinting] = useState(false);
    const print = async () => {
        if (!report.report_id || printing) return;
        setPrinting(true);
        try {
            await printCaseRecord({ report });
        } finally {
            setPrinting(false);
        }
    };
    const outcome = caseOutcome(report);
    const verification = caseVerification(report);
    const rejection = caseRejection(report);
    const count = report.animal_count && report.animal_count > 0 ? report.animal_count : null;
    const aiPriority = knownText(report.ai_suggested_priority);
    const behaviors = behaviorFound(report);
    const observation = report.observation;
    const warnings = report.issued_warnings?.length ? report.issued_warnings : report.latest_warning ? [report.latest_warning] : [];
    const latestWarning = report.latest_warning || warnings[0] || null;
    const pet = casePet(report);
    const returned = report.owner_return;
    const disputes = report.disputes || [];
    const merged = report.merged_reports || [];
    const splitInto = report.split_children_count && report.split_children_count > 0 ? report.split_children_count : null;
    const visibility = visibilityBadge(report);
    const comments = orderedComments(report.comments);
    const commentsClosed = report.comments_open === false || outcome.closed;
    const aiPhotoStatus = knownText(report.ai_photo_status);
    const aiLikelihood = aiMadeLikelihood(report.ai_photo_likelihood);

    const reportLink = (reportId: number, label?: string | null) => {
        const text = `#${reportId}${knownText(label) ? ` · ${label}` : ''}`;
        return reportHref
            ? <Link key={reportId} to={reportHref(reportId)} className="text-role-hover underline underline-offset-2 hover:no-underline">{text}</Link>
            : <span key={reportId}>{text}</span>;
    };

    return (
        <div data-case-summary className="@container bg-white rounded-2xl border border-gray-200 p-5 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <h3 className="text-base font-semibold text-gray-900">Case Summary</h3>
                <div className="flex flex-wrap items-center gap-2">
                    {printable && report.report_id && (
                        <button type="button" data-no-print data-print-case onClick={print} disabled={printing}
                            className="min-h-10 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 focus-visible:outline-2 focus-visible:outline-role disabled:opacity-60 disabled:cursor-wait cursor-pointer">
                            {printing ? 'Preparing…' : 'Print / Save as PDF'}
                        </button>
                    )}
                    <span className={`px-2.5 py-1 rounded-full border text-xs font-medium ${getReportStatusBadgeStyle(outcome.statusId)}`}>
                        {outcome.closed ? 'Closed' : 'Open'}
                    </span>
                </div>
            </div>
            <div className="grid grid-cols-1 @min-[640px]:grid-cols-2 gap-x-10">
                <Section testId="outcome" title={outcome.closed ? 'Final outcome' : 'Current status'} rows={[
                    ['Status', outcome.label],
                    [outcome.closed ? 'Closed on' : 'Since', formatCaseDate(outcome.reachedAt)],
                    ['Recorded by', outcome.recordedBy],
                    ['Remarks', outcome.remarks],
                ]} />
                <Section testId="verification" title={rejection ? rejection.label : 'Verification'}
                    rows={rejection ? [
                        ['Reason', rejection.reason],
                        ['Decided by', rejection.by],
                        ['Date', formatCaseDate(rejection.at)],
                    ] : [
                        ['Verified by', verification?.by ?? null],
                        ['Verified on', formatCaseDate(verification?.at)],
                        ['Notes', verification?.notes ?? null],
                    ]}
                    note={!rejection && !verification ? 'No verification recorded for this report.'
                        : !rejection && verification?.fromHistory ? 'Taken from the case history.' : undefined} />
                <Section testId="animal" title="Animal" rows={[
                    ['Type', reportedWithAi(report.animal_type, report.ai_animal_type)],
                    ['Count', count && count > 1 ? `${count} animals` : count ? '1 animal' : null],
                    ['Condition', knownText(report.condition)],
                    ['Breed', reportedWithAi(report.animal_breed, report.ai_possible_breed)],
                    ['Color', reportedWithAi(report.animal_color, report.ai_dominant_color)],
                    ['Coat pattern', reportedWithAi(null, report.ai_coat_pattern)],
                    ['Size', reportedWithAi(report.estimated_size, report.ai_estimated_size)],
                ]} />
                <Section testId="priority" title="Priority" rows={[
                    ['Priority', knownText(report.priority_level)],
                    ['AI suggested', aiPriority ? <>{aiPriority} <AiTag /></> : null],
                    ['AI reason', knownText(report.ai_suggested_priority_reason)],
                ]} note={aiPriority ? 'The AI only suggests; officials set the priority.' : undefined} />

                <Section testId="behavior" title="Behavior found" rows={[
                    ['Found', behaviors.length ? behaviors.join(', ') : null],
                    ['Finding', knownText(report.behavior_finding)],
                ]} note={behaviors.length || knownText(report.behavior_finding)
                    ? "Verified by an official; it counts toward the pet's bite and chasing history." : undefined} />
                <Section testId="observation" title="Owner observation" rows={observation ? [
                    ['Status', observationStatusLabel(observation.status)],
                    ['Started', formatCaseDate(observation.started_at)],
                    [observation.open ? 'Due' : 'Ended', formatCaseDate(observation.open ? observation.due_at : observation.ended_at)],
                    ['Extended', observation.extended
                        ? (observation.extension_days ? `Yes, by ${observation.extension_days} day${observation.extension_days === 1 ? '' : 's'}` : 'Yes, once') : null],
                    ['Extension reason', observation.extended ? knownText(observation.extension_reason) : null],
                    ['Closed by', observation.open ? null : knownText(observation.closed_by_name)],
                ] : []} />
                <Section testId="warnings" title="Warnings to the owner" rows={latestWarning ? [
                    ['Issued', `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`],
                    ['Latest', [knownText(latestWarning.warning_level), knownText(latestWarning.violation_type)].filter(Boolean).join(' · ') || null],
                    ['Issued on', formatCaseDate(latestWarning.issued_at || latestWarning.created_at)],
                    ['Issued by', knownText(latestWarning.issuer_name)],
                    ['Status', knownText(latestWarning.status)],
                ] : []} />
                <Section testId="pet" title="Pet and owner" rows={[
                    ['Pet', pet ? (
                        <span className="inline-flex items-center gap-2">
                            {pet.photoUrl && (
                                <img data-pet-photo src={cloudinaryResized(pet.photoUrl, 96)} alt={`${pet.name}, registered photo`} loading="lazy" decoding="async"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                    className="w-10 h-10 rounded-lg object-cover border border-gray-200 bg-gray-100 shrink-0" />
                            )}
                            {pet.name}
                        </span>
                    ) : null],
                    ['Breed', pet?.breed ?? null],
                    ['Owner', pet?.owner ?? null],
                    ['Match confirmed by', pet && report.review_status === 'Confirmed Match' && knownText(report.reviewed_by_name)
                        ? `${report.reviewed_by_name}${knownText(report.reviewed_by_role) ? ` (${report.reviewed_by_role})` : ''}` : null],
                    ['Returned to', knownText(returned?.owner_name)],
                    ['Returned on', formatCaseDate(returned?.returned_at)],
                    ['How', returned ? returnMethodLabel(returned.return_method) : null],
                    ['Reunion confirmed by', reunionConfirmedLabel(report.reunion_confirmed_by)],
                ]} />
                <Section testId="disputes" title={`Disputes (${disputes.length})`}>
                    {disputes.length > 0 && (
                        <ul className="space-y-3">
                            {disputes.map(d => (
                                <li key={d.dispute_id} data-dispute className="rounded-lg border border-gray-100 bg-white p-3">
                                    <Rows rows={[
                                        ['Status', knownText(d.status)],
                                        ['Filed by', [knownText(d.resident_name), formatCaseDate(d.created_at)].filter(Boolean).join(', ') || null],
                                        ['Pet', knownText(d.pet_name)],
                                        ['Reason', knownText(d.dispute_reason)],
                                        ['Reviewed by', [knownText(d.reviewer_name), formatCaseDate(d.resolved_at)].filter(Boolean).join(', ') || null],
                                        ['Review notes', knownText(d.reviewer_notes)],
                                    ]} />
                                </li>
                            ))}
                        </ul>
                    )}
                </Section>
                <Section testId="linked" title="Merged and split reports" rows={[
                    ['Merged into', report.duplicate_of_report_id ? reportLink(report.duplicate_of_report_id) : null],
                    ['Merged by', report.duplicate_of_report_id ? knownText(report.merged_by_name) : null],
                    ['Merged on', report.duplicate_of_report_id ? formatCaseDate(report.merged_at) : null],
                    ['Merge notes', report.duplicate_of_report_id ? knownText(report.merge_notes) : null],
                    ['Merged reports', merged.length
                        ? <span className="flex flex-wrap gap-x-3 gap-y-1">{merged.map(m => reportLink(m.report_id, m.landmark))}</span> : null],
                    ['Split from', report.split_from_report_id ? reportLink(report.split_from_report_id) : null],
                    ['Split into', splitInto ? `${splitInto} animal record${splitInto === 1 ? '' : 's'}` : null],
                ]} />

                <Section testId="visibility" title="Visibility" rows={[
                    ['Residents see it', visibility.label],
                    ['Decided by', knownText(report.visibility_decided_by_name)],
                    ['Decided on', formatCaseDate(report.visibility_decided_at)],
                    ['Reason', knownText(report.visibility_reason)],
                    ['Not public because', visibility.isPublic ? null : knownText(report.public_block_reason)],
                    ['Needs review', report.visibility_needs_review ? 'Yes, a leader should decide' : null],
                ]} note={visibility.hint} />
                <Section testId="ai-photo" title="AI photo check" rows={[
                    ['Result', aiPhotoStatus],
                    ['Likelihood AI-made', aiLikelihood],
                    ['Recommendation', knownText(report.ai_photo_recommendation)],
                    ['Details', aiPhotoDetailsText(report.ai_photo_details)],
                ]} note={aiPhotoStatus || aiLikelihood ? 'AI check, for reference only. Officials decide whether a photo is genuine.' : undefined} />
                <div className="@min-[640px]:col-span-2 min-w-0">
                    <Section testId="comments" title={`Comments (${comments.length})`}
                        note={comments.length === 0 ? 'No comments on this report.' : commentsClosed ? 'Comments are closed for this case.' : undefined}>
                        {comments.length > 0 && (
                            <ul className="space-y-2">
                                {comments.map(c => (
                                    <li key={c.comment_id} data-comment className={`rounded-lg border border-gray-100 bg-white p-3 ${c.isReply ? 'ml-6' : ''}`}>
                                        <p className="text-[11px] font-bold text-gray-500">
                                            {knownText(c.user_name) || 'Unknown user'}
                                            {formatCaseDate(c.created_at) && <span className="font-medium text-gray-400"> · {formatCaseDate(c.created_at)}</span>}
                                            {c.isReply && <span className="font-medium text-gray-400"> · reply</span>}
                                        </p>
                                        <p className="mt-1 text-xs font-medium text-gray-800 whitespace-pre-line break-words">{c.comment}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Section>
                </div>
            </div>
        </div>
    );
}
