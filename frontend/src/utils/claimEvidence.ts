export type ClaimDocumentType = 'vaccine_card' | 'vet_record' | 'registration_record' | 'additional_photo' | 'evidence';

export interface ClaimEvidenceFile {
    file: File;
    documentType: ClaimDocumentType;
    label: string;
}

interface ClaimEvidenceInput {
    reportId: number;
    petId: number;
    files: ClaimEvidenceFile[];
    distinctiveMarkings?: string;
    remarks?: string;
}

interface SavedClaim {
    claim_id: number;
    [key: string]: any;
}

/** Save by report/pet: a browser-cached claim ID may refer to a deleted or merged claim. */
export async function saveClaimEvidence(
    input: ClaimEvidenceInput,
    upload: (file: File) => Promise<{ url: string }>,
    save: (payload: Record<string, unknown>) => Promise<SavedClaim>,
    uploadedUrls: WeakMap<File, string>,
) {
    if (!Number.isSafeInteger(input.reportId) || input.reportId <= 0 || !Number.isSafeInteger(input.petId) || input.petId <= 0) {
        throw new Error('Select a valid report and registered pet before submitting evidence.');
    }
    const payload: Record<string, unknown> = { report_id: input.reportId, pet_id: input.petId };
    const markings = input.distinctiveMarkings?.trim();
    const remarks = input.remarks?.trim();
    if (markings) payload.distinctive_markings = markings;
    if (remarks) payload.remarks = remarks;

    const savedFiles: File[] = [];
    const errors: string[] = [];
    const photos: string[] = [];
    for (const item of input.files) {
        try {
            let url = uploadedUrls.get(item.file);
            if (!url) {
                url = (await upload(item.file)).url;
                if (!url) throw new Error('The upload did not return a file URL.');
                uploadedUrls.set(item.file, url);
            }
            if (item.documentType === 'additional_photo') photos.push(url);
            else payload[item.documentType === 'evidence' ? 'evidence_url' : `${item.documentType}_url`] = url;
            savedFiles.push(item.file);
        } catch (error) {
            errors.push(`${item.label}: ${error instanceof Error ? error.message : 'Upload failed.'}`);
        }
    }
    if (photos.length) payload.additional_photos_url = photos.join(',');
    if (!savedFiles.length && !markings && !remarks) return { claim: null, savedFiles: [], errors };

    // POST /claims/ creates or updates the live claim for this pet's case, including
    // merged reports. Keep selections and uploaded URLs if this save fails so a retry
    // can reuse the upload rather than sending the same file to Cloudinary again.
    const claim = await save(payload);
    if (!Number.isSafeInteger(claim?.claim_id) || claim.claim_id <= 0) throw new Error('The server did not return a saved claim. Please try again.');
    return { claim, savedFiles, errors };
}
