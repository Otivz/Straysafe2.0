import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CalendarClock, CalendarPlus, Check, CircleCheck, ClipboardCheck, Handshake, Landmark, RotateCcw, ScanSearch, Search, type LucideIcon } from 'lucide-react';
import { fmtDateTime, relative } from '../../../../preview/lib/format';
import { adminPath } from '../../../config';
import { Button } from '../../../components/Button';
import { MatchPhoto } from '../../../components/MatchParts';
import { DISPOSITIONS, RECOVERY_SOURCES } from '../../../data/constants';
import type { Need, NeedKind, Tile, TileOpen } from '../../../data/monitored';
import { partnerOf } from '../../../data/selectors';
import type { Case, LostPetConversation } from '../../../data/types';
import type { OpenCaseDialog } from '../dialogState';

const ICON: Record<NeedKind, LucideIcon> = { help: Handshake, lead: Search, match: ScanSearch, claim: ClipboardCheck, followup: CalendarClock, barangay: Landmark, update: Landmark };

const telOf = (phone: string) => phone.replace(/[^\d+]/g, '');
const phoneOf = (phone: string | undefined) => (phone && phone !== '—' ? <a href={`tel:${telOf(phone)}`} className="font-semibold">{phone}</a> : <span className="sa-text-3">No phone number</span>);

/**
 * An owner and a neighbour asked the Leader to help them get in touch. No reason is asked and nobody reads their messages: the Leader sees who they
 * are and how to reach them, contacts them, writes down what happened and finishes it.
 */
function HelpPanel({ x, openDialog }: { x: LostPetConversation; openDialog: OpenCaseDialog }) {
  return (
    <div className="sa-mc-need__panel">
      <p className="sa-small sa-text-2">Contact them, write down what you did, and mark it finished.</p>
      <dl className="sa-mc-pair">
        <div><dt>Owner</dt><dd>{x.owner?.name ?? 'The owner'} · {phoneOf(x.owner?.phone)}</dd></div>
        <div><dt>Neighbour</dt><dd>{x.finder?.name ?? 'A neighbour'} · {phoneOf(x.finder?.phone)}</dd></div>
      </dl>
      <p className="sa-mc-need__acts">
        <Button size="sm" icon={Check} onClick={() => openDialog({ kind: 'followUp', mode: 'owner' })}>Write down what you did</Button>
        <Button size="sm" icon={CalendarPlus} onClick={() => openDialog({ kind: 'followUp', mode: 'follow_up' })}>Schedule a next step</Button>
        <Button size="sm" icon={Check} onClick={() => openDialog({ kind: 'resolveConversation', conversationId: x.id })}>Mark as finished</Button>
      </p>
    </div>
  );
}

