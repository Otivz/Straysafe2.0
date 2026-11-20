import { Cat, Dog, PawPrint, ScanSearch } from 'lucide-react';
import { cx } from '../../preview/lib/cx';
import { relative } from '../../preview/lib/format';
import { levelLabel, matchSentence } from '../data/selectors';
import type { MatchAnalysis, MatchLevel, MatchSide, PossibleMatch } from '../data/types';
import { Badge } from './Badge';
import { Button } from './Button';
import { useMediaViewer } from './MediaLightbox';

/** The animal's own photo, or its kind on a neutral square when the report has none. */
export function MatchPhoto({ side, size = 'sm' }: { side: MatchSide; size?: 'sm' | 'lg' }) {
  const { openMedia } = useMediaViewer();
  const Icon = side.species === 'Dog' ? Dog : side.species === 'Cat' ? Cat : PawPrint;
  return (
    <span
      className={cx('sa-mphoto', `sa-mphoto--${size}`, side.photoUrl && 'cursor-zoom-in transition-transform duration-200 hover:scale-105')}
      {...(side.photoUrl ? {
        role: 'button',
        tabIndex: 0,
        onClick: (e) => {
          e.stopPropagation();
          openMedia([{ url: side.photoUrl!, kind: 'photo', title: side.title, caption: `${side.species} · ${side.breed || ''}` }]);
        },
        onKeyDown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            openMedia([{ url: side.photoUrl!, kind: 'photo', title: side.title, caption: `${side.species} · ${side.breed || ''}` }]);
          }
        },
        'aria-label': `Preview photo of ${side.title}`,
      } : { 'aria-hidden': true })}
    >
      {side.photoUrl ? <img src={side.photoUrl} alt={`Photo of ${side.title}`} loading="lazy" /> : <Icon size={size === 'sm' ? 22 : 48} strokeWidth={1.6} aria-hidden="true" />}
    </span>
  );
}

export const LevelBadge = ({ level }: { level: MatchLevel }) => <Badge tone={level === 'strong' ? 'brand' : 'neutral'} icon={ScanSearch}>{levelLabel(level)}</Badge>;

const CLASS_TONE: Record<MatchAnalysis['classification'], 'brand' | 'sage' | 'neutral' | 'amber'> = {
  strong: 'brand', potential: 'sage', low: 'neutral', insufficient: 'amber', excluded: 'neutral',
};

/**
 * How a possible match was scored (backend utils/match_scoring.py): the overall similarity, how much information it rests on, each attribute's score and
 * the sentence that explains it, what could not be compared, and why. Everything shown comes from the server's comparison of the two records.
 */
export function MatchBreakdown({ analysis }: { analysis: MatchAnalysis }) {
  return (
    <section className="sa-mscore" aria-label="Matching breakdown">
      <div className="sa-mscore__head">
        <span className="sa-mscore__total">{analysis.score}%</span>
        <span className="sa-text-2">overall similarity</span>
        <Badge tone={CLASS_TONE[analysis.classification]}>{analysis.classificationLabel}</Badge>
        <span className="sa-small sa-text-3">{analysis.attributesCompared} of {analysis.attributesTotal} attributes compared · {analysis.coverage}% of the information</span>
      </div>
      <ul className="sa-mscore__attrs" aria-label="Matching details">
        {analysis.attributes.map((a) => (
          <li key={a.key} className="sa-mscore__attr" data-available={a.available}>
            <span className="sa-mscore__name">{a.label}</span>
            <span className="sa-mscore__num">{a.available && a.score !== null ? `${a.score}%` : '—'}</span>
            <span className="sa-mscore__text">{a.explanation}{a.available ? <span className="sa-text-3"> · weight {a.effectiveWeight}%</span> : null}</span>
            {a.available && a.score !== null ? (
              <span className="sa-mscore__bar" data-verdict={a.verdict} role="img" aria-label={`${a.label}: ${a.score}%`}><span style={{ width: `${a.score}%` }} /></span>
            ) : null}
          </li>
        ))}
      </ul>
      {analysis.notes.length > 0 ? <p className="sa-small sa-text-2">{analysis.notes.join(' ')}</p> : null}
      {analysis.computedOnView ? <p className="sa-small sa-text-3">This suggestion was made before multi-attribute matching; this is today’s comparison. Recalculate to store it.</p> : null}
      <p className="sa-small sa-text-3">{analysis.disclaimer}</p>
    </section>
  );
}
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
            {m.status === 'under_review' ? <Badge tone="amber">Under review</Badge> : null}
          </p>
          <p className="sa-small sa-text-2">{m.score}% overall similarity{typeof m.coverage === 'number' ? ` · based on ${m.coverage}% of the matching information` : ''}</p>
          <p className="sa-small">Found by {m.found.reporter?.name ?? 'a resident'} · missing-pet report by {m.lost.reporter?.name ?? 'a resident'}</p>
          {reasons.length > 0 ? <p className="sa-mcard__reasons">{reasons.map((r) => <Badge key={r} tone="sage">{r}</Badge>)}</p> : null}
          <p className="sa-meta">Checked automatically{m.createdAt ? ` ${relative(m.createdAt, now)}` : ''}. Nothing is linked until you confirm it.</p>
        </div>
      </div>
      <Button size="sm" variant="primary" aria-label={`Review match: ${title}`} onClick={() => onReview(m.id)}>Review match</Button>
    </li>
  );
}
