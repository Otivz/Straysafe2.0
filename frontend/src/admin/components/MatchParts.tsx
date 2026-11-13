import { Cat, Dog, PawPrint, ScanSearch } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { relative } from '../../preview/lib/format';
import { levelLabel, matchSentence } from '../data/selectors';
import type { MatchLevel, MatchSide, PossibleMatch } from '../data/types';
import { Badge } from './Badge';
import { Button } from './Button';

/** The animal's own photo, or its kind on a neutral square when the report has none. */
export function MatchPhoto({ side, size = 'sm' }: { side: MatchSide; size?: 'sm' | 'lg' }) {
  const Icon = side.species === 'Dog' ? Dog : side.species === 'Cat' ? Cat : PawPrint;
  return (
    <span className={cx('sa-mphoto', `sa-mphoto--${size}`)} {...(side.photoUrl ? {} : { 'aria-hidden': true })}>
      {side.photoUrl ? <img src={side.photoUrl} alt={`Photo of ${side.title}`} loading="lazy" /> : <Icon size={size === 'sm' ? 22 : 48} strokeWidth={1.6} aria-hidden="true" />}
    </span>
  );
}

export const LevelBadge = ({ level }: { level: MatchLevel }) => <Badge tone={level === 'strong' ? 'brand' : 'neutral'} icon={ScanSearch}>{levelLabel(level)}</Badge>;
export const KindBadge = ({ kind }: { kind: 'lost' | 'found' }) => <Badge tone={kind === 'lost' ? 'brand' : 'sage'}>{kind === 'lost' ? 'Lost' : 'Found'}</Badge>;

/**
 * A possible match waiting for a Leader to decide: one row of the dashboard, with both animals (whichever report came first). Nothing is linked and
 * no resident is told until the Leader confirms. Renders a list item: the caller provides the list. (On a report the same match is one item of "Needs you".)
 */
export function MatchCard({ m, now, onReview }: { m: PossibleMatch; now: Date; onReview: (matchId: string) => void }) {
  const title = matchSentence(m);
  const reasons = m.reasons.slice(0, 2);
  return (
    <li className="sa-mcard">
      <div className="sa-mcard__main">
        <span className="sa-mpair" aria-hidden="true"><MatchPhoto side={m.lost} /><MatchPhoto side={m.found} /></span>
        <div className="sa-mcard__body">
          <p className="sa-mcard__top">
            <span className="sa-mcard__title">{title}</span>
            <LevelBadge level={m.level} />
          </p>
          <p className="sa-small">Found by {m.found.reporter?.name ?? 'a resident'} · missing-pet report by {m.lost.reporter?.name ?? 'a resident'}</p>
          {reasons.length > 0 ? <p className="sa-mcard__reasons">{reasons.map((r) => <Badge key={r} tone="sage">{r}</Badge>)}</p> : null}
          <p className="sa-meta">Checked automatically{m.createdAt ? ` ${relative(m.createdAt, now)}` : ''}. Nothing is linked until you confirm it.</p>
        </div>
      </div>
      <Button size="sm" variant="primary" aria-label={`Review match: ${title}`} onClick={() => onReview(m.id)}>Review match</Button>
    </li>
  );
}
