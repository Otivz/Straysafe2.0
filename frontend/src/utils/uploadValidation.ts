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
