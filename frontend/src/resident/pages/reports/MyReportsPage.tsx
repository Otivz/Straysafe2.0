import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Pencil, SearchX } from 'lucide-react';
import { ReportCard } from '../../components/Cards';
import { Select, SearchInput } from '../../components/form';
import { PrimaryScreen } from '../../components/Screen';
import { Button, Callout, ClaimPill, EmptyState, LinkButton, Section, Segmented } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { ENTRIES, ENTRY_IDS, entryOf, type EntryId } from '../../data/entries';
import { myReports, noticeById } from '../../data/selectors';
import { fmtDay } from '../../../preview/lib/format';
import { useNow } from '../../lib/hooks';

type Tab = 'active' | 'closed';

/** R14 — Every report this resident has made, plus their ownership claims. */
export default function MyReportsPage() {
  const { state } = useResidentData();
  const navigate = useNavigate();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<EntryId | 'all'>('all');

  const active = myReports(state, 'active');
  const closed = myReports(state, 'closed');
  const q = query.trim().toLowerCase();
  const shown = (tab === 'active' ? active : closed).filter((r) => (type === 'all' || entryOf(r.category) === type) && (!q || `${r.title} ${r.id} ${r.description}`.toLowerCase().includes(q)));
  const filtering = q !== '' || type !== 'all';
  const none = state.reports.length === 0;

  return (
    <PrimaryScreen title="My reports" docTitle="My reports" lead="Everything you have reported, and where it stands.">
      {state.draft ? (
        <Callout tone="amber" title="You have an unfinished report.">
          <span className="rs-row-actions rs-mt"><Button size="sm" variant="primary" icon={Pencil} onClick={() => navigate(residentPath('/report/details'))}>Continue</Button></span>
        </Callout>
      ) : null}

      {none ? (
        <EmptyState icon={ClipboardList} title="You haven’t reported anything yet" action={<LinkButton variant="primary" to={residentPath('/report')}>Report a concern</LinkButton>}>
          Reports you send appear here, with every update from the subdivision.
        </EmptyState>
      ) : (
        <>
          <Segmented<Tab> label="Report status" value={tab} onChange={setTab} options={[{ value: 'active', label: 'Active', count: active.length }, { value: 'closed', label: 'Closed', count: closed.length }]} />
          <div className="rs-filters">
            <SearchInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your reports" aria-label="Search your reports" />
            <Select value={type} onChange={(e) => setType(e.target.value as EntryId | 'all')} aria-label="Filter by type">
              <option value="all">All types</option>
              {ENTRY_IDS.map((id) => <option key={id} value={id}>{ENTRIES[id].filter}</option>)}
            </Select>
          </div>

          {shown.length > 0 ? (
            <ul className="rs-stack-sm rs-plain" aria-label={tab === 'active' ? 'Active reports' : 'Closed reports'}>
              {shown.map((r) => <li key={r.id}><ReportCard report={r} now={now} /></li>)}
            </ul>
          ) : filtering ? (
            <EmptyState icon={SearchX} title="No reports match" action={<Button onClick={() => { setQuery(''); setType('all'); }}>Clear search and filter</Button>}>
              Try a different word, or choose All types.
            </EmptyState>
          ) : (
            <EmptyState icon={ClipboardList} title={tab === 'active' ? 'Nothing active right now' : 'No closed reports yet'}>
              {tab === 'active' ? 'Reports that are still being handled show here.' : 'Reports appear here once a final outcome is recorded.'}
            </EmptyState>
          )}
        </>
      )}

      {state.claims.length > 0 ? (
        <Section title="Ownership claims">
          <div className="rs-stack-sm">
            {state.claims.map((c) => {
              const notice = noticeById(state, c.noticeId);
              return (
                <Link key={c.id} to={residentPath(`/claims/${c.id}`)} className="rs-card rs-card--link">
                  <span className="rs-card__text">
                    <span className="rs-card__title">{notice?.title ?? 'Found animal'}</span>
                    <span className="rs-card__meta">Claim sent {fmtDay(c.submittedAt)}</span>
                    <span className="rs-card__row"><ClaimPill status={c.status} /></span>
                  </span>
                </Link>
              );
            })}
          </div>
        </Section>
      ) : null}
    </PrimaryScreen>
  );
}
