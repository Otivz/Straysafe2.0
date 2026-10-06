import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { api } from '../../utils/api';

// Shown above the certificate while the adoption is not final: tells the case officer when the Pet Record was edited
// after the certificate was issued (for example the sex was corrected) and updates the certificate on request.
interface Props {
    adoptionId: number;
    canUpdate: boolean;
    refreshKey?: number;
    onUpdated?: () => void;
}

export default function CertificateSyncBar({ adoptionId, canUpdate, refreshKey, onUpdated }: Props) {
    const [outdated, setOutdated] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);

    const check = useCallback(async () => {
        try {
            const res = await api.get(`/adoptions/${adoptionId}/certificate`);
            setOutdated(Boolean(res.data?.details_outdated));
        } catch {
            setOutdated(false);
        }
    }, [adoptionId]);

    useEffect(() => { check(); }, [check, refreshKey]);

    const update = async () => {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/adoptions/${adoptionId}/certificate/refresh`);
            setOutdated(false);
            setDone(true);
            onUpdated?.();
            setTimeout(() => setDone(false), 4000);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Could not update the certificate.');
        } finally {
            setBusy(false);
        }
    };

    if (!outdated && !done && !error) return null;
    return (
        <div
            className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                done ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
            }`}
            data-testid="certificate-sync-bar"
        >
            <div className="text-xs">
                {done ? (
                    <p className="font-black text-emerald-800">Certificate updated with the latest Pet Record details.</p>
                ) : (
                    <>
                        <p className="font-black text-amber-900">The Pet Record was edited after this certificate was prepared.</p>
                        <p className="text-amber-800 mt-0.5">Update it so the name, breed, sex and photo on the certificate match the record. The certificate number and security code stay the same.</p>
                    </>
                )}
                {error && <p className="mt-1 font-bold text-rose-700">{error}</p>}
            </div>
            {!done && (
                canUpdate ? (
                    <button
                        type="button"
                        onClick={update}
                        disabled={busy}
                        className="px-4 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Update from Pet Record
                    </button>
                ) : (
                    <span className="text-[11px] font-bold text-amber-900 shrink-0">🔒 Only the Head Officer can update it</span>
                )
            )}
        </div>
    );
}
