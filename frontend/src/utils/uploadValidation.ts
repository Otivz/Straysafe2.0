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

/**
 * The kind of a picked file: by its name, else by its MIME type. Android's photo picker and camera often hand over names
 * with no extension (e.g. "1000012345") or HEIC photos, which the name alone would reject.
 */
export function getFileKind(file: File): MediaKind {
    const byName = getMediaKind(file.name);
    if (byName !== 'unknown') return byName;
    const type = (file.type || '').toLowerCase();
    if (type.startsWith('image/')) return 'image';
    if (type.startsWith('video/')) return 'video';
    if (type === 'application/pdf' || type === 'application/msword' || type.includes('officedocument.wordprocessingml')) return 'document';
    return 'unknown';
}

export interface FileValidationResult {
    valid: boolean;
    kind: MediaKind;
    error?: string;
}

export function validateFile(file: File): FileValidationResult {
    const kind = getFileKind(file);
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
