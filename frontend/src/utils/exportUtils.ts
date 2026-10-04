/** Small, dependency-free export helpers (CSV download + print only a part of the page). */

type Cell = string | number | boolean | null | undefined;

const csvCell = (v: Cell): string => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Downloads a UTF-8 CSV (with BOM so Excel shows ñ / accents correctly). */
export const downloadCsv = (filename: string, headers: string[], rows: Cell[][]) => {
    const content = [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const todayStamp = () => new Date().toISOString().slice(0, 10);

export const escapeHtml = (v: Cell): string =>
    (v === null || v === undefined ? '' : String(v))
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Prints the given HTML in a hidden iframe (no sidebar / navbar / buttons).
 * When `copyAppStyles` is true the app's stylesheets are copied so Tailwind classes keep working.
 */
export const printHtml = (title: string, bodyHtml: string, copyAppStyles = false, extraCss = '') => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); return; }

    const styles = copyAppStyles
        ? Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map((n) => n.outerHTML).join('\n')
        : '';
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${styles}
<style>
  @page { margin: 12mm; }
  html, body { background: #fff !important; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print, [data-no-print] { display: none !important; }
  ${extraCss}
</style></head><body>${bodyHtml}</body></html>`);
    doc.close();

    const go = () => {
        win.focus();
        win.print();
        setTimeout(() => frame.remove(), 1500);
    };
    // Wait for copied stylesheets and images before printing
    const imgs = Array.from(doc.images);
    Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(null); }))))
        .then(() => setTimeout(go, copyAppStyles ? 400 : 100));
};

/** Prints one element of the current page with the app's styles (e.g. a certificate or a case report). */
export const printElementById = (elementId: string, title: string) => {
    const el = document.getElementById(elementId);
    if (!el) return false;
    printHtml(title, `<div style="max-width:900px;margin:0 auto">${el.outerHTML}</div>`, true,
        '* { box-shadow: none !important; } [class*="overflow-y-auto"], [class*="max-h-"] { max-height: none !important; overflow: visible !important; }');
    return true;
};
