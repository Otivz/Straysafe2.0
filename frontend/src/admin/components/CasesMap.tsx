import { useMemo } from 'react';
import { Circle, CircleMarker, MapContainer, Polygon, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { ArrowRight, Crosshair } from 'lucide-react';
import MapAutoResize from '../../components/MapControls/MapAutoResize';
import { OSM_TILES, areaCenter, areaOutline, reportingCoverage } from '../../preview/geo';
import { OUTLINE_STYLE, RADIUS_STYLE } from '../../preview/map/styles';
import { ANIMAL_TYPES, CATEGORIES } from '../data/constants';
import type { Case } from '../data/types';
import '../../preview/map/map.css';

const PRIORITY_STYLE: Record<Case['priority'], { color: string; fillColor: string; label: string }> = {
  urgent: { color: '#991b1b', fillColor: '#dc2626', label: 'Urgent' },
  high: { color: '#92400e', fillColor: '#d97706', label: 'High priority' },
  normal: { color: '#9a3412', fillColor: '#c25216', label: 'Normal' },
};

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

/** Interactive Leaflet map showing filtered or period cases inside the subdivision reporting area. */
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
        (c): c is Case & { location: { lat: number; lng: number } } =>
          typeof c.location.lat === 'number' &&
          Number.isFinite(c.location.lat) &&
          typeof c.location.lng === 'number' &&
          Number.isFinite(c.location.lng),
      ),
    [cases],
  );

  return (
    <div className="overflow-hidden rounded-[var(--sa-radius-lg)] border border-[#e7e2da] bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7e2da] bg-[#fcfaf6] px-4 py-2.5 text-[12.5px] text-[var(--sa-ink-2)]">
        <span className="font-medium">
          Showing <strong className="sa-num text-[var(--sa-ink)]">{pinned.length}</strong> of{' '}
          <strong className="sa-num text-[var(--sa-ink)]">{cases.length}</strong> cases with map pins
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {(['urgent', 'high', 'normal'] as const).map((p) => (
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
        </div>
      </div>

      <div className="relative" style={{ height }}>
        <MapContainer center={center} zoom={16} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
          <MapAutoResize />
          <TileLayer {...OSM_TILES} />
          <Circle center={center} radius={radius} pathOptions={RADIUS_STYLE} />
          <Polygon positions={areaOutline()} pathOptions={OUTLINE_STYLE} />
          <RecenterControl />
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
