import { useState } from 'react';
import { Camera, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../utils/api';
import { checkAndUploadAnimalPhoto } from '../utils/animalPhoto';
import PhotoCropper from './PhotoCropper';

// Replace one animal's main photo with a clear close-up (MULTI_ANIMAL_REPORT_PLAN.md), e.g. at holding intake.
// The earlier photo is kept on the report's timeline as evidence, and AI matching runs again with the new photo.
// The server decides who may do it (the subdivision's leader or the barangay's staff).

export default function ReplaceAnimalPhotoButton({ reportId, onDone, className = '' }: {
    reportId: number | string; onDone?: () => void; className?: string;
}) {
    const [src, setSrc] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

    const save = async (file: File) => {
        setSrc(null);
        setBusy(true);
        setMsg(null);
        try {
            const photo = await checkAndUploadAnimalPhoto(file);
            await api.post(`/reports/${reportId}/replace-photo`, { photo_url: photo.url, note: 'Close-up taken at intake' });
            setMsg({ ok: true, text: 'Photo replaced. The earlier photo is kept as evidence, and matching will run again.' });
            onDone?.();
        } catch (e: any) {
            setMsg({ ok: false, text: e?.response?.data?.detail || e?.message || 'Could not replace the photo.' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={className}>
            <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-role-border text-role bg-role-soft/40 hover:bg-role-soft text-[10px] font-black uppercase tracking-wider cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                {busy ? 'Saving photo…' : 'Replace photo with a close-up'}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setSrc(URL.createObjectURL(f));
                    e.target.value = '';
                }} />
            </label>
            {msg && (
                <p className={`mt-1.5 text-[10px] font-semibold flex items-start gap-1 ${msg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {msg.ok && <CheckCircle2 className="w-3 h-3 mt-px shrink-0" />} {msg.text}
                </p>
            )}
            {src && (
                <PhotoCropper src={src} title="Crop the close-up (draw around the whole animal)"
                    onClose={() => setSrc(null)} onCropped={(file) => save(file)} />
            )}
        </div>
    );
}
