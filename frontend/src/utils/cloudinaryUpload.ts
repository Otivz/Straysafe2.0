import axios from 'axios';
import { getMediaKind, validateFile, type MediaKind } from './uploadValidation';

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export interface CloudinaryUploadResult {
    url: string;
    kind: MediaKind;
}

export type UploadProgressCallback = (percent: number) => void;

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
            url: response.data.secure_url as string,
            kind: getMediaKind(file.name),
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

