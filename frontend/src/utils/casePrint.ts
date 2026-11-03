import { api } from './api';
import { cloudinaryResized } from './cloudinaryImage';
import { escapeHtml, printHtml } from './exportUtils';
import {
    behaviorFound, caseOutcome, casePet, caseRejection, caseVerification, formatCaseDate, knownText,
    observationStatusLabel, returnMethodLabel, reunionConfirmedLabel, type CaseSummaryReport,
} from './caseSummary';

// Print / Save as PDF of a case record (docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md, Phase 6).
// A formal document built from the same report the official sees on screen (so never more than their role may see),
// minus what a paper copy should not carry (decided by the developer, 2026-11-03): comments, dispute names / reasons /
// review notes, the observation's extension reason, the visibility setting, the AI photo check and AI priority reason,
// and the incident photos. Owner names, the pet's registered photo and officials' remarks stay.

const ROLE_NAMES: Record<number, string> = { 2: 'Subdivision Leader', 3: 'Barangay Staff', 4: 'Administrator' };
const CATEGORY_NAMES: Record<number, string> = {
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk', 4: 'Roaming Animal', 5: 'Animal Rescue Needed', 6: 'Lost Pet',
};

/** What the printout leaves out; listed on the document so a reader knows the paper copy is not the full file. */
export const NOT_PRINTED = 'comments, dispute details (names, reasons and review notes), the observation extension reason, ' +
    'report visibility, AI photo checks and AI reasoning, and photos of the incident';

/** The signed-in official as this browser knows them; used only when the server can't be asked. */
function storedOfficial(): { name: string; role: string } | null {
    const keys = window.location.pathname.startsWith('/admin') ? ['admin_user', 'staff_user'] : ['staff_user', 'admin_user'];
    for (const key of keys) {
        try {
            const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
            const user = raw ? JSON.parse(raw) : null;
            if (user?.name && ROLE_NAMES[user.role_id]) return { name: user.name, role: ROLE_NAMES[user.role_id] };
        } catch { /* unreadable storage: no name */ }
    }
    return null;
}

/** A CSS string literal, for @page margin boxes. */
const cssString = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;

type Cell = string | null | undefined;
const esc = (value: Cell) => escapeHtml(value ?? '');

/** A label/value table; rows without a value are left out. */
function details(rows: [string, Cell, string?][]): string {
    const shown = rows.filter(([, value]) => knownText(value ?? null));
    if (!shown.length) return '';
    return `<table class="kv">${shown.map(([label, value, note]) =>
        `<tr><th>${esc(label)}</th><td>${esc(value)}${note ? ` <span class="note">${esc(note)}</span>` : ''}</td></tr>`).join('')}</table>`;
}

/** A reported value, marking an AI suggestion that was used or that differs. */
function withAi(reported?: string | null, ai?: string | null): [Cell, string?] {
    const r = knownText(reported);
    const a = knownText(ai);
    if (!r && !a) return [null];
    if (!r) return [a, '(AI suggestion)'];
    if (!a || a.toLowerCase() === r.toLowerCase()) return [r];
    return [r, `(AI suggested: ${a})`];
}