/** One tile per topic: what it is, its state, a line of detail and (when there is one) the one action that belongs to it. */
function Tiles({ tiles, caseId, openDialog }: { tiles: Tile[]; caseId: string; openDialog: OpenCaseDialog }) {
  const navigate = useNavigate();
  const run = (open: TileOpen) => {
    if (open.kind === 'viewNotice') navigate(adminPath(`/community/${open.noticeId}/edit`));
    else if (open.kind === 'createNotice') navigate(`${adminPath('/community/new')}?fromCase=${caseId}`);
    else if (open.kind === 'alerts') document.getElementById('mc-alerts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else openDialog(open);
  };
  return (
    <ul className="sa-mc-tiles" aria-label="The situation">
      {tiles.map((t) => (
        <li key={t.key} className="sa-mc-tile">
          <span className="sa-mc-kicker">{t.label}</span>
          <span className="sa-mc-tile__value"><span className="sa-mc-dot" data-tone={t.tone} aria-hidden="true" />{t.value}</span>
          {t.meta ? <span className="sa-mc-tile__meta">{t.meta}</span> : null}
          {t.action ? <Button variant="link" size="sm" className="sa-mc-tile__act" aria-label={`${t.action.label} (${t.label})`} onClick={() => run(t.action!.open)}>{t.action.label}</Button> : null}
        </li>
      ))}
    </ul>
  );
}

/** A report that is finished: the pet is home (the owner's confirmation), or it was closed for another reason. */
function Closed({ c, now, openDialog }: { c: Case; now: Date; openDialog: OpenCaseDialog }) {
  const rec = c.lostPet?.recovery;
  const cl = c.closure;
  return (
    <section className="sa-mc-lane" data-closed aria-label="How this report ended">
      <p className="sa-mc-calm"><CircleCheck size={18} aria-hidden="true" />{rec ? 'The pet is home' : cl ? DISPOSITIONS[cl.disposition].label : 'This report is closed'}</p>
      <p className="sa-small sa-text-2 mt-1">
        {rec ? `The owner confirmed it ${RECOVERY_SOURCES[rec.source].toLowerCase()} on ${fmtDateTime(rec.at)}${rec.recordedBy ? `, recorded by ${rec.recordedBy}` : ''}.${rec.note ? ` ${rec.note}` : ''}`
          : cl ? `${cl.reason ? `${cl.reason} ` : ''}Closed by ${cl.closedBy}, ${relative(cl.closedAt, now)}.` : ''}
      </p>
      <p className="mt-3"><Button size="sm" icon={RotateCcw} onClick={() => openDialog({ kind: 'reopen' })}>Reopen this report</Button></p>
    </section>
  );
}

/**
 * THE ONE PLACE THAT SAYS WHETHER ANYTHING IS ASKED OF THE LEADER. Calm: one quiet line (since when the report is monitored, when it last changed) over the
 * situation tiles. When something needs the Leader it becomes a short list, each item with the one button that deals with it; only the first has the
 * strong colour. When it is dealt with the report goes back to being monitored.
 */
export default function Lane({ c, needs, tiles, line, now, openDialog }: { c: Case; needs: Need[]; tiles: Tile[]; line: string; now: Date; openDialog: OpenCaseDialog }) {
  const [help, setHelp] = useState<string | null>(null);
  if (c.status === 'closed') return <Closed c={c} now={now} openDialog={openDialog} />;
  const active = needs.length > 0;
  return (
    <section id="mc-lane" className="sa-mc-lane" data-active={active || undefined} aria-label={active ? 'Needs you' : 'Situation'}>
      {active ? (
        <>
          <h2 className="sa-mc-lane__head"><Bell size={15} aria-hidden="true" />Needs you</h2>
          <ul className="sa-mc-needs">
            {needs.map((n, i) => {
              const Icon = ICON[n.kind];
              const conversation = n.open.kind === 'help' ? c.lostPet?.conversations.find((x) => x.id === (n.open as { conversationId: string }).conversationId) : undefined;
              const opened = n.open.kind === 'help' && help === n.id;
              return (
                <li key={n.id} className="sa-mc-need">
                  {n.match ? <MatchPhoto side={partnerOf(n.match, c.id)} /> : <span className="sa-mc-need__icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>}
                  <div className="min-w-0">
                    <p className="sa-mc-need__title">{n.title}</p>
                    {n.detail ? <p className="sa-mc-need__detail">{n.detail}</p> : null}
                  </div>
                  <Button
                    variant={i === 0 ? 'primary' : 'secondary'} size="sm" aria-label={`${n.action}: ${n.title}`} aria-expanded={n.open.kind === 'help' ? opened : undefined}
                    onClick={() => { if (n.open.kind === 'help') setHelp(opened ? null : n.id); else openDialog(n.open); }}
                  >{n.open.kind === 'help' && opened ? 'Hide' : n.action}</Button>
                  {opened && conversation ? <HelpPanel x={conversation} openDialog={openDialog} /> : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <div className="sa-mc-lane__calm">
          <p className="sa-mc-calm" role="status"><CircleCheck size={18} aria-hidden="true" />Nothing needs you right now</p>
          <p className="sa-mc-lane__line">{line}</p>
        </div>
      )}
      {tiles.length > 0 ? <Tiles tiles={tiles} caseId={c.id} openDialog={openDialog} /> : null}
    </section>
  );
}
