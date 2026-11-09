import type { Evidence } from '../data/types';
import { fmtDateTime } from '../../preview/lib/format';
import { Badge } from './Badge';
import { EVIDENCE_ICON } from './icons';

const KIND_LABEL: Record<Evidence['kind'], string> = { photo: 'Photo', video: 'Video', sighting: 'Sighting', cctv: 'CCTV', document: 'Document' };

/** A thumbnail card. In the preview the art is a neutral placeholder; no real photographs are bundled. */
export function EvidenceTile({ item, reviewed, onOpen }: { item: Evidence; reviewed?: boolean; onOpen: () => void }) {
  const Icon = EVIDENCE_ICON[item.kind];
  return (
    <button type="button" className="sa-tile" onClick={onOpen} aria-label={`Open ${item.label}`}>
      <span className="sa-tile__art"><Icon size={26} aria-hidden="true" /></span>
      <span className="sa-tile__cap">
        <strong>{item.label}</strong>
        <span className="sa-text-3">{KIND_LABEL[item.kind]} · {fmtDateTime(item.capturedAt).split(' · ')[0]}</span>
        {reviewed ? <span className="mt-1.5 block"><Badge tone="sage">Reviewed</Badge></span> : null}
      </span>
    </button>
  );
}
