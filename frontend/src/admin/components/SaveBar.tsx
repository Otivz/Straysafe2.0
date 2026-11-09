import { Button } from './Button';

/** Sticky action bar for forms that edit in place. Save is enabled only when something changed. */
export function SaveBar({ dirty, pending, label, onDiscard }: { dirty: boolean; pending: boolean; label: string; onDiscard: () => void }) {
  return (
    <div className="sa-savebar">
      <span className="sa-small sa-text-2" role="status">{dirty ? 'You have unsaved changes.' : 'No unsaved changes.'}</span>
      <span className="flex gap-2">
        <Button disabled={!dirty || pending} onClick={onDiscard}>Discard</Button>
        <Button type="submit" variant="primary" disabled={!dirty} loading={pending}>{label}</Button>
      </span>
    </div>
  );
}
