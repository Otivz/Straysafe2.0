/**
 * Prints a warning letter exactly as it is shown on screen (the A4 <WarningLetterDocument>): the element is copied into a print
 * window with the page's own stylesheets, so the paper matches the screen. A draft keeps its DRAFT banner and watermark, which the
 * stylesheet repeats on every printed page. Returns false when the browser blocked the print window.
 */
export function printWarningLetter(container: HTMLElement | null, title: string): boolean {
  const paper = container?.querySelector<HTMLElement>('.ss-a4-paper');
  if (!paper) return false;
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  const styles = Array.from(document.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style, link[rel="stylesheet"]'))
    .map((n) => (n instanceof HTMLLinkElement ? `<link rel="stylesheet" href="${n.href}">` : n.outerHTML))
    .join('');
  const copy = paper.cloneNode(true) as HTMLElement;
  copy.style.transform = '';
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>${styles}
<style>@page{size:A4;margin:18mm}body{margin:0;background:#fff}</style></head><body>${copy.outerHTML}
<script>window.onload=function(){window.focus();window.print()}</script></body></html>`);
  w.document.close();
  return true;
}
