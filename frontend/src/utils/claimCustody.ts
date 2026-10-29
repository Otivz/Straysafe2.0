// A pet claim only for an animal someone holds (Phase 6 of docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md).
import api from './api';

export type CustodyAnswer = 'home' | 'missing';

/** Claim statuses still open (not yet decided): the ones that can be closed as not needed. */
export const OPEN_CLAIM_STATUSES = ['Potential Owner Match', 'Possible Match Found', 'Pending Review', 'Evidence Requested'];
/** Closable as not needed when nobody holds the animal: open, or approved but never handed over. */
export const CLOSABLE_CLAIM_STATUSES = [...OPEN_CLAIM_STATUSES, 'Approved'];

/** The owner says whether a pet nobody holds is home or still missing (instead of filing a claim). */
export const sendCustodyAnswer = async (reportId: number, petId: number, answer: CustodyAnswer, note?: string) =>
    (await api.post('/claims/custody-answer', { report_id: reportId, pet_id: petId, answer, note: note || null })).data;

/** Staff close an open claim on an animal nobody holds (it becomes Rejected with the reason "Not needed: the pet is home"). */
export const closeClaimNotNeeded = async (claimId: number) =>
    (await api.post(`/claims/${claimId}/close-not-needed`)).data;

/** The status as people read it: a claim closed because nobody held the animal shows "Closed: not needed", not "Rejected". */
export const claimStatusLabel = (claim?: { status?: string | null; closed_not_needed?: boolean } | null, fallback = ''): string =>
    claim?.closed_not_needed ? 'Closed: not needed' : (claim?.status || fallback);

export const custodyAnswerText = (answer?: string | null, petName = 'the pet'): string | null =>
    answer === 'home' ? `The owner says ${petName} is home.` : answer === 'missing' ? `The owner says ${petName} is still missing.` : null;