/** The document body: numbered sections, only those with something to say. */
export function caseRecordHtml(report: CaseSummaryReport, printedBy: string, printedAt: string, barangay: string): string {
    const outcome = caseOutcome(report);
    const verification = caseVerification(report);
    const rejection = caseRejection(report);
    const pet = casePet(report);
    const observation = report.observation;
    const warnings = report.issued_warnings?.length ? report.issued_warnings : report.latest_warning ? [report.latest_warning] : [];
    const disputes = report.disputes || [];
    const merged = report.merged_reports || [];
    const behaviors = behaviorFound(report);
    const count = report.animal_count && report.animal_count > 0 ? report.animal_count : null;
    const returned = report.owner_return;

    const sections: [string, string][] = [];
    const add = (title: string, body: string) => { if (body.trim()) sections.push([title, body]); };

    add(outcome.closed ? 'Case Outcome' : 'Case Status', details([
        ['Status', outcome.label],
        [outcome.closed ? 'Date closed' : 'Status since', formatCaseDate(outcome.reachedAt)],
        ['Recorded by', outcome.recordedBy],
        ['Remarks', outcome.remarks],
    ]));
    if (rejection) {
        add(rejection.label, details([['Reason', rejection.reason], ['Decided by', rejection.by], ['Date', formatCaseDate(rejection.at)]]));
    } else {
        add('Verification', verification ? details([
            ['Verified by', verification.by],
            ['Date verified', formatCaseDate(verification.at), verification.fromHistory ? '(from the case history)' : undefined],
            ['Notes', verification.notes],
        ]) : '<p class="empty">No verification was recorded for this report.</p>');
    }
    const [breed, breedNote] = withAi(report.animal_breed, report.ai_possible_breed);
    const [color, colorNote] = withAi(report.animal_color, report.ai_dominant_color);
    const [size, sizeNote] = withAi(report.estimated_size, report.ai_estimated_size);
    const [type, typeNote] = withAi(report.animal_type, report.ai_animal_type);
    const [pattern, patternNote] = withAi(null, report.ai_coat_pattern);
    add('Animal', details([
        ['Type', type, typeNote],
        ['Number of animals', count ? String(count) : null],
        ['Condition', knownText(report.condition)],
        ['Breed', breed, breedNote],
        ['Color', color, colorNote],
        ['Coat pattern', pattern, patternNote],
        ['Size', size, sizeNote],
    ]));
    add('Priority', details([
        ['Priority', knownText(report.priority_level)],
        ['AI suggestion', knownText(report.ai_suggested_priority), '(for reference; officials set the priority)'],
    ]));
    if (behaviors.length || knownText(report.behavior_finding)) {
        add('Behavior Found', details([
            ['Confirmed behavior', behaviors.join(', ') || null],
            ['Finding', knownText(report.behavior_finding)],
        ]) + '<p class="small">Confirmed by an official; counted in the pet\u2019s bite and chasing history.</p>');
    }
    if (observation) {
        add('Owner Observation', details([
            ['Status', observationStatusLabel(observation.status)],
            ['Started', formatCaseDate(observation.started_at)],
            [observation.open ? 'Due' : 'Ended', formatCaseDate(observation.open ? observation.due_at : observation.ended_at)],
            ['Extended', observation.extended ? (observation.extension_days ? `Yes, by ${observation.extension_days} day${observation.extension_days === 1 ? '' : 's'}` : 'Yes') : null],
            ['Closed by', observation.open ? null : knownText(observation.closed_by_name)],
        ]));
    }
    if (warnings.length) {
        add(`Warnings Issued to the Owner (${warnings.length})`, `<table class="grid"><thead><tr><th>Date issued</th><th>Level</th><th>Violation</th><th>Issued by</th><th>Status</th></tr></thead><tbody>${
            warnings.map(w => `<tr><td>${esc(formatCaseDate(w.issued_at || w.created_at))}</td><td>${esc(w.warning_level)}</td><td>${esc(w.violation_type)}</td><td>${esc(w.issuer_name)}</td><td>${esc(w.status)}</td></tr>`).join('')
        }</tbody></table>`);
    }
    if (pet || returned) {
        const photo = pet?.photoUrl ? `<img class="pet-photo" src="${esc(cloudinaryResized(pet.photoUrl, 240))}" alt="${esc(pet.name)}, registered photo">` : '';
        add('Pet and Owner', `<div class="pet">${photo}<div>${details([
            ['Pet', pet?.name],
            ['Breed', pet?.breed],
            ['Owner', pet?.owner],
            ['Match confirmed by', pet && report.review_status === 'Confirmed Match' && knownText(report.reviewed_by_name)
                ? `${report.reviewed_by_name}${knownText(report.reviewed_by_role) ? ` (${report.reviewed_by_role})` : ''}` : null],
            ['Returned to', knownText(returned?.owner_name)],
            ['Date returned', formatCaseDate(returned?.returned_at)],
            ['Manner of return', returned ? returnMethodLabel(returned.return_method) : null],
            ['Return confirmed by', reunionConfirmedLabel(report.reunion_confirmed_by)],
        ])}</div></div>`);
    }
    if (disputes.length) {
        add(`Disputes (${disputes.length})`, `<table class="grid"><thead><tr><th>Dispute</th><th>Date filed</th><th>Status</th><th>Date resolved</th></tr></thead><tbody>${
            disputes.map((d, i) => `<tr><td>No. ${i + 1}</td><td>${esc(formatCaseDate(d.created_at))}</td><td>${esc(d.status)}</td><td>${esc(formatCaseDate(d.resolved_at) || '\u2014')}</td></tr>`).join('')
        }</tbody></table>`);
    }
    const splitInto = report.split_children_count && report.split_children_count > 0 ? report.split_children_count : null;
    add('Related Reports', details([
        ['Merged into', report.duplicate_of_report_id ? `Report #${report.duplicate_of_report_id}` : null],
        ['Merged by', report.duplicate_of_report_id ? knownText(report.merged_by_name) : null],
        ['Date merged', report.duplicate_of_report_id ? formatCaseDate(report.merged_at) : null],
        ['Merge notes', report.duplicate_of_report_id ? knownText(report.merge_notes) : null],
        ['Reports merged into this case', merged.length ? merged.map(m => `#${m.report_id}`).join(', ') : null],
        ['Split from', report.split_from_report_id ? `Report #${report.split_from_report_id}` : null],
        ['Split into', splitInto ? `${splitInto} animal record${splitInto === 1 ? '' : 's'}` : null],
    ]));

    const category = report.category_id ? CATEGORY_NAMES[report.category_id] : null;
    return `
<div class="case-record">
<header class="doc-head">
  <p class="org">StraySafe · ${esc(barangay)}</p>
  <h1>Animal Incident Case Record</h1>
  <table class="facts"><tr>
    <td><span>Report No.</span>${esc(`#${report.report_id ?? ''}`)}</td>
    <td><span>Category</span>${esc(category || 'Not recorded')}</td>
    <td><span>Date reported</span>${esc(formatCaseDate(report.created_at) || 'Not recorded')}</td>
  </tr><tr>
    <td><span>Status</span>${esc(outcome.label)}${outcome.closed ? ' (closed)' : ''}</td>
    <td colspan="2"><span>Location</span>${esc(knownText(report.landmark) || 'Not recorded')}</td>
  </tr></table>
</header>
${sections.map(([title, body], i) => `<section><h2><span class="num">${i + 1}.</span> ${esc(title)}</h2>${body}</section>`).join('\n')}
<section class="closing">
  <p class="small"><strong>Not included in this printout:</strong> ${esc(NOT_PRINTED)}. They remain in StraySafe.</p>
  <table class="sign"><tr>
    <td><div class="line"></div><strong>${esc(printedBy)}</strong><br>Prepared by · ${esc(printedAt)}</td>
    <td><div class="line"></div><strong>&nbsp;</strong><br>Noted by (name, position and signature)</td>
  </tr></table>
  <p class="small privacy">This record contains personal information. Keep it with the barangay's files and handle it under the Data Privacy Act of 2012 (RA 10173).</p>
</section>
</div>`;
}

const DOC_CSS = `
html, body { margin: 0; background: #fff; color: #111827; font: 10.5pt/1.45 'Segoe UI', Arial, sans-serif; }
.case-record { max-width: 7.4in; margin: 0 auto; }
.doc-head { border-bottom: 2.5px double #111827; padding-bottom: 10px; margin-bottom: 14px; }
.org { margin: 0; font-size: 8.5pt; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #4b5563; }
h1 { margin: 2px 0 10px; font: 700 19pt/1.2 Georgia, 'Times New Roman', serif; color: #111827; }
.facts { width: 100%; border-collapse: collapse; }
.facts td { border: 1px solid #9ca3af; padding: 5px 8px; vertical-align: top; font-weight: 600; width: 33%; }
.facts td span { display: block; font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }
section { margin: 0 0 12px; break-inside: avoid; }
h2 { margin: 0 0 5px; padding-bottom: 3px; border-bottom: 1px solid #111827; font: 700 11.5pt/1.3 Georgia, 'Times New Roman', serif; }
h2 .num { display: inline-block; min-width: 1.4em; }
table.kv { width: 100%; border-collapse: collapse; }
table.kv th { width: 34%; text-align: left; font-weight: 600; color: #4b5563; padding: 3px 8px 3px 0; vertical-align: top; }
table.kv td { padding: 3px 0; vertical-align: top; font-weight: 600; }
table.kv tr + tr th, table.kv tr + tr td { border-top: 1px dotted #d1d5db; }
table.grid { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
table.grid th, table.grid td { border: 1px solid #9ca3af; padding: 4px 6px; text-align: left; vertical-align: top; }
table.grid th { background: #f3f4f6; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; }
table.grid tr { break-inside: avoid; }
.note { font-weight: 400; color: #6b7280; font-size: 9pt; }
.small { font-size: 8.5pt; color: #4b5563; margin: 4px 0 0; }
.empty { margin: 2px 0; color: #4b5563; font-style: italic; }
.pet { display: flex; gap: 12px; align-items: flex-start; }
.pet > div { flex: 1; }
.pet-photo { width: 1.1in; height: 1.1in; object-fit: cover; border: 1px solid #9ca3af; }
.closing { margin-top: 18px; }
table.sign { width: 100%; margin-top: 28px; border-collapse: collapse; }
table.sign td { width: 50%; padding-right: 28px; vertical-align: top; font-size: 9pt; color: #374151; }
table.sign .line { border-top: 1px solid #111827; margin-bottom: 4px; }
.privacy { margin-top: 16px; }`;

export interface CasePrintOptions {
    report: CaseSummaryReport;
}

/**
 * Records the export in the audit log (best effort: printing still works if that fails), then prints the case record
 * on US Letter pages with a header and footer on every page.
 */
export async function printCaseRecord({ report }: CasePrintOptions): Promise<void> {
    const reportId = report.report_id;
    if (!reportId) return;
    let official = storedOfficial();
    let printedAt = new Date().toISOString();
    try {
        const res = await api.post(`/reports/${reportId}/print-log`, null, { timeout: 4000 });
        if (res.data?.printed_by) official = { name: res.data.printed_by, role: res.data.role };
        if (res.data?.printed_at) printedAt = res.data.printed_at;
    } catch {
        // The audit entry could not be written (offline, server error): the official still gets their printout.
    }

    const barangay = report.barangay_name ? `Barangay ${report.barangay_name}` : 'Barangay San Vicente';
    const when = formatCaseDate(printedAt) || '';
    const by = official ? `${official.name}, ${official.role}` : 'Official';

    const css = `
@page {
  size: letter portrait;
  margin: 0.75in 0.6in;
  @top-left { content: ${cssString(`StraySafe · ${barangay}`)}; font: 600 8pt 'Segoe UI', Arial, sans-serif; color: #6b7280; }
  @top-right { content: ${cssString(`Case Record · Report #${reportId}`)}; font: 600 8pt 'Segoe UI', Arial, sans-serif; color: #6b7280; }
  @bottom-left { content: ${cssString(`Printed by ${by} · ${when}`)}; font: 8pt 'Segoe UI', Arial, sans-serif; color: #6b7280; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt 'Segoe UI', Arial, sans-serif; color: #6b7280; }
}
${DOC_CSS}`;

    printHtml(`Case Record - Report #${reportId}`, caseRecordHtml(report, by, when, barangay), false, css);
}
