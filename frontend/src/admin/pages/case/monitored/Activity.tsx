import { useState } from 'react';
import { House } from 'lucide-react';
import { Button } from '../../../components/Button';
import { EventTimeline } from '../../../components/Timeline';
import { activityOf } from '../../../data/monitored';
import type { Case } from '../../../data/types';
import type { OpenCaseDialog } from '../dialogState';

const SHOWN = 6;

/**
 * Everything that happened, newest first, in one list. It is a record, not a form: what the system and the residents did, and what the Leader did through the
 * page (a contact, a follow-up, asking the Barangay, linking two reports) is written here by itself. Nothing is typed in by hand.
 */
export function Activity({ c, now }: { c: Case; now: Date }) {
  const [all, setAll] = useState(false);
  const events = activityOf(c);
  const shown = all ? events : events.slice(0, SHOWN);

  return (
    <section className="sa-mc-sec" aria-labelledby="mc-activity" id="mc-activity">
      <div className="sa-mc-sec__head">
        <h2 id="mc-activity" className="sa-mc-sec__title">Activity <span className="sa-text-3">{events.length}</span></h2>
      </div>
      <EventTimeline events={shown} now={now} label="Activity" />
      {!all && events.length > SHOWN ? <p className="mt-3"><Button size="sm" variant="ghost" onClick={() => setAll(true)}>Show all {events.length}</Button></p> : null}
    </section>
  );
}

/**
 * How a report ends. Occasional, so it sits behind one line instead of at the top. The only recovery is the OWNER's confirmation: a Leader records what the
 * owner said (in person or by phone), never declares it.
 */
export function Resolve({ c, openDialog }: { c: Case; openDialog: OpenCaseDialog }) {
  if (c.status === 'closed') return null;
  const lost = c.category === 'lost_pet';
  return (
    <details className="sa-mc-more sa-mc-more--section">
      <summary>Resolve this report</summary>
      <ul className="sa-mc-list mt-3">
        {lost && c.lostPet?.alertId ? (
          <li className="sa-mc-row">
            <div className="min-w-0"><p className="sa-semibold">The pet is home</p><p className="sa-small sa-text-2">Only the owner can say this. Record what they told you, in person or by phone.</p></div>
            <Button size="sm" icon={House} onClick={() => openDialog({ kind: 'recovery' })}>Record the owner’s confirmation</Button>
          </li>
        ) : null}
        <li className="sa-mc-row">
          <div className="min-w-0"><p className="sa-semibold">{lost ? 'Stop monitoring without a recovery' : 'Close this report'}</p><p className="sa-small sa-text-2">Say why. You can reopen it later.</p></div>
          <Button size="sm" onClick={() => openDialog({ kind: 'close' })}>{lost ? 'Close without recovery' : 'Close report'}</Button>
        </li>
      </ul>
    </details>
  );
}
