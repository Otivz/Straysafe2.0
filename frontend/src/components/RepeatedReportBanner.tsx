// A report about a pet that is under observation on another report (Phase 5B/5E of
// docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md). The leader logs it there in one click, or merges it.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import Button from './Button';
import { type OwnerFollowUp, addFollowUpContact, followUpError, getFollowUpForReport } from '../utils/ownerFollowUp';

interface Props {
    reportId: number;                 // this (new) report
    observedReportId: number;         // the report where the pet is under observation
    petName?: string | null;
    canAct: boolean;                  // a Subdivision Leader; the server checks it handles the observed report
    reportBasePath?: string;
}

export default function RepeatedReportBanner({ reportId, observedReportId, petName, canAct, reportBasePath = '/subd/reports' }: Props) {
    const [followUp, setFollowUp] = useState<OwnerFollowUp | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let current = true;
        getFollowUpForReport(observedReportId)
            .then(f => { if (current) setFollowUp(f); })
            .catch(() => { if (current) setFollowUp(null); });
        return () => { current = false; };
    }, [observedReportId]);

    const logged = Boolean(followUp?.contacts?.some(c => c.related_report_id === reportId));
    const pet = petName || 'This pet';
    const observed = <Link to={`${reportBasePath}/${observedReportId}`} className="font-black underline underline-offset-2">Report #{observedReportId}</Link>;

    const log = async () => {
        if (!followUp) return;
        setBusy(true);
        setError('');
        try {
            setFollowUp(await addFollowUpContact(followUp.followup_id, {
                method: 'Repeated incident', related_report_id: reportId,
                note: `Report #${reportId}: ${petName || 'the pet'} was reported again during the observation.`,
            }));
        } catch (err) {
            setError(followUpError(err));
        } finally {
            setBusy(false);
        }
    };

    if (logged) {
        return (
            <p role="note" className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Logged as a repeated incident on {observed}, where {pet.toLowerCase() === 'this pet' ? 'the pet' : pet} is under observation.</span>
            </p>
        );
    }
    return (
        <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{pet} is under an owner follow-up on {observed}. Log this report there as a repeated incident, or merge it if it is the same event.</span>
            </p>
            {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
            {canAct && followUp?.status === 'Observing' && (
                <Button size="sm" variant="light" disabled={busy} onClick={log}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> {busy ? 'Logging...' : `Log on Report #${observedReportId}`}
                </Button>
            )}
        </div>
    );
}
