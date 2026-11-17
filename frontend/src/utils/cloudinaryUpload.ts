import axios from 'axios';
import { getFileKind, validateFile, type MediaKind } from './uploadValidation';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export interface CloudinaryUploadResult {
    url: string;
    kind: MediaKind;
}

export type UploadProgressCallback = (percent: number) => void;

/**
 * The backend stores only .jpg/.jpeg/.png/.webp images and .mp4 videos (utils/uploads.py). Cloudinary keeps the original
 * format (a phone's HEIC photo, a .mov video), but converts on delivery when the link's extension changes, so other formats
 * are asked for as .jpg / .mp4.
 */
function deliverableUrl(url: string, resourceType: string): string {
    const m = url.match(/\.([a-z0-9]+)$/i);
    const ext = m ? m[1].toLowerCase() : '';
    if (resourceType === 'image' && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return m ? url.slice(0, -m[0].length) + '.jpg' : `${url}.jpg`;
    if (resourceType === 'video' && ext !== 'mp4') return m ? url.slice(0, -m[0].length) + '.mp4' : `${url}.mp4`;
    return url;
}

export async function uploadDirectToCloudinary(
    file: File,
    folder: string,
    onProgress?: UploadProgressCallback
): Promise<CloudinaryUploadResult> {
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

    try {
        const response = await axios.post(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (progressEvent) => {
                    if (progressEvent.total && onProgress) {
                        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        onProgress(percent);
                    }
                },
            }
        );

        return {
            url: deliverableUrl(response.data.secure_url as string, response.data.resource_type as string),
            kind: getFileKind(file),
        };
    } catch (err: any) {
        let message = 'Upload to Cloudinary failed.';
        if (axios.isAxiosError(err)) {
            message = err.response?.data?.error?.message || err.message || message;
        } else if (err instanceof Error) {
            message = err.message;
        }
        throw new Error(message);
    }
}

