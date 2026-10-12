// Shared client-side rules for file uploads (image / video / document).
// Mirrors backend/app/utils/uploads.py so users get instant feedback
// instead of waiting on a server round-trip to learn a file is rejected.

export type MediaKind = 'image' | 'video' | 'document' | 'unknown';

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff'];
const VIDEO_EXT = ['mp4', 'mov', 'avi', 'webm', 'mkv'];
const DOCUMENT_EXT = ['pdf', 'doc', 'docx'];

const MAX_SIZE_MB: Record<MediaKind, number> = {
    image: 10,
    video: 50,
    document: 15,
    unknown: 0,
};

export const UPLOAD_ACCEPT = {
    imageOnly: 'image/*',
    imageVideo: 'image/*,video/*',
    imageDocument: 'image/*,.pdf,.doc,.docx',
    imageVideoDocument: 'image/*,video/*,.pdf,.doc,.docx',
};

function extensionOf(nameOrUrl: string): string {
    const clean = nameOrUrl.split('?')[0].split('#')[0];
    const dot = clean.lastIndexOf('.');
    return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase();
}

export function getMediaKind(nameOrUrl: string): MediaKind {
    const ext = extensionOf(nameOrUrl);
    if (IMAGE_EXT.includes(ext)) return 'image';
    if (VIDEO_EXT.includes(ext)) return 'video';
    if (DOCUMENT_EXT.includes(ext)) return 'document';
    return 'unknown';
}

export interface FileValidationResult {
    valid: boolean;
    kind: MediaKind;
    error?: string;
}

export function validateFile(file: File): FileValidationResult {
    const kind = getMediaKind(file.name);
    if (kind === 'unknown') {
        const ext = extensionOf(file.name);
        return {
            valid: false,
            kind,
            error: `Unsupported file type "${ext || 'unknown'}". Allowed: images, videos, PDF/DOC/DOCX.`,
        };
    }

    const maxBytes = MAX_SIZE_MB[kind] * 1024 * 1024;
    if (file.size > maxBytes) {
        return {
            valid: false,
            kind,
            error: `File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum for ${kind} files is ${MAX_SIZE_MB[kind]}MB.`,
        };
    }

    return { valid: true, kind };
}

// Several pet photos / videos at once (claim proof). Same per-file limits as above, plus a count and a total.
export const CLAIM_MEDIA_LIMITS = { maxFiles: 5, maxTotalMB: 100 };
export const CLAIM_MEDIA_HINT =
    `Up to ${CLAIM_MEDIA_LIMITS.maxFiles} files · photos up to ${MAX_SIZE_MB.image} MB, videos up to ${MAX_SIZE_MB.video} MB each · ${CLAIM_MEDIA_LIMITS.maxTotalMB} MB total`;

export function validateMediaBatch(files: File[], alreadyOnFile = 0): { valid: boolean; error?: string } {
    if (files.length + alreadyOnFile > CLAIM_MEDIA_LIMITS.maxFiles) {
        const left = Math.max(0, CLAIM_MEDIA_LIMITS.maxFiles - alreadyOnFile);
        return { valid: false, error: `You can add up to ${CLAIM_MEDIA_LIMITS.maxFiles} photos or videos${alreadyOnFile ? ` (${alreadyOnFile} already on file, ${left} more allowed)` : ''}.` };
    }
    let total = 0;
    for (const f of files) {
        const r = validateFile(f);
        if (!r.valid) return { valid: false, error: `${f.name}: ${r.error}` };
        if (r.kind !== 'image' && r.kind !== 'video') return { valid: false, error: `${f.name}: only photos or videos can be added here.` };
        total += f.size;
    }
    if (total > CLAIM_MEDIA_LIMITS.maxTotalMB * 1024 * 1024) {
        return { valid: false, error: `These files add up to ${(total / (1024 * 1024)).toFixed(1)} MB. The limit is ${CLAIM_MEDIA_LIMITS.maxTotalMB} MB in total.` };
    }
    return { valid: true };
}
