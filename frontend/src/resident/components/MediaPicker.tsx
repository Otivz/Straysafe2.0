import { useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, Film, ImagePlus, Video, X } from 'lucide-react';
import type { Media } from '../data/types';
import { revoke, takeFiles } from '../lib/media';
import { Button } from './ui';

/**
 * Optional evidence: photos (and videos where allowed) with previews and remove. Problems are shown in plain language and
 * never block the rest of the batch. Evidence is always optional, and nobody should go near an animal to get a photo.
 * "Take photo" and "Record video" open the device camera (`capture`); on a computer they fall back to the file chooser.
 * In the Android app, Capacitor hands a `capture` input to the phone's camera app, which needs no CAMERA permission.
 */
export function MediaPicker({ value, onChange, accept = 'both', max = 5 }: { value: Media[]; onChange: (next: Media[]) => void; accept?: 'photo' | 'both'; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const photoCam = useRef<HTMLInputElement>(null);
  const videoCam = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);

  const photoItems = value.filter((m) => m.url && m.kind === 'photo');

  const pick = (files: FileList | null) => {
    const { added, errors: problems } = takeFiles(Array.from(files ?? []), value.length, { accept, max });
    setErrors(problems);
    if (added.length) onChange([...value, ...added]);
    for (const el of [input.current, photoCam.current, videoCam.current]) if (el) el.value = '';
  };
  const remove = (m: Media) => { revoke(m); onChange(value.filter((x) => x.id !== m.id)); setErrors([]); };

  const currentPhoto = photoItems.length > 0 ? photoItems[((previewIdx % photoItems.length) + photoItems.length) % photoItems.length] : null;

  return (
    <div>
      {/* Interactive < image > preview slider when two or more photos are uploaded */}
      {photoItems.length >= 2 && currentPhoto && (
        <div className="relative mb-3 flex items-center justify-center rounded-xl border border-[var(--sa-line)] bg-stone-900 overflow-hidden shadow-sm aspect-video max-h-56">
          <img
            src={currentPhoto.url}
            alt={currentPhoto.name}
            className="w-full h-full object-contain select-none"
          />

          {/* < Previous button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setPreviewIdx((i) => i - 1);
            }}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow transition-all focus:outline-none"
            title="Previous image (<)"
          >
            <ChevronLeft size={18} />
          </button>

          {/* > Next button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setPreviewIdx((i) => i + 1);
            }}
            aria-label="Next image"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 shadow transition-all focus:outline-none"
            title="Next image (>)"
          >
            <ChevronRight size={18} />
          </button>

          {/* Counter */}
          <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-0.5 text-xs font-semibold text-white/90 border border-white/10 shadow">
            {(((previewIdx % photoItems.length) + photoItems.length) % photoItems.length) + 1} of {photoItems.length}
          </span>
        </div>
      )}

      {value.length > 0 ? (
        <ul className="rs-thumbs" aria-label="Selected files">
          {value.map((m) => (
            <li key={m.id} className="rs-thumb">
              {m.url && m.kind === 'photo' ? <img src={m.url} alt={m.name} /> : <span className="rs-thumb__ph">{m.kind === 'video' ? <Film size={22} aria-hidden="true" /> : 'Photo'}<small>{m.name}</small></span>}
              <button type="button" className="rs-thumb__remove" aria-label={`Remove ${m.name}`} onClick={() => remove(m)}><X size={14} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      ) : null}
      {value.length < max ? (
        <div className="flex flex-col gap-2">
          <div className={accept === 'both' ? 'grid grid-cols-2 gap-2' : undefined}>
            <Button icon={Camera} block onClick={() => photoCam.current?.click()}>Take photo</Button>
            {accept === 'both' ? <Button icon={Video} block onClick={() => videoCam.current?.click()}>Record video</Button> : null}
          </div>
          <Button icon={ImagePlus} block onClick={() => input.current?.click()}>Choose from gallery</Button>
        </div>
      ) : <p className="rs-hint">You have added the most files you can ({max}).</p>}
      <input ref={input} type="file" hidden multiple accept={accept === 'both' ? 'image/*,video/*' : 'image/*'} onChange={(e) => pick(e.target.files)} />
      <input ref={photoCam} type="file" hidden accept="image/*" capture="environment" onChange={(e) => pick(e.target.files)} />
      {accept === 'both' ? <input ref={videoCam} type="file" hidden accept="video/*" capture="environment" onChange={(e) => pick(e.target.files)} /> : null}
      {errors.length > 0 ? <ul className="rs-errorlist" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
    </div>
  );
}
