import { useEffect, useState } from 'react';
import { Award, Eye, Printer, Send } from 'lucide-react';
import { api } from '../../utils/api';
import CertificateSyncBar from './CertificateSyncBar';

interface Props {
    application: any;
    canSend: boolean;
    busy: boolean;
    refreshKey: number;
    onUpdated: () => void;
    onPreview: (print?: boolean) => void;
    onSend: () => void;
    onProceed: () => void;
}

export default function AdoptionCertificatePanel({ application, canSend, busy, refreshKey, onUpdated, onPreview, onSend, onProceed }: Props) {
    const [certificate, setCertificate] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        let active = true;
        setLoading(true); setCertificate(null); setError(null);
        api.get(`/adoptions/${application.adoption_id}/certificate`).then(response => {
            if (active) setCertificate(response.data);
        }).catch(error => {
            if (active) setError(error.response?.status === 404 ? 'The certificate has not been issued yet.' : 'Could not load certificate details. Reopen this tab to try again.');
        }).finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [application.adoption_id, application.certificate_number, refreshKey]);
    const atCertificateStage = ['Certificate', 'Payment'].includes(application.current_stage);
    const date = certificate?.issued_at ? new Date(certificate.issued_at).toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Not issued';
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 space-y-4" aria-label="Certificate management">
            <div className="flex items-start gap-3">
                <Award className="w-6 h-6 text-role shrink-0" />
                <div><h3 className="text-base font-black text-slate-900">Certificate management</h3><p className="text-xs text-slate-500 mt-1">Official document, digital delivery, and printing.</p></div>
            </div>
            <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-xs text-slate-500">Certificate status</dt><dd className="font-bold mt-1">{loading ? 'Loading…' : certificate ? certificate.certificate_status || (certificate.is_final ? 'Final' : 'Issued') : 'Unavailable'}</dd></div>
                <div><dt className="text-xs text-slate-500">Issue date</dt><dd className="font-bold mt-1">{loading ? 'Loading…' : date}</dd></div>
                <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-slate-500">Certificate number</dt><dd className="font-mono font-bold mt-1 break-all">{certificate?.certificate_number || 'Not issued'}</dd></div>
                <div><dt className="text-xs text-slate-500">Digital delivery</dt><dd className={`font-bold mt-1 ${application.is_certificate_sent ? 'text-emerald-700' : 'text-amber-700'}`}>{application.is_certificate_sent ? 'Sent to adopter' : 'Not sent'}</dd></div>
            </dl>
            {application.certificate_sent_at && <p className="text-xs text-slate-500">Sent {new Date(application.certificate_sent_at).toLocaleString()} to {application.full_name}.</p>}
            {error && <p role="status" className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{error}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button type="button" disabled={!certificate || loading} onClick={() => onPreview()} className="adoption-detail-action bg-role text-white"><Eye className="w-4 h-4" /> Preview Certificate</button>
                <button type="button" disabled={!certificate || loading || typeof window.print !== 'function'} onClick={() => onPreview(true)} className="adoption-detail-action border border-slate-200 bg-white text-slate-700"><Printer className="w-4 h-4" /> Print Certificate</button>
                {atCertificateStage && !application.is_certificate_sent && <button type="button" disabled={!certificate || busy || !canSend} title={!canSend ? 'Only the Head Officer or Admin can send this certificate.' : undefined} onClick={onSend} className="adoption-detail-action sm:col-span-2 bg-teal-700 text-white"><Send className="w-4 h-4" /> {busy ? 'Sending…' : 'Send Digital Certificate'}</button>}
                {atCertificateStage && application.is_certificate_sent && <button type="button" disabled={busy} onClick={onProceed} className="adoption-detail-action sm:col-span-2 bg-emerald-700 text-white">{busy ? 'Proceeding…' : 'Proceed to Handover'}</button>}
            </div>
            {atCertificateStage && !application.is_certificate_sent && !canSend && <p className="text-xs text-slate-500">Digital delivery requires the Head Officer or an administrator.</p>}
            {certificate && <CertificateSyncBar adoptionId={application.adoption_id} canUpdate={canSend} refreshKey={refreshKey} onUpdated={onUpdated} />}
        </section>
    );
}
