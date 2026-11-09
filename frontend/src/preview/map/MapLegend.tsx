import './map.css';

export type KeyKind = 'outline' | 'radius' | 'area' | 'pin' | 'dot' | 'latest';

/** A one-line key under a map. The symbols are drawn with CSS to match the markers and overlays. */
export function MapLegend({ items }: { items: { kind: KeyKind; label: string }[] }) {
  return (
    <ul className="pv-legend" aria-label="Map key">
      {items.map((i) => <li key={i.label}><span className={`pv-key pv-key--${i.kind}`} aria-hidden="true" />{i.label}</li>)}
    </ul>
  );
}
