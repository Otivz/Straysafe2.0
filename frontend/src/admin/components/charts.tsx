/**
 * Small hand-built SVG/HTML charts (no chart library). Follows the dataviz rules: thin marks, 2px lines, >=8px markers
 * with a surface ring, 4px rounded data-ends, solid hairline grids, one axis, a legend for two or more series, tooltips
 * that enhance but never gate, and a table view that carries every value.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { cx } from '../../preview/lib/cx';
import { Segmented } from './form';

/** Width of an element, kept current with a ResizeObserver (SVG text needs real pixels to stay crisp). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A chart card with its accessible twin: every chart can be viewed as a table. */
export function ChartCard({ title, description, table, children, className }: { title: string; description?: string; table: ReactNode; children: ReactNode; className?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  return (
    <figure className={cx('sa-panel sa-chartcard', className)}>
      <figcaption className="sa-chartcard__head">
        <div className="min-w-0">
          <h2 className="sa-h2">{title}</h2>
          {description ? <p className="sa-small sa-text-3 mt-0.5">{description}</p> : null}
        </div>
        <Segmented label={`${title}: view`} value={view} onChange={setView} options={[{ value: 'chart', label: 'Chart' }, { value: 'table', label: 'Table' }]} />
      </figcaption>
      {view === 'chart' ? children : <div className="sa-tablewrap">{table}</div>}
    </figure>
  );
}

export const DataTable = ({ caption, head, rows }: { caption: string; head: string[]; rows: Array<Array<string | number>> }) => (
  <table className="sa-table">
    <caption className="sa-sr-only">{caption}</caption>
    <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={i > 0 ? 'sa-right' : undefined}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r) => <tr key={String(r[0])}>{r.map((cell, i) => <td key={i} className={cx(i > 0 && 'sa-right sa-num')}>{cell}</td>)}</tr>)}</tbody>
  </table>
);

// --------------------------------------------------------------------------------------------------------- line chart
export interface LineSeries { id: string; label: string; color: string; values: number[]; area?: boolean }

function niceScale(max: number): { top: number; step: number } {
  const raw = Math.max(1, max) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10);
  return { top: Math.ceil(Math.max(1, max) / step) * step, step };
}

