import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { adminPath } from '../../config';
import { Button } from '../../components/Button';
import { Callout, ErrorState, PageSkeleton, Tabs } from '../../components/layout';
import { CaseReferralsSection } from '../../dialogs/CoordinationDialogs';
import { CATEGORY_ICON } from '../../components/icons';
import { useAdminData, type DetailStatus } from '../../data/context';
import { heroOf, monitoringLine, needsYou, peopleOf, situationTiles } from '../../data/monitored';
import { openItems } from '../../data/selectors';
import type { Case } from '../../data/types';
import { usePageTitle } from '../../lib/hooks';
import { useNow } from '../../../preview/lib/hooks';
import { AlertTagMessages } from '../../components/PetTagBlocks';
import { CaseDialogs } from './CaseDialogs';
import type { CaseDialog } from './dialogState';
import { Activity, Resolve } from './monitored/Activity';
import { Alerts } from './monitored/Alerts';
import HeroBlock from './monitored/Hero';
import Lane from './monitored/Lane';
import PossibleOwnersBlock, { CaseWarningsSection } from './PossibleOwnersBlock';
import { LinkedReports, Ownership, Sightings } from './monitored/Sections';

/**
 * A missing pet or a found animal, as ONE calm page that follows the Leader's job.
 *
 *   the animal and what happened -> who to talk to -> (only if something needs the Leader) -> what is going on -> the alerts -> what was done
 *
 * A report is "under monitoring" from the moment it is filed and nothing is asked of the Leader. It leaves that state only when something needs them
 * (a possible match, someone to contact, the Barangay, a possible recovery, a claim, a follow-up), says so in one place, and goes back to monitoring when
 * it is dealt with. The occasional things (asking the Barangay, writing an update, resolving the report) sit where they belong instead of in a toolbar.
 * There are no tabs and no status or priority to set.
 */
export default function MonitoredCasePage({ c, detail }: { c: Case; detail: { status: DetailStatus; error?: string } }) {
  const { state, loadCase } = useAdminData();
  const now = useNow();
  const [dialog, setDialog] = useState<CaseDialog | null>(null);
  const hero = heroOf(c);
  usePageTitle(`${c.id} · ${hero.name}`);
  const full = detail.status === 'ready';
  const closed = c.status === 'closed';
  const found = c.category === 'found_animal';
  const needs = needsYou(c, state.matches, now);
  const notice = state.notices.find((n) => n.caseId === c.id && n.status !== 'archived');
  const tiles = situationTiles(c, state.matches, now, notice);
  const people = peopleOf(c, state.matches);
  const Icon = CATEGORY_ICON[c.category];
  const open = (d: CaseDialog) => setDialog(d);
  // Two tabs (2026-11-20): the case itself, and its external referrals. ?tab=referrals opens the second one.
  const [params, setParams] = useSearchParams();
  const tab: 'case' | 'referrals' = params.get('tab') === 'referrals' ? 'referrals' : 'case';
  const setTab = (key: 'case' | 'referrals') => { const next = new URLSearchParams(params); if (key === 'case') next.delete('tab'); else next.set('tab', key); setParams(next, { replace: true }); };
  const openReferrals = openItems(c).referrals;
  const toLane = () => document.getElementById('mc-lane')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // One status, said once: monitoring (the resting state), needs you (something to do), or how it ended
  const chip = closed ? (c.lostPet?.recovery ? { tone: 'sage', text: 'Resolved' } : { tone: 'muted', text: 'Closed' })
    : needs.length > 0 ? { tone: 'amber', text: `Needs you · ${needs.length}` } : { tone: undefined, text: 'Under monitoring' };

  return (
    <div className="sa-mc">
      <Link className="sa-back" to={adminPath('/cases')}>← Cases</Link>
      <header className="sa-mc__top">
        <p className="sa-mc__eyebrow"><span className="sa-ref" style={{ fontSize: 13.5 }}>{c.id}</span><span className="sa-meta flex items-center gap-1.5"><Icon size={14} aria-hidden="true" />{found ? 'Found animal' : 'Lost pet'}</span></p>
        {full ? (chip.tone === 'amber'
          ? <button type="button" className="sa-mc__chip" data-tone="amber" onClick={toLane} aria-label={`${chip.text}. Go to what needs you`}>{chip.text}</button>
          : <span className="sa-mc__chip" data-tone={chip.tone}>{chip.text}</span>) : null}
      </header>

      {detail.status === 'error' ? <ErrorState message={detail.error} onRetry={() => { void loadCase(c.id); }} />
        : !full ? <PageSkeleton />
          : (
            <>
              {detail.error ? <Callout tone="amber" className="mb-4">{detail.error}</Callout> : null}
              <Tabs
                idPrefix="mc"
                label="Case sections"
                value={tab}
                onChange={setTab}
                items={[{ key: 'case', label: 'Case' }, { key: 'referrals', label: 'Referrals', count: c.referrals.length }]}
              />
              {tab === 'referrals' ? (
                <div role="tabpanel" id="mc-panel" aria-labelledby="mc-tab-referrals" className="pt-5">
                  <CaseReferralsSection c={c} openDialog={open} />
                </div>
              ) : (
              <div role="tabpanel" id="mc-panel" aria-labelledby="mc-tab-case" className="pt-5">
              {openReferrals.length > 0 ? (
                <Callout className="mb-4">
                  {openReferrals.length === 1 ? `1 open referral: ${openReferrals[0].orgName}.` : `${openReferrals.length} open referrals.`}{' '}
                  <Button variant="link" onClick={() => setTab('referrals')}>Open Referrals</Button>
                </Callout>
              ) : null}
              <HeroBlock c={c} hero={hero} people={people} now={now} openDialog={open} canLog={!closed} />
              <Lane c={c} needs={needs} tiles={tiles} line={monitoringLine(c, now)} now={now} openDialog={open} />
              <Alerts c={c} now={now} openDialog={open} />
              <Sightings c={c} now={now} openDialog={open} />
              {c.lostPet?.alertId ? <AlertTagMessages alertId={c.lostPet.alertId} /> : null}
              <LinkedReports c={c} now={now} openDialog={open} />
              {found ? <PossibleOwnersBlock c={c} variant="section" /> : null}
              {found || c.warnings.length > 0 ? (
                <section className="sa-mc-sec" aria-label="Official Warnings">
                  <CaseWarningsSection c={c} hideSendButton={found} />
                </section>
              ) : null}
              {found ? <Ownership c={c} openDialog={open} /> : null}
              <Activity c={c} now={now} />
              <Resolve c={c} openDialog={open} />
              </div>
              )}
            </>
          )}

      <CaseDialogs c={c} dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
