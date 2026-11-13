import { useEffect } from 'react';
import { Bell, Pause, Pencil, Play } from 'lucide-react';
import { plural } from '../../../../preview/lib/format';
import { Badge } from '../../../components/Badge';
import { Button } from '../../../components/Button';
import { useToast } from '../../../components/toast';
import { cadence, ending, when } from '../../../data/alertSchedule';
import type { Tone } from '../../../data/constants';
import { useAdminData } from '../../../data/context';
import { subjectEnd } from '../../../data/monitored';
import type { AlertStatus, Case, CaseAlert } from '../../../data/types';
import { useSubmit } from '../../../lib/useSubmit';
import type { OpenCaseDialog } from '../dialogState';

const STATUS: Record<AlertStatus, { label: string; tone: Tone }> = {
  scheduled: { label: 'Scheduled', tone: 'brand' },
  active: { label: 'Repeating', tone: 'brand' },
  paused: { label: 'Paused', tone: 'amber' },
  finished: { label: 'Sent', tone: 'sage' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const live = (a: CaseAlert) => a.status === 'scheduled' || a.status === 'active' || a.status === 'paused';

function AlertRow({ a, c, now, openDialog }: { a: CaseAlert; c: Case; now: Date; openDialog: OpenCaseDialog }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending: busy, error, run } = useSubmit();
  useEffect(() => { if (error) toast.error(error); }, [error, toast]);
  const s = STATUS[a.status];
  const label = a.status === 'finished' && a.schedule.mode === 'repeat' ? 'Finished' : s.label;
  const open = c.status !== 'closed';
  const repeat = a.schedule.mode === 'repeat';
  const meta = [
    cadence(a.schedule, now), ending(a.schedule, subjectEnd(c), now),
    repeat && a.nextSendAt && a.status !== 'paused' ? `next ${when(new Date(a.nextSendAt), now)}` : '',
    a.sendsDone ? `sent ${plural(a.sendsDone, 'time')}` : a.status === 'cancelled' ? '' : 'not sent yet',
    a.stopReason ?? '',
  ].filter(Boolean).join(' · ');

  const act = async (type: 'alert/pause' | 'alert/resume', done: string) => {
    if (await run(() => dispatch({ type, id: c.id, alertId: a.id }))) toast.success(done);
  };

  return (
    <li className="sa-mc-alert">
      <span className="sa-mc-alert__icon" aria-hidden="true"><Bell size={18} strokeWidth={1.9} /></span>
      <div className="min-w-0">
        <p className="sa-mc-alert__title">{a.title}<Badge tone={s.tone}>{label}</Badge></p>
        <p className="sa-mc-alert__meta">{meta}</p>
        <p className="sa-mc-alert__meta">{a.message}</p>
      </div>
      {open && live(a) ? (
        <div className="sa-mc-alert__acts">
          {repeat && a.status !== 'paused' ? <Button variant="ghost" size="sm" icon={Pause} loading={busy} onClick={() => { void act('alert/pause', 'Paused. Nothing goes out until you resume it.'); }}>Pause</Button> : null}
          {a.status === 'paused' ? <Button variant="ghost" size="sm" icon={Play} loading={busy} onClick={() => { void act('alert/resume', 'Resumed. Sends missed while it was paused are not caught up.'); }}>Resume</Button> : null}
          <Button variant="ghost" size="sm" icon={Pencil} disabled={busy} onClick={() => openDialog({ kind: 'alert', alertId: a.id })}>Edit</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => openDialog({ kind: 'stopAlert', alertId: a.id })}>{a.sendsDone ? 'Stop' : 'Cancel'}</Button>
        </div>
      ) : null}
      {a.sends.length > 0 ? (
        <details className="sa-mc-alert__history">
          <summary>History ({a.sendsDone})</summary>
          <ol>
            {a.sends.map((x) => (
              <li key={x.slotAt}>
                {when(new Date(x.sentAt), now)}: sent to {plural(x.recipients, 'resident')}
                {x.skippedBefore ? ` (${plural(x.skippedBefore, 'planned send')} missed while the server was down were not sent late)` : ''}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </li>
  );
}

/**
 * The notification alerts sent or scheduled about this case, newest first: what each one says, when it goes out and how it ends, what it did so far.
 * Shown once there is one (the situation's Alerts tile sends the first). They are notifications only: they never post to Community or change the notice.
 */
export function Alerts({ c, now, openDialog }: { c: Case; now: Date; openDialog: OpenCaseDialog }) {
  if (c.alerts.length === 0) return null;
  const open = c.status !== 'closed';
  return (
    <section className="sa-mc-sec" aria-labelledby="mc-alerts-h" id="mc-alerts">
      <div className="sa-mc-sec__head">
        <h2 id="mc-alerts-h" className="sa-mc-sec__title">Notification alerts <span className="sa-text-3">{c.alerts.length}</span></h2>
        {open && !c.sensitive ? <Button variant="link" size="sm" onClick={() => openDialog({ kind: 'alert' })}>Send another alert</Button> : null}
      </div>
      <p className="sa-hint mb-2">Notifications to residents. They never post to Community or change the notice.</p>
      <ul className="sa-mc-list sa-mc-alerts">
        {c.alerts.map((a) => <AlertRow key={a.id} a={a} c={c} now={now} openDialog={openDialog} />)}
      </ul>
    </section>
  );
}
