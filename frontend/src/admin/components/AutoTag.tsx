import { Sparkles } from 'lucide-react';

/** Marks a value the system filled in from existing records. It can always be edited; nothing the user typed is replaced. */
export function AutoTag() {
  return <span className="sa-autotag" title="Filled in for you from existing records. Edit it if it is wrong."><Sparkles size={11} aria-hidden="true" />Auto-filled</span>;
}

/** Marks a value suggested by the photo check (POST /reports/analyze-media). Review it: the person's own entry always wins. */
export function AiSuggestedTag() {
  return <span className="sa-autotag" title="Suggested from the photo by AI. Review it and change it if it is wrong."><Sparkles size={11} aria-hidden="true" />AI suggested</span>;
}
