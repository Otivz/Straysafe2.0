import { useEffect, useRef, useState } from 'react';
import { Check, Equal, HelpCircle, X } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Callout, FormError } from '../components/layout';
import { KindBadge, MatchPhoto } from '../components/MatchParts';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import { levelLabel, matchesOf } from '../data/selectors';
import type { MatchRow, MatchSide, PossibleMatch } from '../data/types';
import { errorMessage } from '../../preview/lib/errors';
import { fmtDateTime, plural, relative } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';

const VERDICT: Record<MatchRow['verdict'], { icon: typeof Check; label: string }> = {
  match: { icon: Check, label: 'Match' },
  similar: { icon: Equal, label: 'Similar' },
  differs: { icon: X, label: 'Differs' },
  unknown: { icon: HelpCircle, label: 'Not known' },
};

const firstName = (name: string | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'The resident';

/** What a row says about one report. The "When" row holds a time. */
const cell = (row: MatchRow, value: string) => (row.key === 'when' ? (value ? fmtDateTime(value) : 'Not noted') : value);

function Head({ side, now }: { side: MatchSide; now: Date }) {
  return (
    <div className="sa-cmp__head">
      <MatchPhoto side={side} size="lg" />
      <p className="sa-cmp__who"><KindBadge kind={side.kind} /><span className="sa-ref">{side.caseId}</span></p>
      <p className="sa-cmp__title">{side.title}</p>
      <p className="sa-meta">{side.kind === 'lost' ? 'Owner' : 'Reported by'}: {side.reporter?.name ?? 'Not recorded'}{side.reportedAt ? ` · reported ${relative(side.reportedAt, now)}` : ''}</p>
      {side.words ? <p className="sa-cmp__words">“{side.words}”</p> : null}
    </div>
  );
}

/**
 * THE REVIEW OF A POSSIBLE MATCH. The two reports side by side, why the system thinks they may be the same animal, and one decision. Nothing is
 * linked, and no resident is told, until the Leader says "same animal". The same dialog opens from either report and from the dashboard, so the
 * order the reports were filed in changes nothing. A link is never ownership and never a recovery.
 */
export function MatchCompareDialog({ matchId, onClose }: { matchId: string; onClose: () => void }) {
  const { state, dispatch, matchDetail } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const listed = state.matches.find((x) => x.id === matchId);
  const [opened] = useState(listed?.status);            // what the match was when this dialog opened: the buttons do not change under the Leader's hand
  const sent = useRef(false);
  const [now] = useState(() => new Date());
  const [remote, setRemote] = useState<{ id: string; match: PossibleMatch } | { id: string; error: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    matchDetail(matchId)
      .then((match) => { if (!cancelled) setRemote({ id: matchId, match }); })
      .catch((err: unknown) => { if (!cancelled) setRemote({ id: matchId, error: errorMessage(err) }); });
    return () => { cancelled = true; };
  }, [matchDetail, matchId]);

  const detail = remote && remote.id === matchId && 'match' in remote ? remote.match : null;
  const loadError = remote && remote.id === matchId && 'error' in remote ? remote.error : null;
  const m = detail ?? listed;
  if (!m) {
    return (
      <Dialog size="sm" title="This match is no longer here" onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
        <p className="sa-text-2">It may have been decided by someone else. Reload the page to see the latest.</p>
      </Dialog>
    );
  }

  const status = opened ?? m.status;
  const waiting = status === 'pending' && m.lost.open && m.found.open;
  const ruledOut = status === 'rejected' && m.lost.open && m.found.open;
  const owner = firstName(m.lost.reporter?.name);
  const finder = firstName(m.found.reporter?.name);
  const alreadyLinked = matchesOf(state.matches, m.lost.caseId).linked.length;

  const decide = async (decision: 'confirm' | 'reject' | 'reopen') => {
    if (sent.current) return;
    const ok = await run(() => dispatch({ type: 'match/decide', matchId, decision }));
    if (!ok) return;
    sent.current = true;
    toast.success(decision === 'confirm' ? 'Linked. Both residents were told.' : decision === 'reject' ? 'Ruled out. Nobody was told.' : 'Back in your list to review.');
    onClose();
  };

  const title = waiting ? 'Do these reports describe the same animal?' : ruledOut ? 'Ruled out as the same animal' : status === 'confirmed' ? 'Linked as the same animal' : 'Possible match';
  const description = waiting ? <>{levelLabel(m.level)}. Compare them, then decide. Nothing is linked until you do.</> : null;
  const reasons = detail?.reasons ?? m.reasons;

  return (
    <Dialog
      size="lg"
      title={title}
      description={description ?? undefined}
      onClose={onClose}
      footer={({ requestClose }) => (waiting ? (
        <>
          <Button variant="ghost" onClick={requestClose} disabled={pending}>Decide later</Button>
          <Button disabled={pending} onClick={() => { void decide('reject'); }}>Not the same animal</Button>
          <Button variant="primary" loading={pending} onClick={() => { void decide('confirm'); }}>Same animal: link them</Button>
        </>
      ) : ruledOut ? (
        <>
          <Button variant="ghost" onClick={requestClose} disabled={pending}>Close</Button>
          <Button loading={pending} onClick={() => { void decide('reopen'); }}>Review again</Button>
        </>
      ) : <Button onClick={requestClose}>Close</Button>)}
    >
      <div className="sa-cmp__heads"><Head side={m.lost} now={now} /><Head side={m.found} now={now} /></div>

      {reasons.length > 0 ? (
        <div className="sa-mwhy">
          <p className="sa-label">Why they may match</p>
          <p className="sa-mwhy__chips">{reasons.map((r) => <Badge key={r} tone="sage" icon={Check}>{r}</Badge>)}</p>
        </div>
      ) : null}

      {detail?.rows ? (
        <table className="sa-cmp__table">
          <caption className="sa-sr-only">The missing-pet report and the found-animal report, compared</caption>
          <thead>
            <tr><th scope="col"><span className="sa-sr-only">What</span></th><th scope="col">Missing-pet report</th><th scope="col">Found-animal report</th><th scope="col"><span className="sa-sr-only">Comparison</span></th></tr>
          </thead>
          <tbody>
            {detail.rows.map((row) => {
              const v = VERDICT[row.verdict];
              return (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  <td data-label="Missing">{cell(row, row.lost)}</td>
                  <td data-label="Found">{cell(row, row.found)}</td>
                  <td className="sa-cmp__verdict" data-verdict={row.verdict}><v.icon size={15} aria-hidden="true" /><span className="sa-sr-only">{v.label}: </span>{row.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : loadError ? <FormError message={`The comparison could not be loaded. ${loadError}`} /> : <p className="sa-small sa-text-2" role="status">Loading the comparison…</p>}

      {waiting ? (
        <Callout tone="info" title="If you link them:">
          {owner} and {finder} are both told that you linked these reports. A direct conversation between the owner and the finder opens immediately in their Resident app. Phone numbers and addresses are not added automatically.
          Both reports and their histories stay as they are. Linking does not verify ownership and does not mark the pet recovered: only the owner’s confirmation does.
          {alreadyLinked > 0 ? ` ${m.lost.title} already has ${plural(alreadyLinked, 'linked found report')}; each one is confirmed on its own.` : ''}
        </Callout>
      ) : null}
      {!waiting && !ruledOut && status === 'confirmed' ? <Callout tone="info">Both residents were told{m.decidedAt ? ` ${relative(m.decidedAt, now)}` : ''}. Linking is not proof of ownership and does not mark the pet recovered: only the owner’s confirmation does.</Callout> : null}
      {!waiting && !ruledOut && status === 'moot' ? <Callout tone="info">The found report was linked to another missing-pet report, so this one no longer applies.</Callout> : null}
      {!waiting && !ruledOut && (status === 'pending' || status === 'rejected') ? <Callout tone="info">One of the reports is closed, so this match can no longer be decided.</Callout> : null}
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
