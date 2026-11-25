import { useMemo, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polygon, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { ArrowRight, Crosshair, Flame } from 'lucide-react';
import MapAutoResize from '../../components/MapControls/MapAutoResize';
import { OSM_TILES, areaCenter, areaOutline, reportingCoverage } from '../../preview/geo';
import { OUTLINE_STYLE, RADIUS_STYLE } from '../../preview/map/styles';
import { ANIMAL_TYPES, CATEGORIES } from '../data/constants';
import type { Case } from '../data/types';
import { HOTSPOT_JOIN_M, computeHotspots, type PinnedCase } from '../lib/hotspots';
import '../../preview/map/map.css';

const PRIORITY_STYLE: Record<Case['priority'], { color: string; fillColor: string; label: string }> = {
  urgent: { color: '#991b1b', fillColor: '#dc2626', label: 'Urgent' },
  high: { color: '#92400e', fillColor: '#d97706', label: 'High priority' },
  normal: { color: '#9a3412', fillColor: '#c25216', label: 'Normal' },
  low: { color: '#57534e', fillColor: '#a8a29e', label: 'Low' },
};

/** Hotspot zone colours: amber for 2-3 cases, red for 4 or more or any open urgent case inside. */
const HOTSPOT_STYLE = {
  amber: { color: '#b45309', fillColor: '#f59e0b', label: 'Amber' },
  red: { color: '#b91c1c', fillColor: '#ef4444', label: 'Red' },
} as const;

function RecenterControl() {
  const map = useMap();
  const center = areaCenter();
  return (
    <button
      type="button"
      onClick={() => map.flyTo(center, 16, { duration: 0.35 })}
      className="absolute right-3 top-3 z-[400] inline-flex items-center gap-1.5 rounded-lg border border-[#e7e2da] bg-white/95 px-2.5 py-1.5 text-[12px] font-medium text-[#292524] shadow-sm backdrop-blur-xs transition-colors hover:bg-[#fbf6ee]"
      title="Center map on subdivision"
    >
      <Crosshair size={13} aria-hidden="true" />
      <span>Center on subdivision</span>
    </button>
  );
}

/**
 * Interactive Leaflet map showing filtered or period cases inside the subdivision reporting area. Zones where two or more of those cases
 * are pinned within about 70 m of each other are drawn as translucent hotspot circles behind the pins (computed from `cases`, never fixed).
 */
export default function CasesMap({
  cases,
  onSelect,
  height = 460,
}: {
  cases: Case[];
  onSelect: (caseId: string) => void;
  height?: number;
}) {
  const center = areaCenter();
  const radius = reportingCoverage().radius_meters;
  const pinned = useMemo(
    () =>
      cases.filter(
        (c): c is PinnedCase =>
          typeof c.location.lat === 'number' &&
          Number.isFinite(c.location.lat) &&
          typeof c.location.lng === 'number' &&
          Number.isFinite(c.location.lng),
      ),
    [cases],
  );
  const hotspots = useMemo(() => computeHotspots(pinned), [pinned]);
  // On by default while there are hotspots; the Leader's own choice wins from the first click on
  const [hotspotChoice, setHotspotChoice] = useState<boolean | null>(null);
  const showHotspots = hotspots.length > 0 && (hotspotChoice ?? true);

  return (
    <div className="overflow-hidden rounded-[var(--sa-radius-lg)] border border-[#e7e2da] bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7e2da] bg-[#fcfaf6] px-4 py-2.5 text-[12.5px] text-[var(--sa-ink-2)]">
        <span className="font-medium">
          Showing <strong className="sa-num text-[var(--sa-ink)]">{pinned.length}</strong> of{' '}
          <strong className="sa-num text-[var(--sa-ink)]">{cases.length}</strong> cases with map pins
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-pressed={showHotspots}
            disabled={hotspots.length === 0}
            onClick={() => setHotspotChoice(!showHotspots)}
            title={hotspots.length === 0 ? `No place has 2 or more cases pinned within ${HOTSPOT_JOIN_M} m of each other` : 'Show or hide the hotspot zones'}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              showHotspots ? 'border-[#d97706] bg-[#fef3c7] text-[#92400e]' : 'border-[#e7e2da] bg-white text-[var(--sa-ink-2)] hover:bg-[#fbf6ee]'
            }`}
          >
            <Flame size={13} aria-hidden="true" />
            Hotspots ({hotspots.length})
          </button>
          {(['urgent', 'high', 'normal', 'low'] as const).map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 text-[12px]">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full border"
                style={{ backgroundColor: PRIORITY_STYLE[p].fillColor, borderColor: PRIORITY_STYLE[p].color }}
              />
              {PRIORITY_STYLE[p].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full border"
              style={{ backgroundColor: '#a8a29e', borderColor: '#78716c' }}
            />
            Closed
          </span>
          {showHotspots ? (
            <span className="inline-flex items-center gap-1.5 text-[12px]" title="Amber: 2-3 cases close together. Red: 4 or more, or an open urgent case.">
              <span
                className="inline-block h-3 w-3 rounded-full border"
                style={{ backgroundColor: 'rgba(245, 158, 11, 0.25)', borderColor: HOTSPOT_STYLE.amber.color }}
              />
              <span
                className="-ml-1 inline-block h-3 w-3 rounded-full border"
                style={{ backgroundColor: 'rgba(239, 68, 68, 0.25)', borderColor: HOTSPOT_STYLE.red.color }}
              />
              Hotspot
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative" style={{ height }}>
        <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
          <MapAutoResize />
          <TileLayer {...OSM_TILES} />
          <Circle center={center} radius={radius} pathOptions={RADIUS_STYLE} />
          <Polygon positions={areaOutline()} pathOptions={OUTLINE_STYLE} />
          <RecenterControl />
          {showHotspots ? hotspots.map((h) => {
            const st = HOTSPOT_STYLE[h.tier];
            return (
              <Circle
                key={`hotspot-${h.key}`}
                center={[h.lat, h.lng]}
                radius={h.radiusM}
                pathOptions={{ color: st.color, fillColor: st.fillColor, fillOpacity: 0.2, weight: 1.5, dashArray: '4 4' }}
              >
                <Tooltip sticky direction="top">
                  <span className="font-semibold">{h.area}</span> · {h.total} cases
                </Tooltip>
                <Popup>
                  <div className="min-w-[190px] space-y-1 text-[12.5px]">
                    <p className="m-0 text-[11px] font-semibold uppercase tracking-wide" style={{ color: st.color }}>{st.label} hotspot</p>
                    <p className="m-0 font-semibold text-[#1c1917]">{h.area}</p>
                    <p className="m-0 text-[#57534e]"><strong>{h.total}</strong> cases in this hotspot</p>
                    <p className="m-0 text-[#78716c]">{h.urgent} urgent · {h.open} open · {h.closed} closed</p>
                  </div>
                </Popup>
              </Circle>
            );
          }) : null}
          {pinned.map((c) => {
            const st = PRIORITY_STYLE[c.priority];
            const closed = c.status === 'closed';
            return (
              <CircleMarker
                key={c.id}
                center={[c.location.lat, c.location.lng]}
                radius={c.priority === 'urgent' && !closed ? 9 : 7}
                pathOptions={{
                  color: closed ? '#78716c' : st.color,
                  fillColor: closed ? '#a8a29e' : st.fillColor,
                  fillOpacity: closed ? 0.55 : 0.9,
                  weight: 2,
                }}
              >
                <Tooltip direction="top" offset={[0, -8]}>
                  <span className="font-semibold">{c.id}</span> · {c.title}
                </Tooltip>
                <Popup>
                  <div className="min-w-[200px] space-y-1.5 text-[12.5px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-[#78716c]">{c.id}</span>
                      <span className="rounded-full bg-[#fbf5ec] px-2 py-0.5 text-[11px] font-semibold text-[#9a3412]">
                        {c.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="m-0 font-semibold text-[#1c1917]">{c.title}</p>
                    <p className="m-0 text-[#57534e]">
                      {CATEGORIES[c.category].label} · {ANIMAL_TYPES[c.animal.type]}
                    </p>
                    {c.location.area ? <p className="m-0 text-[#78716c]">{c.location.area}</p> : null}
                    <button
                      type="button"
                      onClick={() => onSelect(c.id)}
                      className="mt-1 inline-flex items-center gap-1 rounded-md bg-[#c25216] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#a84410]"
                    >
                      <span>Open case</span>
                      <ArrowRight size={12} aria-hidden="true" />
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
