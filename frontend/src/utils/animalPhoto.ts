import api from './api';
import { uploadDirectToCloudinary } from './cloudinaryUpload';

// One animal's photo for a multi-animal split or a close-up replacement (MULTI_ANIMAL_REPORT_PLAN.md).
// The photo first goes through the same AI photo check as residents' report photos (a dog or cat, and only one),
// then it is uploaded to Cloudinary. Returns the stored URL and what the check saw.
// The AI only advises: when it says "no animal" or "more than one", the error carries the reason so the person can
// look at the crop and still choose to use it (uploadAnimalPhotoAnyway).

export interface CheckedAnimalPhoto {
    url: string;
    animalType?: string | null;
    color?: string | null;
}

export class AnimalPhotoCheckError extends Error {
    code: 'no_animal' | 'multiple' | 'rejected';
    constructor(code: 'no_animal' | 'multiple' | 'rejected', message: string) {
        super(message);
        this.code = code;
    }
}

export async function checkAndUploadAnimalPhoto(file: File): Promise<CheckedAnimalPhoto> {
    const form = new FormData();
    form.append('file', file);
    let ai: any = null;
    try {
        const res = await api.post('/reports/analyze-media', form);
        ai = res.data;
    } catch (e: any) {
        const msg = e?.response?.data?.detail;
        if (e?.response?.status && e.response.status < 500 && msg) {
            throw new AnimalPhotoCheckError('rejected', typeof msg === 'string' ? msg : 'This photo was not accepted.');
        }
        ai = null; // the check is unavailable: the photo is still checked later by the background AI analysis
    }
    if (ai) {
        if (ai.animal_detected === false) {
            throw new AnimalPhotoCheckError('no_animal', 'The AI found no dog or cat in this photo. Draw the box around the animal, or upload a close-up.');
        }
        if (ai.multiple_animals_detected || Number(ai.detected_animal_count || 1) > 1) {
            throw new AnimalPhotoCheckError('multiple', 'The AI thinks more than one animal is in this photo. Crop it tighter so only one animal is inside the box.');
        }
    }
    const up = await uploadDirectToCloudinary(file, 'reports');
    return { url: up.url, animalType: ai?.animal_type || null, color: ai?.dominant_color || ai?.color || null };
}

/** The person looked at the crop and decided it shows the one animal: upload it without the AI check. */
export async function uploadAnimalPhotoAnyway(file: File): Promise<CheckedAnimalPhoto> {
    const up = await uploadDirectToCloudinary(file, 'reports');
    return { url: up.url };
}
