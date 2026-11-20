import type { Media } from '../data/types';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const IMAGE_EXT_RE = /\.(jpe?g|png|webp|heic|heif|bmp|gif)$/i;
const VIDEO_EXT_RE = /\.(mp4|mov|webm|m4v|3gp|avi|mkv)$/i;

function inferMediaKind(file: File): 'photo' | 'video' | null {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'photo';
  if (t.startsWith('video/')) return 'video';
  const name = file.name || '';
  if (IMAGE_EXT_RE.test(name)) return 'photo';
  if (VIDEO_EXT_RE.test(name)) return 'video';
  return null;
}

function inferredMimeType(file: File, kind: 'photo' | 'video'): string {
  const t = (file.type || '').toLowerCase();
  if (t) return t;
  const name = (file.name || '').toLowerCase();
  if (kind === 'video') return 'video/mp4';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function readFileBytes(file: File, existingObjectUrl?: string): Promise<ArrayBuffer | null> {
  try {
    const buf = await file.arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch {
    // Fallback below for Android WebView content:// URIs
  }
  try {
    const buf = await new Response(file).arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch {
    // Fallback below
  }
  try {
    const buf = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error('No buffer'));
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsArrayBuffer(file);
    });
    if (buf && buf.byteLength > 0) return buf;
  } catch {
    // Fallback below
  }
  const tempUrl = existingObjectUrl || URL.createObjectURL(file);
  try {
    const res = await fetch(tempUrl);
    const buf = await res.arrayBuffer();
    if (buf && buf.byteLength > 0) return buf;
  } catch {
    // Exhausted byte readers
  } finally {
    if (!existingObjectUrl && tempUrl) URL.revokeObjectURL(tempUrl);
  }
  return null;
}

/**
 * Validates a batch of picked files and turns the good ones into Media (with an object URL for the preview).
 * Problems are reported in plain language and never block the rest of the batch; evidence is always optional.
 */
export function takeFiles(files: File[], existing: number, opts: { accept: 'photo' | 'both'; max: number }): { added: Media[]; errors: string[] } {
  const added: Media[] = [];
  const errors: string[] = [];
  for (const file of files) {
    if (existing + added.length >= opts.max) { errors.push(`You can add up to ${opts.max} files.`); break; }
    const kind = inferMediaKind(file);
    const isImage = kind === 'photo';
    const isVideo = kind === 'video';
    if (!isImage && !(isVideo && opts.accept === 'both')) { errors.push(`“${file.name}” is not ${opts.accept === 'both' ? 'a photo or video' : 'a photo'}.`); continue; }
    if (isImage && file.size > MAX_IMAGE_BYTES) { errors.push(`“${file.name}” is larger than 10 MB. Try a smaller photo.`); continue; }
    if (isVideo && file.size > MAX_VIDEO_BYTES) { errors.push(`“${file.name}” is larger than 50 MB. Try a shorter video.`); continue; }
    added.push({ id: `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, name: file.name, kind: isVideo ? 'video' : 'photo', size: file.size, url: URL.createObjectURL(file), file });
  }
  return { added, errors: Array.from(new Set(errors)) };
}

/**
 * Validates and immediately copies picked files into memory so Android WebView cannot
 * revoke temporary `content://` read permissions before the user submits the form.
 */
export async function takeFilesInMemory(
  files: File[],
  existing: number,
  opts: { accept: 'photo' | 'both'; max: number },
): Promise<{ added: Media[]; errors: string[] }> {
  const { added: validated, errors } = takeFiles(files, existing, opts);
  const materialized: Media[] = [];
  for (const item of validated) {
    const raw = item.file;
    if (!raw) continue;
    let buffered: File | null = null;
    const mime = inferredMimeType(raw, item.kind);
    const bytes = await readFileBytes(raw, item.url);
    if (bytes) {
      buffered = new File([bytes], raw.name || (item.kind === 'video' ? 'video.mp4' : 'photo.jpg'), {
        type: mime,
        lastModified: raw.lastModified,
      });
    } else if (item.kind === 'photo') {
      const jpeg = await redrawAsJpeg(raw);
      if (jpeg) {
        const base = (raw.name || 'upload').replace(/\.[a-z0-9]{2,5}$/i, '') || 'upload';
        buffered = new File([jpeg], `${base}.jpg`, { type: 'image/jpeg', lastModified: raw.lastModified });
      }
    }
    if (item.url) URL.revokeObjectURL(item.url);
    if (!buffered) {
      errors.push(`“${raw.name}” could not be read from your phone. Choose a local photo or video, or take a new one.`);
      continue;
    }
    materialized.push({
      ...item,
      name: buffered.name,
      size: buffered.size,
      url: URL.createObjectURL(buffered),
      file: buffered,
    });
  }
  return { added: materialized, errors: Array.from(new Set(errors)) };
}

export const revoke = (m: Media) => { if (m.url && m.file) URL.revokeObjectURL(m.url); };      // only an object URL made here, never a stored file's address

/** What the backend accepts (backend/app/utils/uploads.py): JPG, PNG, WEBP up to 10 MB and MP4 up to 50 MB, named with the extension. */
const SENDABLE: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4' };
/** A photo above this is redrawn smaller before sending: phone photos are often 4 to 8 MB, which is slow on mobile data. */
const SHRINK_ABOVE_BYTES = 2.5 * 1024 * 1024;
const MAX_SIDE = 2048;

/**
 * The file as the backend will take it, ready to send (phone -> backend -> Cloudinary). A HEIC photo, or a photo over 2.5 MB, is
 * redrawn as a JPEG at most 2048 px on its longest side; everything else is an in-memory copy (in the Android app a picked file may
 * refuse to stream at send time) named with its extension (Android often gives names without one). Throws a plain-language Error.
 */
export async function prepareForUpload(file: File): Promise<File> {
  const kind = inferMediaKind(file);
  const type = inferredMimeType(file, kind ?? 'photo');
  const base = (file.name || 'upload').replace(/\.[a-z0-9]{2,5}$/i, '') || 'upload';
  if (kind === 'video' || type.startsWith('video/')) {
    return new File([await readBytes(file)], `${base}.mp4`, { type: 'video/mp4' });
  }
  const sendable = SENDABLE[type];
  if (sendable && file.size <= SHRINK_ABOVE_BYTES) return new File([await readBytes(file)], `${base}.${sendable}`, { type });
  const jpeg = await redrawAsJpeg(file);
  if (jpeg) return new File([jpeg], `${base}.jpg`, { type: 'image/jpeg' });
  // Could not be redrawn here: send it as it is when the backend takes it, otherwise explain.
  if (sendable && file.size <= MAX_IMAGE_BYTES) return new File([await readBytes(file)], `${base}.${sendable}`, { type });
  throw new Error('this photo’s format can’t be sent from your phone. Take it with the "Take photo" button, or choose a JPG or PNG.');
}

async function readBytes(file: File): Promise<ArrayBuffer> {
  const buf = await readFileBytes(file);
  if (buf) return buf;
  throw new Error('the file could not be read from your phone. Choose it again, or take a new one.');
}

/** The photo redrawn as a JPEG (turned the right way up), or null when this web view cannot decode it (HEIC on some phones). */
async function redrawAsJpeg(file: File): Promise<Blob | null> {
  let source: ImageBitmap | HTMLImageElement | null = null;
  let objectUrl: string | null = null;
  try {
    try { source = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch {
      objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.src = objectUrl;
      await img.decode();
      source = img;
    }
    const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!w || !h) return null;
    const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  } catch {
    return null;
  } finally {
    if (source && 'close' in source) source.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
