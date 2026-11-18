/**
 * How a warning letter's text is laid out on screen. The SAME rules as the PDF and the DOCX (backend/app/services/warning_letters.py:
 * is_heading, body_blocks), so all three show the same thing: every line the author wrote is kept, line breaks included. Only a letter
 * issued before the layout marker existed (`legacy`) has its old header, "Date Issued"/"TO:" lines and "Issued by:" block hidden, because
 * the letter prints its own; such letters therefore look exactly as they always did.
 */
export type BodyBlock =
  | { kind: 'subject'; text: string }
  | { kind: 'section'; heading: string; text: string }
  | { kind: 'para'; text: string };

const SECTION_TITLES = new Set([
  'violation details', 'applicable subdivision policy', 'applicable policy', 'required corrective action', 'required action & summons schedule',
  'what was reported', 'subdivision policy', 'what we ask you to do', 'office summons',
]);
const HEADING_WORDS = /^[A-Z][A-Za-z/&()' -]*$/;

export function isHeading(first: string, lineCount: number): boolean {
  if (SECTION_TITLES.has(first.replace(/:$/, '').trim().toLowerCase())) return true;
  if (lineCount < 2 || first.length > 48) return false;
  if (first.endsWith(':')) return true;
  return HEADING_WORDS.test(first) && first.length <= 40 && first.split(/\s+/).length <= 6;
}

/** The old header/recipient/signature lines that letters issued before the layout marker carry in their text. */
function isLegacyChrome(lines: string[]): boolean {
  const first = lines[0];
  if (first.endsWith('Office of the Subdivision Leader')) return true;
  if (lines.every((ln) => /^(Date Issued|Warning Reference|Case Reference|TO|Address):/i.test(ln))) return true;
  return /^Issued by:$/i.test(first) && lines.length <= 4;
}

export function bodyBlocks(body: string, fallbackSubject: string, legacy = false): BodyBlock[] {
  const out: BodyBlock[] = [];
  for (const raw of (body || '').replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    let lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    if (legacy && isLegacyChrome(lines)) continue;
    if (/^SUBJECT:/i.test(lines[0])) {
      out.push({ kind: 'subject', text: lines[0].replace(/^SUBJECT:\s*/i, '').trim() });
      lines = lines.slice(1);
      if (lines.length === 0) continue;
    }
    if (isHeading(lines[0], lines.length)) out.push({ kind: 'section', heading: lines[0].replace(/:$/, '').trim(), text: lines.slice(1).join('\n') });
    else out.push({ kind: 'para', text: lines.join('\n') });
  }
  if (!out.slice(0, 2).some((b) => b.kind === 'subject') && fallbackSubject.trim()) out.unshift({ kind: 'subject', text: fallbackSubject.trim() });
  return out;
}
