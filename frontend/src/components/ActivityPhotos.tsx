import { Camera } from 'lucide-react';

// Photos added by staff while handling a case (status updates, holding-facility entries).
// They are kept apart from the photos the citizen reporter submitted; each also appears on its timeline entry.
interface Props {
    media?: Array<{ media_id?: number; file_url?: string; media_type?: string; is_evidence?: boolean }> | null;
}

export default function ActivityPhotos({ media }: Props) {
    const photos = (media || []).filter((m) => {
        const url = (m.file_url || '').toLowerCase();
        return m.is_evidence && m.media_type !== 'Document' && !/\.(pdf|docx?|txt)$/.test(url) && !url.includes('/raw/');
    });
    if (photos.length === 0) return null;
    return (
        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-6 sm:p-8 shadow-sm space-y-4" data-testid="activity-photos">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-role-soft text-role flex items-center justify-center shrink-0">
                        <Camera className="w-4 h-4" />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-tight">Activity Photos</h3>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Added by staff while handling this case</p>
                    </div>
                </div>
                <span className="text-[10px] font-black text-gray-500 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">{photos.length}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
                {photos.map((m, i) => (
                    <a key={m.media_id || i} href={m.file_url} target="_blank" rel="noreferrer"
                        className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 border border-gray-200 hover:border-role-border transition-colors" title="Open photo">
                        <img src={m.file_url} alt={`Activity photo ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                ))}
            </div>
        </div>
    );
}
