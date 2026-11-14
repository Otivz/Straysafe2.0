/**
 * The warning letter, as it is previewed and printed (docs/01-system/COMPLAINT_MANAGEMENT.md). Built from the complaint, the
 * confirmed rule (its title, reference and summary), the subdivision's name and the Leader's name. It never names the complainant.
 * The wording is StraySafe's neutral default until the subdivision confirms its own (an open stakeholder question).
 */
import { fromServer } from '../../live/dates';
import { lc } from './model';

export interface LetterInput {
  kind: 'letter_1' | 'letter_2';
  subdivision: string;
  leaderName: string;
  letterDate: string;              // YYYY-MM-DD
  respondentName: string;
  respondentAddress: string;
  ruleTitle: string;
  ruleReference: string | null;
  ruleSummary: string | null;
  incidentAt: string;              // server time
  where: string;
  summonsAt?: string | null;       // datetime-local value or server time
  summonsPlace?: string | null;
}

export interface Letter { heading: string; date: string; to: string[]; subject: string; paragraphs: string[]; signature: string[] }

const longDate = new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'long', year: 'numeric' });
const clock = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit' });
const asDate = (value: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : (fromServer(value) || value));

export function letterOf(x: LetterInput): Letter {
  const second = x.kind === 'letter_2';
  const seen = asDate(x.incidentAt);
  const paragraphs = [
    `On ${longDate.format(seen)}, at about ${clock.format(seen)}, at ${x.where}, the subdivision verified the following involving an animal in your care: ${lc(x.ruleTitle)}. `
      + (x.ruleReference ? `This breaks the subdivision rule ${x.ruleReference}.` : 'This breaks a subdivision rule.'),
    `This is your ${second ? 'second' : 'first'} warning under this rule.${x.ruleSummary ? ` ${x.ruleSummary}` : ''}`,
  ];
  if (second) {
    const at = x.summonsAt ? asDate(x.summonsAt) : null;
    paragraphs.push(`You are asked to come to the ${x.summonsPlace || 'subdivision office'}${at && !Number.isNaN(at.getTime()) ? ` on ${longDate.format(at)} at ${clock.format(at)}` : ''} to talk about it with the Subdivision Leader.`);
  }
  paragraphs.push(second
    ? 'If it happens again, the subdivision’s rules provide for a fine and a meeting at the Barangay.'
    : 'If it happens again, the subdivision’s rules provide for a second warning and a summons to the subdivision office.');
  return {
    heading: `${x.subdivision} · Office of the Subdivision Leader`,
    date: longDate.format(asDate(x.letterDate)),
    to: [x.respondentName, x.respondentAddress],
    subject: `${second ? 'Second' : 'First'} warning: ${x.ruleTitle}`,
    paragraphs,
    signature: [x.leaderName, 'Subdivision Leader'],
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Opens the letter in a print window (the browser's own print dialog: printer or PDF). */
export function printLetter(letter: Letter): void {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${esc(letter.subject)}</title>
<style>body{font:15px/1.65 Georgia,'Times New Roman',serif;color:#111;max-width:640px;margin:48px auto;padding:0 24px}
h1{font-size:15px;font-weight:600;margin:0 0 24px}p{margin:0 0 14px}.subject{font-weight:700}.receipt{margin-top:40px;border-top:1px dashed #999;padding-top:10px;font-size:13px}
@media print{body{margin:24mm auto}}</style></head><body>
<h1>${esc(letter.heading)}</h1><p>${esc(letter.date)}</p><p>${letter.to.map(esc).join('<br>')}</p><p class="subject">${esc(letter.subject)}</p>
${letter.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}<p style="margin-top:28px">${letter.signature.map(esc).join('<br>')}</p>
<p class="receipt">Received by: ________________________ &nbsp; Date and time: ________________</p>
<script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}
