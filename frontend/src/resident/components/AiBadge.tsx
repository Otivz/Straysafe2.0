import { Sparkles } from 'lucide-react';

/** Marks a value suggested from the photo by the photo check. The resident can change it; nothing they entered is replaced. */
export function AiBadge() {
  return (
    <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-[var(--rs-brand-soft,#fdecd3)] px-2 py-px align-middle text-[11px] font-semibold text-[var(--rs-brand-ink,#92400e)]" title="Suggested from the photo by AI. Review it and change it if it is wrong.">
      <Sparkles size={11} aria-hidden="true" />AI suggested
    </span>
  );
}
