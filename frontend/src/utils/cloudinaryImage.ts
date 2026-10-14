// Display-size Cloudinary images (STRAYSAFE_PERFORMANCE_AUDIT.md H6 / C2).
// Cloudinary resizes on the fly from the same stored original when the URL asks for it:
//   https://res.cloudinary.com/<cloud>/image/upload/f_auto,q_auto,c_limit,w_240/v123/folder/photo.jpg
// f_auto = best format for the browser (WebP/AVIF), q_auto = visually lossless compression, c_limit = only ever shrink.
// ONLY for showing an image small (avatars, list / card thumbnails). Never for what is saved, sent to the AI, used
// as evidence, opened full-screen or downloaded: those keep the original URL.

const UPLOAD_MARKER = '/image/upload/';
// A URL that already carries a transformation is left exactly as it is
const HAS_TRANSFORM = /^(?:[a-z]{1,3}_[^/]+,?)+\//;

export function cloudinaryResized(url: string | null | undefined, width: number): string {
    if (!url || typeof url !== 'string' || !url.includes('res.cloudinary.com') || !width) return url || '';
    const i = url.indexOf(UPLOAD_MARKER);
    if (i === -1) return url;  // videos (/video/upload/) and raw files stay untouched
    const rest = url.slice(i + UPLOAD_MARKER.length);
    if (HAS_TRANSFORM.test(rest)) return url;
    // Twice the displayed size, so it stays sharp on phone screens
    return `${url.slice(0, i + UPLOAD_MARKER.length)}f_auto,q_auto,c_limit,w_${Math.round(width)}/${rest}`;
}