export function LineChart({ labels, series, height = 250, ariaLabel }: { labels: string[]; series: LineSeries[]; height?: number; ariaLabel: string }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const m = { t: 14, r: 22, b: 30, l: 34 };
  const W = Math.max(width, 300);
  const iw = W - m.l - m.r;
  const ih = height - m.t - m.b;
  const n = labels.length;
  const { top, step } = niceScale(Math.max(0, ...series.flatMap((s) => s.values)));
  const x = (i: number) => m.l + (n <= 1 ? iw / 2 : (iw * i) / (n - 1));
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(iw / 58))));

  const indexAt = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    return Math.min(n - 1, Math.max(0, Math.round(((clientX - rect.left - m.l) / iw) * (n - 1))));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive((a) => Math.min(n - 1, (a ?? -1) + 1)); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((a) => Math.max(0, (a ?? n) - 1)); }
    else if (e.key === 'Escape') setActive(null);
  };

  return (
    <div>
      <ul className="sa-legend" aria-label="Legend">
        {series.map((s) => <li key={s.id}><span className="sa-legend__line" style={{ background: s.color }} aria-hidden="true" />{s.label}</li>)}
      </ul>
      <div ref={box} className="sa-chart" onPointerMove={(e: PointerEvent) => setActive(indexAt(e.clientX))} onPointerLeave={() => setActive(null)}>
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label={ariaLabel} tabIndex={0} onKeyDown={onKey} onBlur={() => setActive(null)} style={{ overflow: 'visible' }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--sa-line)' : 'var(--sa-line-soft)'} strokeWidth={1} />
              <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="sa-chart__tick">{t}</text>
            </g>
          ))}
          {labels.map((l, i) => (i % every === 0 ? <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle" className="sa-chart__tick">{l}</text> : null))}
          {active !== null ? <line x1={x(active)} x2={x(active)} y1={m.t} y2={m.t + ih} stroke="var(--sa-line-control)" strokeWidth={1} /> : null}
          {series.map((s) => {
            const pts = s.values.map((v, i) => `${x(i)},${y(v)}`);
            return (
              <g key={s.id}>
                {s.area && n > 1 ? <path d={`M${x(0)},${y(0)} L${pts.join(' L')} L${x(n - 1)},${y(0)} Z`} fill={s.color} fillOpacity={0.1} /> : null}
                <polyline points={pts.join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={active === i ? 5 : 4} fill={s.color} stroke="var(--sa-surface)" strokeWidth={2} />)}
              </g>
            );
          })}
        </svg>
        {active !== null ? (
          <div className="sa-chart__tip" role="status" style={{ left: x(active), top: m.t, transform: x(active) > W * 0.6 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)' }}>
            <p className="sa-chart__tipHead">{labels[active]}</p>
            {series.map((s) => (
              <p key={s.id} className="sa-chart__tipRow"><span className="sa-legend__line" style={{ background: s.color }} aria-hidden="true" /><strong>{s.values[active]}</strong><span>{s.label}</span></p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------ ranked bars
export interface BarRow { id: string; label: string; value: number }

/** One series, ranked, one hue. Bars are thin with a rounded data-end; the value sits at the tip. */
export function BarList({ rows, color = 'var(--sa-chart-1)', unit, emptyText }: { rows: BarRow[]; color?: string; unit: string; emptyText?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((n, r) => n + r.value, 0);
  if (rows.length === 0 || total === 0) return <p className="sa-small sa-text-2">{emptyText ?? 'Nothing to show for this period.'}</p>;
  return (
    <ul className="sa-bars" aria-label="Ranked bars">
      {rows.map((r) => {
        const pct = Math.round((r.value / total) * 100);
        return (
          <li key={r.id} className="sa-bars__row" title={`${r.label}: ${r.value} ${unit} (${pct}%)`}>
            <span className="sa-bars__label">{r.label}</span>
            <span className="sa-bars__track">
              {r.value > 0 ? <span className="sa-bars__bar" style={{ width: `${(r.value / max) * 100}%`, background: color }} /> : null}
              <span className="sa-bars__value sa-num"><strong>{r.value}</strong><span> · {pct}%</span></span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------------------------- segmented bar
export interface SegPart { id: string; label: string; value: number; color: string; ink: 'light' | 'dark' }

/** One whole split into parts (<= 6). Shares print inside a block only when they fit; the legend names every part. */
export function SegmentedBar({ parts, ariaLabel }: { parts: SegPart[]; ariaLabel: string }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const total = parts.reduce((n, p) => n + p.value, 0);
  const visible = parts.filter((p) => p.value > 0);
  const usable = Math.max(0, width - 2 * Math.max(0, visible.length - 1));
  if (total === 0) return <p className="sa-small sa-text-2">No cases were closed in this period.</p>;
  return (
    <div>
      <div ref={box} className="sa-segbar" role="img" aria-label={`${ariaLabel}. ${parts.map((p) => `${p.label}: ${p.value} (${Math.round((p.value / total) * 100)}%)`).join('; ')}`}>
        {visible.map((p) => {
          const pct = Math.round((p.value / total) * 100);
          const px = (p.value / total) * usable;
          return (
            <span key={p.id} className="sa-segbar__part" style={{ flexGrow: p.value, background: p.color, color: p.ink === 'light' ? '#fff' : 'var(--sa-ink)' }} title={`${p.label}: ${p.value} (${pct}%)`}>
              {px >= 56 ? `${pct}%` : null}
            </span>
          );
        })}
      </div>
      <ul className="sa-legend mt-3" aria-label="Legend">
        {parts.map((p) => <li key={p.id}><span className="sa-legend__swatch" style={{ background: p.color }} aria-hidden="true" />{p.label}</li>)}
      </ul>
    </div>
  );
}
