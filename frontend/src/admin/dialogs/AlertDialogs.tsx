import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { PawPrint, TriangleAlert, X } from 'lucide-react';
import { fmtDay, plural } from '../../preview/lib/format';
import { useNow } from '../../preview/lib/hooks';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Checkbox, Field, Input, Segmented, Select, Textarea } from '../components/form';
import { FormError } from '../components/layout';
import { useToast } from '../components/toast';
import {
  HEAVY_PER_DAY, MAX_SENDS, blankDraft, draftCadence, draftFrom, firstDayCount, inputSchedule, plannedSends, scheduleErrors, when, type DraftSchedule, type Unit,
} from '../data/alertSchedule';
import { useAdminData } from '../data/context';
import { heroOf, subjectEnd } from '../data/monitored';
import { placePhrase } from '../../preview/lib/place';
import type { AlertAudience, AlertDestination, AlertInput, AnimalType, Case, Notice } from '../data/types';
import { useSubmit } from '../lib/useSubmit';
import type { CaseDialogProps } from './BasicDialogs';

const TITLE_MAX = 60;
const MESSAGE_MAX = 180;
const MAX_TIMES = 12;
const NOUN: Partial<Record<AnimalType, string>> = { dog: 'dog', cat: 'cat', bird: 'bird' };

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`);
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
/** Where a found animal was found, in general words only (the reporter's exact place stays private). */
const generalArea = (c: Case) => { const a = c.location.area.split(' · ')[0].trim(); return a && a !== 'Not recorded' ? a : ''; };
const noticeIsLive = (c: Case, notices: Notice[]) => (c.category === 'lost_pet' ? c.lostPet?.notice?.status === 'active' : notices.some((n) => n.caseId === c.id && n.status === 'published'));

interface Choice<T extends string> { value: T; label: string; disabled?: boolean }

/** The pet's own name, when it is known (an older report without a registered pet has none: "the pet" is said instead). */
const petNameOf = (c: Case) => { const h = heroOf(c); return c.category === 'lost_pet' && h.named ? h.name : null; };

/** Where a tap can go: the Community notice or its form when the notice is published; otherwise the alert itself, in the resident's notifications. */
function destinationsOf(c: Case, noticeLive: boolean): Choice<AlertDestination>[] {
  if (!noticeLive) return [{ value: 'inbox', label: 'The alert itself, in their notifications' }];
  const name = petNameOf(c);
  return c.category === 'lost_pet'
    ? [{ value: 'notice', label: name ? `${name}’s Community notice` : 'The missing pet’s Community notice' }, { value: 'sighting', label: 'The “I saw this pet” form' }]
    : [{ value: 'notice', label: 'The found animal’s Community notice' }, { value: 'claim', label: 'The ownership claim form' }];
}

/** A first draft from the report, which the Leader edits. A found animal's draft names only its kind and the general place: the details that prove ownership stay private. */
function drafted(c: Case, noticeLive: boolean): { title: string; message: string } {
  const h = heroOf(c);
  const where = placePhrase(h.where === 'Place not given' ? '' : h.where, 'in the subdivision');
  if (c.category === 'lost_pet' && !h.named) {
    const noun = NOUN[c.animal.type] ?? 'pet';
    return { title: clip(`Have you seen this ${noun}?`, TITLE_MAX), message: clip(`A ${noun} was last seen ${where}. Please check nearby areas and report any sightings.`, MESSAGE_MAX) };
  }
  if (c.category === 'lost_pet') {
    const [species = '', breed = ''] = h.about.split(' · ').map((x) => x.trim());
    const noun = breed && !/^(not |unknown|mixed|—)/i.test(breed) ? breed : (species || 'pet').toLowerCase();
    const colour = h.looks.split(',')[0].trim().toLowerCase();
    const what = colour ? `${colour} ${noun}` : noun;
    return {
      title: clip(`Still looking for ${h.name}`, TITLE_MAX),
      message: clip(`${h.name}, ${article(what)} ${what}, was last seen ${where}. Please check nearby areas and report any sightings.`, MESSAGE_MAX),
    };
  }
  const noun = NOUN[c.animal.type];
  return {
    title: clip(noun ? `Is this your ${noun}?` : 'Is this your pet?', TITLE_MAX),
    message: clip(`${noun ? `A ${noun}` : 'An animal'} was found ${placePhrase(generalArea(c), 'in the subdivision')} and is safe. ${noticeLive ? 'If it is yours, tap to see the notice and send a claim.' : 'If it is yours, contact your Subdivision Leader.'}`, MESSAGE_MAX),
  };
}

interface Form { title: string; message: string; includePhoto: boolean; destination: AlertDestination; audience: 'all' | 'helpers' }

/** One aligned row: the label beside the first line of its control (`text`: a checkbox or plain text rather than a field). */
function Row({ label, htmlFor, text, children }: { label: string; htmlFor?: string; text?: boolean; children: ReactNode }) {
  const cls = `sa-al-lab${text ? ' sa-al-lab--text' : ''}`;
  return (
    <>
      {htmlFor ? <label className={cls} htmlFor={htmlFor}>{label}</label> : <span className={cls}>{label}</span>}
      <div className="min-w-0">{children}</div>
    </>
  );
}

/**
 * Send a notification alert about a missing pet or a found animal, or change one. Its own title, message and photo; who receives it; when it goes out
 * (now, at a chosen time, or repeating at any interval or set times of day, always with an end). It never creates, publishes or edits the Community
 * notice: a tap only opens a screen. Beside the form, the phone preview and, in plain words, exactly what will happen.
 */
export function AlertDialog({ c, alertId, onClose }: CaseDialogProps & { alertId?: string }) {
  const { state, dispatch, alertAudience } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const now = useNow(30_000);
  const id = useId();
  const editing = alertId ? c.alerts.find((a) => a.id === alertId) : undefined;
  const h = heroOf(c);
  const lost = c.category === 'lost_pet';
  const petName = petNameOf(c);
  const photo = h.photos[0];
  const noticeLive = noticeIsLive(c, state.notices);
  const opens = destinationsOf(c, noticeLive);

  const [initial] = useState<{ f: Form; d: DraftSchedule }>(() => ({
    f: editing
      ? { title: editing.title, message: editing.message, includePhoto: editing.includePhoto, destination: editing.destination, audience: editing.audience }
      : { ...drafted(c, noticeLive), includePhoto: !!photo, destination: opens[0].value, audience: 'all' },
    d: editing ? draftFrom(editing, new Date()) : blankDraft(new Date()),
  }));
  const [f, setF] = useState<Form>(initial.f);
  const [d, setD] = useState<DraftSchedule>(initial.d);
  const [aud, setAud] = useState<AlertAudience | null>(null);
  const [audFailed, setAudFailed] = useState(false);
  const [tried, setTried] = useState(false);
  const submission = useRef<{ sig: string; key: string } | null>(null);

  useEffect(() => {
    let on = true;
    alertAudience(c.id).then((x) => { if (on) setAud(x); }, () => { if (on) setAudFailed(true); });
    return () => { on = false; };
  }, [alertAudience, c.id]);

  if (alertId && !editing) return null;
  const set = (patch: Partial<Form>) => setF((p) => ({ ...p, ...patch }));
  const sched = (patch: Partial<DraftSchedule>) => setD((p) => ({ ...p, ...patch }));
  const destination = opens.some((o) => o.value === f.destination) ? f.destination : opens[0].value;
  const audience = lost ? f.audience : 'all';
  const reach = aud ? (audience === 'helpers' ? aud.helpers : aud.all) : null;
  const repeat = d.mode === 'repeat';
  const paused = editing?.status === 'paused';

  // the planned sends, exactly as the server will follow them (an edit never sends at once, except "Send now")
  let sends = plannedSends(d, now);
  if (editing && repeat && d.start === 'now') sends = sends.filter((t) => t.getTime() > now.getTime() + 30_000);
  const textErrors: { title?: string; message?: string } = {};
  if (!f.title.trim()) textErrors.title = 'Give the alert a title.';
  if (!f.message.trim()) textErrors.message = 'Write the message.';
  const schedErrors = scheduleErrors(d, now);
  if (!schedErrors.length && repeat && sends.length === 0) schedErrors.push('No send fits that schedule. Choose a later end or a shorter interval.');
  const firstDay = firstDayCount(sends);
  const heavy = repeat && firstDay > HEAVY_PER_DAY;
  const dirty = JSON.stringify({ f, d }) !== JSON.stringify(initial);

  const audienceOptions: Choice<'all' | 'helpers'>[] = [
    { value: 'all', label: `All residents with alerts on${aud ? ` (${aud.all})` : ''}` },
    ...(lost ? [{ value: 'helpers' as const, label: aud ? `Residents who reported a sighting (${aud.helpers ? aud.helpers : 'none yet'})` : 'Residents who reported a sighting', disabled: aud?.helpers === 0 && audience !== 'helpers' }] : []),
  ];
  const owner = (lost && c.registeredPet && !c.registeredPet.unavailable ? c.registeredPet.owner?.name : null) ?? c.reporter.name;
  const ownerFirst = owner.trim().split(/\s+/)[0] || 'The reporter';

  const latestEnd = new Date(`${d.latestEnd}T23:59`);
  const firstText = paused && d.mode !== 'now' ? 'When you resume it'
    : d.mode === 'now' ? 'Now'
      : sends[0] ? (repeat && d.start === 'now' && !editing ? `Now, ${when(sends[0], sends[0])}` : when(sends[0], now)) : '—';
  const nextText = repeat && sends.length > 1 ? `${sends.slice(1, 4).map((t) => when(t, now)).join(' · ')}${sends.length > 4 ? ' …' : ''}` : '';
  const endsText = !repeat ? '' : d.until === 'resolved' ? `When ${subjectEnd(c)}, or ${Number.isNaN(latestEnd.getTime()) ? '—' : fmtDay(latestEnd.toISOString())} at the latest`
    : d.until === 'date' ? (Number.isNaN(new Date(d.untilAt).getTime()) ? '—' : when(new Date(d.untilAt), now)) : `After ${plural(Number(d.count) || 0, 'send')}`;
  const many = sends.length >= 2000 ? 'More than 2,000 sends' : plural(sends.length, 'send');
  const totalText = !repeat ? '1 send' : d.until === 'resolved' ? `Up to ${many}` : many;
  const pushText = aud === null ? 'A notification to residents'
    : aud.pushReady ? 'A push notification, also kept in their notifications'
      : 'In the app only: phone push is not set up yet';
  const toText = reach === null ? (audFailed ? (audience === 'helpers' ? 'Residents who reported a sighting' : 'Residents with alerts on') : 'Counting…')
    : reach === 0 ? 'Nobody can receive it right now' : `${plural(reach, 'resident')}${repeat ? ', each time' : ''}`;
  const sendNowLabel = `Send now${reach ? ` to ${plural(reach, 'resident')}` : ''}`;
  const submitLabel = editing ? (d.mode === 'now' ? sendNowLabel : 'Save changes')
    : d.mode === 'now' ? sendNowLabel
      : d.mode === 'later' ? (sends[0] ? `Schedule for ${when(sends[0], now)}` : 'Schedule')
        : d.start === 'now' ? 'Start: first send now' : 'Schedule repeating alert';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    const at = new Date();
    if (textErrors.title || textErrors.message || scheduleErrors(d, at).length > 0 || (repeat && sends.length === 0)) return;
    const alert: AlertInput = { title: f.title.trim(), message: f.message.trim(), includePhoto: f.includePhoto && !!photo, destination, audience, schedule: inputSchedule(d) };
    let ok: boolean;
    if (editing) {
      ok = await run(() => dispatch({ type: 'alert/update', id: c.id, alertId: editing.id, alert }));
    } else {
      // one submission id per content: a retry after a lost answer is recognised by the server and never sends twice
      const sig = JSON.stringify(alert);
      if (!submission.current || submission.current.sig !== sig) submission.current = { sig, key: `ca-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` };
      const requestId = submission.current.key;
      ok = await run(() => dispatch({ type: 'alert/create', id: c.id, alert, requestId }));
    }
    if (!ok) return;
    toast.success(editing
      ? (d.mode === 'now' ? 'Alert sent.' : paused ? 'Alert changed. It stays paused until you resume it.' : 'Alert changed. Future sends follow the new settings.')
      : d.mode === 'now' ? `Alert sent${reach ? ` to ${plural(reach, 'resident')}` : ''}.`
        : d.mode === 'later' ? `Alert scheduled for ${sends[0] ? when(sends[0], now) : 'later'}.`
          : d.start === 'now' ? 'Repeating alert started. The first send went out now.' : `Repeating alert scheduled. First send ${sends[0] ? when(sends[0], now) : 'later'}.`);
    onClose();
  };

  const addTime = () => {
    const taken = new Set(d.times);
    const free = ['15:00', '09:00', '12:00', '18:00', '07:00', '20:00'].find((t) => !taken.has(t)) ?? '15:00';
    sched({ times: [...d.times, free] });
  };

  return (
    <Dialog
      size="lg" title={editing ? 'Edit alert' : `Send an alert about ${lost ? (petName ?? `the missing ${NOUN[c.animal.type] ?? 'pet'}`) : `the found ${NOUN[c.animal.type] ?? 'animal'}`}`}
      description={`A notification to residents. It doesn’t post to Community or change ${petName ? `${petName}’s` : 'the'} notice.`}
      onClose={onClose} dirty={dirty} onSubmit={submit}
      footer={({ requestClose }) => (
        <>
          <Button onClick={requestClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>{submitLabel}</Button>
        </>
      )}
    >
      <div className="sa-al-grid">
        <div className="sa-al-main">
          <section className="sa-al-group" aria-labelledby={`${id}-m`}>
            <h3 className="sa-al-group__title" id={`${id}-m`}>Message</h3>
            <div className="sa-al-fields">
              <Row label="Title" htmlFor={`${id}-title`}>
                <Input id={`${id}-title`} value={f.title} maxLength={TITLE_MAX} aria-invalid={tried && !!textErrors.title} onChange={(e) => set({ title: e.target.value })} />
                <p className="sa-al-help">{editing ? '' : 'Drafted from the report · '}{TITLE_MAX - f.title.length} characters left</p>
                {tried && textErrors.title ? <p className="sa-error" role="alert">{textErrors.title}</p> : null}
              </Row>
              <Row label="Message" htmlFor={`${id}-msg`}>
                <Textarea id={`${id}-msg`} rows={3} value={f.message} maxLength={MESSAGE_MAX} aria-invalid={tried && !!textErrors.message} onChange={(e) => set({ message: e.target.value })} />
                <p className="sa-al-help">{MESSAGE_MAX - f.message.length} characters left. No phone numbers, emails or exact addresses.</p>
                {tried && textErrors.message ? <p className="sa-error" role="alert">{textErrors.message}</p> : null}
              </Row>
              <Row label="Photo" text>
                <Checkbox label={petName ? `Include ${petName}’s photo` : lost ? 'Include the pet’s photo' : 'Include the animal’s photo'} checked={f.includePhoto && !!photo} disabled={!photo} onChange={(e) => set({ includePhoto: e.target.checked })} hint={photo ? undefined : 'This report has no photo.'} />
              </Row>
              <Row label="On tap" htmlFor={`${id}-open`}>
                <Select id={`${id}-open`} value={destination} onChange={(e) => set({ destination: e.target.value as AlertDestination })}>
                  {opens.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
                {!noticeLive ? <p className="sa-al-help">No Community notice is published, so a tap opens the alert itself.</p> : null}
              </Row>
            </div>
          </section>

          <section className="sa-al-group" aria-labelledby={`${id}-r`}>
            <h3 className="sa-al-group__title" id={`${id}-r`}>Recipients</h3>
            <div className="sa-al-fields">
              <Row label="Send to" htmlFor={`${id}-aud`}>
                <Select id={`${id}-aud`} value={audience} onChange={(e) => set({ audience: e.target.value as 'all' | 'helpers' })}>
                  {audienceOptions.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
                </Select>
                <p className="sa-al-help">
                  {ownerFirst} reported it and gets their own updates.{aud && aud.turnedOff > 0 ? ` ${plural(aud.turnedOff, 'resident')} turned these alerts off.` : ''}
                  {audFailed ? ' The number of residents could not be read just now.' : ''}
                </p>
              </Row>
            </div>
          </section>

          <section className="sa-al-group" aria-labelledby={`${id}-s`}>
            <h3 className="sa-al-group__title" id={`${id}-s`}>Schedule</h3>
            <div className="sa-al-fields">
              <Row label="When">
                <Segmented label="When" value={d.mode} onChange={(mode) => sched({ mode })} options={[{ value: 'now', label: 'Send now' }, { value: 'later', label: 'Schedule' }, { value: 'repeat', label: 'Repeat' }]} />
              </Row>
              {d.mode === 'later' ? (
                <Row label="Date" htmlFor={`${id}-at`}><div className="sa-al-inline"><Input id={`${id}-at`} type="datetime-local" value={d.at} onChange={(e) => sched({ at: e.target.value })} /></div></Row>
              ) : null}
              {repeat ? (
                <>
                  <Row label="Repeat" htmlFor={`${id}-rep`}>
                    <div className="sa-al-inline">
                      <Select id={`${id}-rep`} value={d.repeat} onChange={(e) => sched({ repeat: e.target.value as 'every' | 'times' })}>
                        <option value="every">Every</option>
                        <option value="times">At set times</option>
                      </Select>
                      {d.repeat === 'every' ? (
                        <>
                          <Input className="sa-al-num" type="number" min={1} inputMode="numeric" aria-label="How many" value={d.every} onChange={(e) => sched({ every: e.target.value })} />
                          <Select aria-label="Unit" value={d.unit} onChange={(e) => sched({ unit: e.target.value as Unit })}>
                            <option value="minutes">minutes</option>
                            <option value="hours">hours</option>
                            <option value="days">days</option>
                          </Select>
                        </>
                      ) : null}
                    </div>
                  </Row>
                  {d.repeat === 'times' ? (
                    <Row label="Times">
                      <div className="sa-al-times">
                        {d.times.map((t, i) => (
                          <span key={i} className="sa-al-time">
                            <Input type="time" value={t} aria-label={`Time ${i + 1}`} onChange={(e) => sched({ times: d.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                            <button type="button" className="sa-al-x" aria-label={`Remove time ${i + 1}`} onClick={() => sched({ times: d.times.filter((_, j) => j !== i) })}><X size={15} aria-hidden="true" /></button>
                          </span>
                        ))}
                        {d.times.length < MAX_TIMES ? <Button variant="ghost" size="sm" onClick={addTime}>Add a time</Button> : null}
                      </div>
                      <p className="sa-al-help">Every day, at these times.</p>
                    </Row>
                  ) : null}
                  <Row label="Starts" htmlFor={`${id}-start`}>
                    <div className="sa-al-inline">
                      <Select id={`${id}-start`} value={d.start} onChange={(e) => sched({ start: e.target.value as 'now' | 'later' })}>
                        <option value="now">{editing ? 'Right away' : 'Now'}</option>
                        <option value="later">Later</option>
                      </Select>
                      {d.start === 'later' ? <Input type="datetime-local" aria-label="Start" value={d.startAt} onChange={(e) => sched({ startAt: e.target.value })} /> : null}
                    </div>
                  </Row>
                  <Row label="Ends" htmlFor={`${id}-until`}>
                    <div className="sa-al-inline">
                      <Select id={`${id}-until`} value={d.until} onChange={(e) => sched({ until: e.target.value as DraftSchedule['until'] })}>
                        <option value="resolved">{`When ${subjectEnd(c)}`}</option>
                        <option value="date">On a date</option>
                        <option value="count">After a number of sends</option>
                      </Select>
                      {d.until === 'date' ? <Input type="datetime-local" aria-label="End" value={d.untilAt} onChange={(e) => sched({ untilAt: e.target.value })} /> : null}
                      {d.until === 'count' ? <><Input className="sa-al-num" type="number" min={1} max={MAX_SENDS} inputMode="numeric" aria-label="Number of sends" value={d.count} onChange={(e) => sched({ count: e.target.value })} /><span className="sa-small">sends{editing ? ' from now' : ''}</span></> : null}
                    </div>
                  </Row>
                  {d.until === 'resolved' ? (
                    <Row label="Latest end" htmlFor={`${id}-latest`}>
                      <div className="sa-al-inline"><Input id={`${id}-latest`} type="date" value={d.latestEnd} onChange={(e) => { if (e.target.value) sched({ latestEnd: e.target.value }); }} /></div>
                      <p className="sa-al-help">So it never runs forgotten. You can extend it later.</p>
                    </Row>
                  ) : null}
                </>
              ) : null}
            </div>
            {schedErrors.length > 0 ? (
              <div className="sa-al-errors" role="alert">{schedErrors.map((x) => <p key={x} className="sa-al-err"><TriangleAlert size={13} aria-hidden="true" />{x}</p>)}</div>
            ) : null}
          </section>
          {error ? <FormError message={error} /> : null}
        </div>

        <aside className="sa-al-side" aria-label="Preview">
          <div className="sa-al-phone">
            <div className="sa-al-phone__top"><span>Preview</span><span>Lock screen</span></div>
            <div className="sa-al-push">
              <span className="sa-al-push__app"><span className="sa-al-push__dot" aria-hidden="true" /><b>StraySafe</b> · now</span>
              <span className="sa-al-push__title">{f.title.trim() || 'Title'}</span>
              {f.includePhoto && photo ? <img className="sa-al-push__img" src={photo} alt="" /> : null}
              <span className="sa-al-push__body">{f.message.trim() || 'Message'}</span>
            </div>
          </div>
          <div className="sa-al-what" aria-label="What happens">
            <span className="sa-mc-kicker">What happens</span>
            <dl>
              <dt>Sends</dt><dd>{pushText}</dd>
              <dt>To</dt><dd className={reach === 0 ? 'sa-al-attn' : undefined}>{toText}</dd>
              <dt>On tap</dt><dd>{(opens.find((o) => o.value === destination) ?? opens[0]).label}</dd>
              <dt>First</dt><dd>{firstText}</dd>
              {repeat ? <><dt>Then</dt><dd>{draftCadence(d, now)}</dd></> : null}
              {nextText && !paused ? <><dt>Next</dt><dd>{nextText}</dd></> : null}
              {endsText ? <><dt>Ends</dt><dd>{endsText}</dd></> : null}
              <dt>{editing ? 'From now' : 'Total'}</dt><dd>{paused && d.mode !== 'now' ? 'Nothing until you resume it' : totalText}</dd>
            </dl>
            {heavy ? <p className="sa-al-warn"><TriangleAlert size={13} aria-hidden="true" />{firstDay} sends in the first day. Residents can turn these alerts off if it feels like too much.</p> : null}
            {d.mode !== 'now' ? <p className="sa-al-help">Pause, edit or stop it any time. It stops by itself when the case is resolved.</p> : null}
          </div>
        </aside>
      </div>
    </Dialog>
  );
}

/** Stop a live alert (no more sends; what was sent stays in its history), or cancel one that has not gone out. The Community notice is not touched. */
export function StopAlertDialog({ c, alertId, onClose }: CaseDialogProps & { alertId: string }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const a = c.alerts.find((x) => x.id === alertId);
  if (!a) return null;
  const sent = a.sendsDone > 0;
  const go = async () => {
    if (await run(() => dispatch({ type: 'alert/stop', id: c.id, alertId }))) { toast.success(sent ? 'Alert stopped.' : 'Alert cancelled.'); onClose(); }
  };
  return (
    <Dialog
      size="sm" title={sent ? 'Stop this alert?' : 'Cancel this alert?'} onClose={onClose}
      footer={<><Button onClick={onClose} disabled={pending}>Keep it</Button><Button variant="primary" loading={pending} onClick={() => { void go(); }}>{sent ? 'Stop alert' : 'Cancel alert'}</Button></>}
    >
      <p className="sa-text-2">
        {sent ? `No more sends of “${a.title}”. The ${plural(a.sendsDone, 'send')} already made stay in its history.` : `“${a.title}” has not been sent and will not be.`} The Community notice is not affected.
      </p>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/**
 * Publish a found animal's Community notice from its case: the animal, the general place and an optional word from the Leader. Residents are notified
 * once, when it is published. Alerts sent later never change it; it closes by itself when the case is resolved.
 */
export function PublishCaseNoticeDialog({ c, onClose }: CaseDialogProps) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const existing = state.notices.find((n) => n.caseId === c.id && n.status !== 'archived');
  const h = heroOf(c);
  const noun = NOUN[c.animal.type] ?? 'animal';
  const where = existing?.location.trim() || generalArea(c);
  const draft = `If this is your ${noun === 'animal' ? 'pet' : noun}, open the notice and send an ownership claim. Tell us one detail only its owner would know.`;
  const [word, setWord] = useState(existing?.description || draft);
  const photo = existing?.media[0]?.url ?? h.photos[0];

  const publish = async (e: FormEvent) => {
    e.preventDefault();
    const notice: Notice = {
      id: existing?.id ?? 'notice-new', type: 'found_animal', title: existing?.title ?? '', description: word.trim(), location: where,
      media: [], status: existing?.status ?? 'draft', caseId: c.id, source: existing?.source ?? 'admin', createdAt: existing?.createdAt ?? '', updatedAt: '', publishedAt: null,
      author: existing?.author ?? state.admin.name,
    };
    if (await run(() => dispatch({ type: 'notice/save', notice, publish: true }))) { toast.success('Community notice published. Residents were notified once.'); onClose(); }
  };

  return (
    <Dialog
      size="md" title="Publish a Community notice" description="Residents see it in Community › Found animals, and can claim the animal from it."
      onClose={onClose} dirty={word !== (existing?.description || draft)} onSubmit={publish}
      footer={({ requestClose }) => (<><Button onClick={requestClose} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" loading={pending}>Publish notice</Button></>)}
    >
      <div className="sa-al-notice">
        {photo ? <img src={photo} alt="" /> : <span className="sa-al-notice__ph" aria-hidden="true"><PawPrint size={26} /></span>}
        <div className="min-w-0">
          <p className="sa-al-notice__kind">Found animal</p>
          <p className="sa-al-notice__title">Found {noun}{where ? ` ${placePhrase(where)}` : ''}</p>
          <p className="sa-al-notice__meta">Found {fmtDay(c.observedAt)}</p>
          {word.trim() ? <p className="sa-al-notice__word"><b>From your Subdivision Leader:</b> {word.trim()}</p> : null}
        </div>
      </div>
      <p className="sa-hint">The finder’s own words and the details that prove ownership stay private: they are how the real owner shows it is theirs.</p>
      <Field label="A word from you" optional hint="No phone numbers, emails or exact addresses."><Textarea rows={2} maxLength={300} value={word} onChange={(e) => setWord(e.target.value)} /></Field>
      <dl className="sa-al-sum">
        <dt>Posted</dt><dd>One notice in Community › Found animals.</dd>
        <dt>Notified</dt><dd>Residents, once, when it is published.</dd>
        <dt>Later</dt><dd>Alerts you send never change this notice. It closes by itself when the case is resolved.</dd>
      </dl>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
