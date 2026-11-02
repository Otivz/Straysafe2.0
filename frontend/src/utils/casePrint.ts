import { api } from './api';
import { cloudinaryResized } from './cloudinaryImage';
import { escapeHtml, printHtml } from './exportUtils';
import { formatCaseDate } from './caseSummary';

// Print / Save as PDF of a case record (docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md, Phase 6).
// The printout is a copy of the Case Summary panel the official sees on screen, so it never holds more than they may see.

const ROLE_NAMES: Record<number, string> = { 2: 'Subdivision Leader', 3: 'Barangay Staff', 4: 'Administrator' };
const MAX_PHOTOS = 4;

export interface CasePrintMedia {
    file_url?: string | null;
    media_type?: string | null;
    history_id?: number | null;
    holding_log_id?: number | null;
    is_evidence?: boolean | null;
}

/** Up to four of the report's own photos (not videos, documents, or later care-log and evidence attachments). */
export function printablePhotos(media?: CasePrintMedia[] | null): string[] {
    const isPhoto = (m: CasePrintMedia) => {
        const url = (m.file_url || '').toLowerCase();
        return !!url && m.media_type !== 'Video' && m.media_type !== 'Document' && !/\.(mp4|mov|avi|webm|pdf|docx?|txt)(\?|$)/.test(url);
    };
    const own = (media || []).filter(m => isPhoto(m) && !m.history_id && !m.holding_log_id && !m.is_evidence);
    return own.slice(0, MAX_PHOTOS).map(m => m.file_url as string);
}

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

export interface CasePrintOptions {
    reportId: number;
    panel: HTMLElement;
    media?: CasePrintMedia[] | null;
    barangayName?: string | null;
}

/**
 * Records the export in the audit log (best effort: printing still works if that fails), then prints the case record
 * on US Letter pages with a header and footer on every page.
 */
export async function printCaseRecord({ reportId, panel, media, barangayName }: CasePrintOptions): Promise<void> {
    let printedBy = storedOfficial();
    let printedAt = new Date().toISOString();
    try {
        const res = await api.post(`/reports/${reportId}/print-log`, null, { timeout: 4000 });
        if (res.data?.printed_by) printedBy = { name: res.data.printed_by, role: res.data.role };
        if (res.data?.printed_at) printedAt = res.data.printed_at;
    } catch {
        // The audit entry could not be written (offline, server error): the official still gets their printout.
    }

    const copy = panel.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('[data-no-print]').forEach(node => node.remove());
    // The print frame is never on screen, so a lazy image there would never load and the print would wait forever
    copy.querySelectorAll('img').forEach(img => { img.loading = 'eager'; img.removeAttribute('style'); });
    const barangay = barangayName ? `Barangay ${barangayName}` : 'Barangay San Vicente';
    const when = formatCaseDate(printedAt) || '';
    const by = printedBy ? `${printedBy.name} (${printedBy.role})` : 'an official';
    const photos = printablePhotos(media);

    const html = `
<header class="case-print-header">
  <p class="case-print-kicker">StraySafe · ${escapeHtml(barangay)}</p>
  <h1>Case Record · Report #${escapeHtml(reportId)}</h1>
  <p class="case-print-meta">Printed ${escapeHtml(when)} by ${escapeHtml(by)}</p>
</header>
${copy.outerHTML}
${photos.length ? `<section class="case-print-photos"><h2>Report photos</h2><div>${photos.map((url, i) =>
        `<img src="${escapeHtml(cloudinaryResized(url, 600))}" alt="Report photo ${i + 1}">`).join('')}</div></section>` : ''}
<p class="case-print-privacy">Contains personal information. Keep it with the barangay's records and handle it under the Data Privacy Act of 2012 (RA 10173).</p>`;

    const css = `
@page {
  size: letter portrait;
  margin: 0.7in 0.55in;
  @top-left { content: ${cssString(`StraySafe · ${barangay}`)}; font: 600 8pt 'Segoe UI', Arial, sans-serif; color: #64748b; }
  @top-right { content: ${cssString(`Case record · Report #${reportId}`)}; font: 600 8pt 'Segoe UI', Arial, sans-serif; color: #64748b; }
  @bottom-left { content: ${cssString(`Printed by ${by} · ${when}`)}; font: 8pt 'Segoe UI', Arial, sans-serif; color: #64748b; }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt 'Segoe UI', Arial, sans-serif; color: #64748b; }
}
html, body { margin: 0; }
/* The app's body background is a layered !important rule reading --bg-main, which an unlayered rule can't beat */
body { --bg-main: #ffffff; --text-primary: #1f2937; }
.case-print-header { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; }
.case-print-header h1 { font-size: 18pt; font-weight: 900; margin: 2px 0; color: #0f172a; }
.case-print-kicker { font-size: 8pt; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #64748b; margin: 0; }
.case-print-meta { font-size: 9pt; color: #334155; margin: 0; }
[data-case-summary] { border: 0 !important; padding: 0 !important; }
[data-summary-section]:not([data-summary-section="comments"]):not([data-summary-section="disputes"]), [data-comment], [data-dispute] { break-inside: avoid; }
a { color: inherit !important; text-decoration: none !important; }
.case-print-photos { break-inside: avoid; margin-top: 14px; }
.case-print-photos h2 { font-size: 9pt; font-weight: 900; letter-spacing: .12em; text-transform: uppercase; color: #64748b; margin: 0 0 6px; }
.case-print-photos div { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.case-print-photos img { width: 100%; aspect-ratio: 1; object-fit: cover; border: 1px solid #e2e8f0; border-radius: 6px; }
.case-print-privacy { margin-top: 14px; font-size: 8pt; color: #64748b; }`;

    printHtml(`Case Record - Report #${reportId}`, html, true, css);
}
