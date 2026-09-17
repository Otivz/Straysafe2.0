// Uploads a file directly from the browser to Cloudinary using the unsigned
// preset, bypassing the FastAPI backend entirely for the file bytes. Used for
// attachments (chat, claim evidence) so large files - especially video - don't
// have to round-trip through our server's bandwidth. The backend only ever
// sees the resulting URL, which it re-validates before storing (see
// backend/app/utils/uploads.py::validate_cloudinary_url).
import { getMediaKind, validateFile, type MediaKind } from './uploadValidation';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export interface CloudinaryUploadResult {
    url: string;
    kind: MediaKind;
}

export async function uploadDirectToCloudinary(file: File, folder: string): Promise<CloudinaryUploadResult> {
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
        throw new Error('Cloudinary is not configured (missing VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_UPLOAD_PRESET).');
    }

    const validation = validateFile(file);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', folder);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        let message = 'Upload to Cloudinary failed.';
        try {
            const errBody = await response.json();
            message = errBody?.error?.message || message;
        } catch {
            // ignore parse failure, use default message
        }
        throw new Error(message);
    }

    const data = await response.json();
    return { url: data.secure_url as string, kind: getMediaKind(file.name) };
}
