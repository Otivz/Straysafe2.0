import { Maximize2, Play } from 'lucide-react';
import type { Evidence } from '../data/types';
import { fmtDateTime } from '../../preview/lib/format';
import { Badge } from './Badge';
import { EVIDENCE_ICON } from './icons';

const KIND_LABEL: Record<Evidence['kind'], string> = { photo: 'Photo', video: 'Video', sighting: 'Sighting', cctv: 'CCTV', document: 'Document' };

/** A thumbnail card. The photo or video itself when the case has the stored file; otherwise a neutral placeholder. */
export function EvidenceTile({
  item,
  reviewed,
  onOpen,
}: {
  item: Evidence;
  reviewed?: boolean;
  onOpen: () => void;
}) {
  const Icon = EVIDENCE_ICON[item.kind];
  const isPhoto = item.url && item.kind === 'photo';
  const isVideo = item.url && (item.kind === 'video' || /\.(mp4|webm|mov|ogg)$/i.test(item.url));

  return (
    <button
      type="button"
      className="sa-tile group cursor-zoom-in text-left transition-all duration-150 hover:shadow-md hover:border-[var(--sa-line-control)] focus:outline-none focus:ring-2 focus:ring-[var(--sa-brand-tint)]"
      onClick={onOpen}
      aria-label={`Preview full screen for ${item.label}`}
    >
      <span className="sa-tile__art relative overflow-hidden bg-[var(--sa-sand)]">
        {isPhoto ? (
          <>
            <img
              src={item.url}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            <span
              className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              title="Click for full-screen preview"
            >
              <Maximize2 size={12} />
            </span>
          </>
        ) : isVideo ? (
          <>
            <div className="w-full h-full flex items-center justify-center bg-stone-900 text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 group-hover:bg-white/30 text-white shadow-lg transition-transform duration-200 group-hover:scale-110">
                <Play size={20} className="ml-0.5" />
              </span>
            </div>
            <span
              className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              title="Click for full-screen video playback"
            >
              <Maximize2 size={12} />
            </span>
          </>
        ) : (
          <Icon size={26} aria-hidden="true" />
        )}
      </span>
      <span className="sa-tile__cap">
        <strong>{item.label}</strong>
        <span className="sa-text-3">
          {KIND_LABEL[item.kind]} · {fmtDateTime(item.capturedAt).split(' · ')[0]}
        </span>
        {reviewed ? (
          <span className="mt-1.5 block">
            <Badge tone="sage">Reviewed</Badge>
          </span>
        ) : null}
      </span>
    </button>
  );
}
