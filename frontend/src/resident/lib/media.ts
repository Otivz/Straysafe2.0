import type { Media } from '../data/types';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/**
 * Validates a batch of picked files and turns the good ones into Media (with an object URL for the preview).
 * Problems are reported in plain language and never block the rest of the batch; evidence is always optional.
 */
export function takeFiles(files: File[], existing: number, opts: { accept: 'photo' | 'both'; max: number }): { added: Media[]; errors: string[] } {
  const added: Media[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (existing + added.length >= opts.max) { errors.push(`You can add up to ${opts.max} files.`); break; }
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !(isVideo && opts.accept === 'both')) { errors.push(`“${file.name}” is not ${opts.accept === 'both' ? 'a photo or video' : 'a photo'}.`); continue; }
    if (isImage && file.size > MAX_IMAGE_BYTES) { errors.push(`“${file.name}” is larger than 10 MB. Try a smaller photo.`); continue; }
    if (isVideo && file.size > MAX_VIDEO_BYTES) { errors.push(`“${file.name}” is larger than 50 MB. Try a shorter video.`); continue; }
    added.push({ id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, kind: isVideo ? 'video' : 'photo', size: file.size, url: URL.createObjectURL(file) });
  }
  return { added, errors: Array.from(new Set(errors)) };
}

export const revoke = (m: Media) => { if (m.url) URL.revokeObjectURL(m.url); };
