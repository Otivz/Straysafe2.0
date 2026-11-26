import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Eye, TrendingUp } from 'lucide-react';
import { adminPath } from '../config';
import { CATEGORIES } from '../data/constants';
import type { Case, CategoryId } from '../data/types';
import { WATCH_WINDOW_DAYS, computeWatchAreas, watchLine, watchTrend } from '../lib/watchAreas';
import { Badge } from './Badge';

const SHOWN = 3;

/**
 * "Watch areas" on the Dashboard: a place with several safety, injury or nuisance reports in a short time, shown before it gets worse
 * (lib/watchAreas.ts has the rules). It is a pattern, not a task: it disappears by itself when the cases close or age out, there is nothing to
 * dismiss, and with nothing to watch it shows nothing at all. For the Leader only; it gives a place and counts, never a name or what a
 * complaint says.
 */
export default function WatchAreas({ cases, now }: { cases: Case[]; now: Date }) {
  // `now` moves every minute (useNow), so the 14 days follow the clock even when the page stays open overnight
  const result = useMemo(() => computeWatchAreas(cases, now), [cases, now]);
  if (result.areas.length === 0) return null;
  const shown = result.areas.slice(0, SHOWN);
  const more = result.areas.length - shown.length;
  const byId = new Map(cases.map((c) => [c.id, c]));

  return (
    <section aria-labelledby="watch-h" id="watch-areas" className="sa-sec sa-watch sa-fade-up">
      <div className="sa-sec__head">
        <h2 id="watch-h" className="sa-sec__title">
          <Eye size={17} aria-hidden="true" />
          <span>Watch areas</span>
          <span className="sa-sec__count" aria-label={`${result.areas.length} areas`}>{result.areas.length}</span>
        </h2>
        <a href="#map-h" className="sa-sec__link">Show on the map</a>
      </div>
      <div className="sa-sec__card">
        <p className="sa-watch__sub">Places with several reports in the last {WATCH_WINDOW_DAYS} days, before they get worse. A pattern to look at, not a finding. Only you see this, and it shows no names or details.</p>
        <ul className="sa-watch__list">
          {shown.map((a, i) => {
            const trend = watchTrend(a);
            const mix = (Object.entries(a.byCategory) as [CategoryId, number][]).sort((x, y) => y[1] - x[1]).map(([cat, n]) => `${n} ${CATEGORIES[cat].label.toLowerCase()}`);
            return (
              <li key={a.key} className="sa-watch__item" data-tier={a.tier} style={{ ['--i' as string]: i }}>
                <span className="sa-watch__icon" aria-hidden="true"><Eye size={18} /></span>
                <div className="min-w-0">
                  <p className="sa-watch__title">
                    Watch area: {a.area}
                    <Badge tone={a.tier === 'high' ? 'red' : 'amber'}>{a.tier === 'high' ? 'High' : 'Watch'}</Badge>
                  </p>
                  <p className="sa-watch__line">
                    <strong>{watchLine(a)}</strong>
                    {trend ? <span className="sa-watch__trend"><TrendingUp size={13} aria-hidden="true" />{trend}</span> : null}
                  </p>
                  <p className="sa-watch__meta">{mix.join(' · ')} · {a.open} still open{a.urgentOpen > 0 ? ` · ${a.urgentOpen} urgent` : ''}</p>
                  <details className="sa-watch__cases">
                    <summary>See the {a.total} cases</summary>
                    <ul>
                      {a.caseIds.map((id) => {
                        const c = byId.get(id);
                        return c ? <li key={id}><Link to={adminPath(`/cases/${id}`)}><span className="sa-ref">{id}</span> {c.title}</Link></li> : null;
                      })}
                    </ul>
                  </details>
                </div>
              </li>
            );
          })}
        </ul>
        {more > 0 || result.unplaced > 0 ? (
          <div className="sa-sec__foot">
            <span>
              {more > 0 ? `${more} more watch ${more === 1 ? 'area' : 'areas'} after these` : ''}
              {more > 0 && result.unplaced > 0 ? ' · ' : ''}
              {result.unplaced > 0 ? `${result.unplaced} recent ${result.unplaced === 1 ? 'report has' : 'reports have'} no pin and ${result.unplaced === 1 ? 'is' : 'are'} not counted` : ''}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
