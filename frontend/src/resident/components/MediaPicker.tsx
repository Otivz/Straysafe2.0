import { useRef, useState, type DragEvent } from 'react';
import { Camera, ChevronLeft, ChevronRight, Film, ImagePlus, RefreshCw, Video, X } from 'lucide-react';
import type { Media } from '../data/types';
import { revoke, takeFilesInMemory } from '../lib/media';
import { Button } from './ui';

/**
 * Photo (and video where allowed) upload picker with preview, drag-and-drop, and remove/replace.
 * "Take photo" and "Record video" open the device camera (`capture`); on desktop they fall back to the file chooser.
 */
export function MediaPicker({
  value,
  onChange,
  accept = 'both',
  max = 5,
  invalid = false,
}: {
  value: Media[];
  onChange: (next: Media[]) => void;
  accept?: 'photo' | 'both';
  max?: number;
  invalid?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const photoCam = useRef<HTMLInputElement>(null);
  const videoCam = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewIdx, setPreviewIdx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const photoItems = value.filter((m) => m.url && m.kind === 'photo');

  const pick = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    for (const el of [input.current, replaceInput.current, photoCam.current, videoCam.current]) if (el) el.value = '';
    if (picked.length === 0) return;
    const { added, errors: problems } = await takeFilesInMemory(picked, value.length, { accept, max });
    setErrors(problems);
    if (added.length) onChange([...value, ...added]);
  };

  const replaceFirst = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (replaceInput.current) replaceInput.current.value = '';
    if (list.length === 0) return;
    const { added, errors: problems } = await takeFilesInMemory(list.slice(0, 1), 0, { accept, max: 1 });
    setErrors(problems);
    if (added.length > 0) {
      if (value[0]) revoke(value[0]);
      onChange([added[0], ...value.slice(1)]);
    }
  };

  const remove = (m: Media) => {
    revoke(m);
    onChange(value.filter((x) => x.id !== m.id));
    setErrors([]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (value.length < max) setDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (value.length < max && e.dataTransfer?.files?.length) {
      pick(e.dataTransfer.files);
    }
  };

  const currentPhoto = photoItems.length > 0 ? photoItems[((previewIdx % photoItems.length) + photoItems.length) % photoItems.length] : null;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`rounded-xl transition-colors ${
        invalid
          ? 'border-2 border-dashed border-[#b91c1c] bg-[#fef2f2]/60 p-3'
          : dragging
            ? 'border-2 border-dashed border-[#b45309] bg-[#fff7ed] p-3'
            : ''
      }`}
    >
      {/* Single photo preview card with Replace and Remove controls */}
      {photoItems.length === 1 && currentPhoto ? (
        <div className="mb-3 overflow-hidden rounded-xl border border-[#e7e2da] bg-[#faf6f0]">
          <div className="relative flex max-h-56 items-center justify-center bg-stone-900">
            <img src={currentPhoto.url} alt={currentPhoto.name} className="max-h-56 w-full object-contain" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="truncate font-medium text-[#292524]">{currentPhoto.name}</span>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => replaceInput.current?.click()}>
                Replace
              </Button>
              <Button size="sm" variant="ghost" icon={X} onClick={() => remove(currentPhoto)}>
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Interactive < image > preview slider when two or more photos are uploaded */}
      {photoItems.length >= 2 && currentPhoto && (
        <div className="relative mb-3 flex aspect-video max-h-56 items-center justify-center overflow-hidden rounded-xl border border-[var(--sa-line)] bg-stone-900 shadow-sm">
          <img
            src={currentPhoto.url}
            alt={currentPhoto.name}
            className="h-full w-full select-none object-contain"
          />

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setPreviewIdx((i) => i - 1);
            }}
            aria-label="Previous image"
            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow transition-all hover:bg-black/90 focus:outline-none"
            title="Previous image (<)"
          >
            <ChevronLeft size={18} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setPreviewIdx((i) => i + 1);
            }}
            aria-label="Next image"
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow transition-all hover:bg-black/90 focus:outline-none"
            title="Next image (>)"
          >
            <ChevronRight size={18} />
          </button>

          <span className="absolute bottom-2 right-2 rounded-full border border-white/10 bg-black/70 px-2.5 py-0.5 text-xs font-semibold text-white/90 shadow">
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

      <input ref={input} type="file" hidden multiple={max > 1} accept={accept === 'both' ? 'image/jpeg,image/png,image/webp,image/*,video/*' : 'image/jpeg,image/png,image/webp,image/*'} onChange={(e) => pick(e.target.files)} />
      <input ref={replaceInput} type="file" hidden accept="image/jpeg,image/png,image/webp,image/*" onChange={(e) => replaceFirst(e.target.files)} />
      <input ref={photoCam} type="file" hidden accept="image/*" capture="environment" onChange={(e) => pick(e.target.files)} />
      {accept === 'both' ? <input ref={videoCam} type="file" hidden accept="video/*" capture="environment" onChange={(e) => pick(e.target.files)} /> : null}
      {errors.length > 0 ? <ul className="rs-errorlist" role="alert">{errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
    </div>
  );
}
