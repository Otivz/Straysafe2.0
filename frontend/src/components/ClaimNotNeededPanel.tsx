// Staff claims pages (Phase 6): an open claim on an animal nobody holds has nothing to hand over. Shows why, the
// owner's answer, and closes it as not needed (the server refuses once the animal is held).
import { useState } from 'react';
import { Home } from 'lucide-react';
import Button from './Button';
import { closeClaimNotNeeded, custodyAnswerText } from '../utils/claimCustody';
import { followUpError } from '../utils/ownerFollowUp';

interface Props {
    claimId: number;
    petName?: string | null;
    ownerAnswer?: string | null;
    onClosed: (updatedClaim: unknown) => void;
}

export default function ClaimNotNeededPanel({ claimId, petName, ownerAnswer, onClosed }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const said = custodyAnswerText(ownerAnswer, petName || 'the pet');

    const close = async () => {
        setBusy(true);
        setError('');
        try {
            onClosed(await closeClaimNotNeeded(claimId));
        } catch (err) {
            setError(followUpError(err, 'The claim could not be closed. Try again.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mb-3 p-3.5 rounded-xl bg-sky-50 border border-sky-200 space-y-2" role="note">
            <p className="text-[11px] font-black text-sky-900 flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5" /> Nobody is holding this animal, so no handover is needed
            </p>
            <p className="text-[11px] text-sky-800">
                {said || 'The owner has not said yet whether the pet is home.'} Close this claim; the owner is told. If the animal is picked up later, a claim can be filed again.
            </p>
            {error && <p role="alert" className="text-[11px] font-semibold text-red-700">{error}</p>}
            <Button size="sm" variant="light" disabled={busy} onClick={close}>
                {busy ? 'Closing...' : 'Close: not needed'}
            </Button>
        </div>
    );
}
