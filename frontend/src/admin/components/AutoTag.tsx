import { Sparkles } from 'lucide-react';

/** Marks a value the system filled in from existing records. It can always be edited; nothing the user typed is replaced. */
export function AutoTag() {
  return <span className="sa-autotag" title="Filled in for you from existing records. Edit it if it is wrong."><Sparkles size={11} aria-hidden="true" />Auto-filled</span>;
}
