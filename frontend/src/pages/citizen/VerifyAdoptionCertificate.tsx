import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Clock, ShieldX } from 'lucide-react';
import { api } from '../../utils/api';

// Public page opened by the QR code printed on an adoption certificate.
// Shows only what is needed to authenticate it; the backend never returns address/phone/ID.

interface VerifyResult {
    valid: boolean;
    status: 'Valid' | 'Pending_Handover' | 'Revoked' | 'Not_Found' | 'Tampered' | string;
    message: string;
    certificate_number?: string | null;
    pet_name?: string | null;
    pet_type?: string | null;
    adopter_initials?: string | null;
    barangay_name?: string | null;
    municipality_city?: string | null;
    signatory_name?: string | null;
    signatory_position?: string | null;
    issued_at?: string | null;
    revoked_at?: string | null;
}

const LOOK: Record<string, { icon: typeof BadgeCheck; tone: string; title: string }> = {
    Valid: { icon: BadgeCheck, tone: 'bg-emerald-50 border-emerald-200 text-emerald-900', title: 'Authentic certificate' },
    Pending_Handover: { icon: Clock, tone: 'bg-amber-50 border-amber-200 text-amber-900', title: 'Issued — not yet final' },
    Revoked: { icon: ShieldX, tone: 'bg-rose-50 border-rose-200 text-rose-900', title: 'Certificate revoked' },
    Tampered: { icon: AlertTriangle, tone: 'bg-rose-50 border-rose-200 text-rose-900', title: 'Security code mismatch' },
    Not_Found: { icon: AlertTriangle, tone: 'bg-slate-50 border-slate-200 text-slate-800', title: 'Certificate not found' },
};

export default function VerifyAdoptionCertificate() {
    const { number = '' } = useParams();
    const [params] = useSearchParams();
    const [result, setResult] = useState<VerifyResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const h = params.get('h') || undefined;
        api.get(`/certificates/verify/${encodeURIComponent(number)}`, { params: { h } })
            .then((r) => setResult(r.data))
            .catch((e) => setError(e.response?.status === 429 ? 'Too many checks. Please try again in a minute.' : 'Could not reach the verification service.'));
    }, [number, params]);

    const look = result ? (LOOK[result.status] || LOOK.Not_Found) : null;
    const Icon = look?.icon;
    const rows: Array<[string, string | null | undefined]> = result ? [
        ['Certificate No.', result.certificate_number],
        ['Adopted pet', [result.pet_name, result.pet_type].filter(Boolean).join(' · ') || null],
        ['Adopter', result.adopter_initials],
        ['Issuing barangay', [result.barangay_name, result.municipality_city].filter(Boolean).join(', ') || null],
        ['Signed by', [result.signatory_name, result.signatory_position].filter(Boolean).join(' — ') || null],
        ['Issued', result.issued_at ? new Date(result.issued_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null],
        ['Revoked', result.revoked_at ? new Date(result.revoked_at).toLocaleDateString() : null],
    ] : [];

    return (
        <div className="min-h-screen bg-[#FDFBF7] flex items-start sm:items-center justify-center px-4 py-10">
            <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                    <img src="/SSLOGO.png" alt="StraySafe" className="w-10 h-10 object-contain" />
                    <div>
                        <h1 className="text-base font-black text-slate-900">Adoption Certificate Verification</h1>
                        <p className="text-[11px] text-slate-500">StraySafe · Barangay Animal Services</p>
                    </div>
                </div>
                <div className="p-6 space-y-4">
                    {!result && !error && <p className="text-xs text-slate-500 font-semibold">Checking certificate...</p>}
                    {error && <p className="text-xs font-bold text-rose-700">{error}</p>}
                    {result && look && Icon && (
                        <>
                            <div className={`p-4 rounded-2xl border flex items-start gap-3 ${look.tone}`} data-testid="verify-status">
                                <Icon className="w-6 h-6 shrink-0" />
                                <div>
                                    <p className="text-sm font-black">{look.title}</p>
                                    <p className="text-xs mt-0.5">{result.message}</p>
                                </div>
                            </div>
                            {result.status !== 'Not_Found' && result.status !== 'Tampered' && (
                                <dl className="divide-y divide-slate-100 text-xs">
                                    {rows.filter(([, v]) => v).map(([k, v]) => (
                                        <div key={k} className="py-2 flex justify-between gap-4">
                                            <dt className="text-slate-500 font-semibold">{k}</dt>
                                            <dd className="text-slate-900 font-bold text-right">{v}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                        </>
                    )}
                    <Link to="/" className="block text-center text-[11px] font-bold text-[#F97316] hover:underline">Go to StraySafe</Link>
                </div>
            </div>
        </div>
    );
}
