import { ZoomIn } from 'lucide-react';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';
import type { ComparisonField } from '../../utils/manualMatchFields';

// Manual Matching: the stray report as submitted (left) and the registered pet record as saved (right). Only actual
// values are shown; nothing is generated, scored or concluded here. Used by staff (match review) and owners (My Pets).

const Card = ({ title, subtitle, photo, photoCount, tone, fields, onPhoto }: {
    title: string;
    subtitle: string;
    photo?: string | null;
    photoCount: number;
    tone: 'report' | 'pet';
    fields: ComparisonField[];
    onPhoto?: () => void;
}) => (
    <section className={`min-w-0 rounded-2xl border bg-white overflow-hidden ${tone === 'report' ? 'border-role-border' : 'border-amber-300'}`}
        aria-label={title}>
        <header className={`px-3 py-2 flex items-center justify-between gap-2 ${tone === 'report' ? 'bg-role-soft/60' : 'bg-amber-50'}`}>
            <span className={`text-[11px] font-black uppercase tracking-widest ${tone === 'report' ? 'text-role-hover' : 'text-amber-800'}`}>{title}</span>
            <span className="text-[11px] font-bold text-gray-600 truncate">{subtitle}</span>
        </header>
        <button type="button" onClick={onPhoto} disabled={!onPhoto}
            className="relative block w-full aspect-[4/3] bg-gray-100 cursor-zoom-in disabled:cursor-default group"
            aria-label={`Inspect the ${tone === 'report' ? 'reported animal' : 'registered pet'} photo`}>
            <img src={photo || DEFAULT_PET_AVATAR} alt={tone === 'report' ? 'Reported animal' : 'Registered pet'}
                className="w-full h-full object-contain" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
            {!photo && <span className="absolute inset-x-0 bottom-2 text-center text-[11px] font-bold text-gray-500">Photo: Not Provided</span>}
            {photo && onPhoto && (
                <span className="absolute bottom-1.5 right-1.5 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <ZoomIn className="w-3 h-3" /> {photoCount > 1 ? `${photoCount} photos` : 'Zoom'}
                </span>
            )}
        </button>
        <dl className="divide-y divide-gray-100">
            {fields.map((f) => (
                <div key={f.label} className={`px-3 py-2 ${f.long ? '' : 'grid grid-cols-[minmax(0,9rem)_1fr] gap-2 items-baseline'}`}>
                    <dt className="text-[10px] font-black uppercase tracking-wide text-gray-500">{f.label}</dt>
                    <dd className={`min-w-0 break-words text-xs font-semibold ${f.value === 'Not Provided' ? 'text-gray-400 italic' : 'text-gray-900'} ${f.long ? 'mt-0.5 whitespace-pre-line' : ''}`}>
                        {f.value}
                    </dd>
                </div>
            ))}
        </dl>
    </section>
);

const ManualComparisonCards = ({ report, pet, onInspectReport, onInspectPet }: {
    report: { label: string; photo?: string | null; photoCount: number; fields: ComparisonField[] };
    pet: { label: string; photo?: string | null; photoCount: number; fields: ComparisonField[] };
    onInspectReport?: () => void;
    onInspectPet?: () => void;
}) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="manual-comparison-cards">
        <Card title="Stray Report" subtitle={report.label} photo={report.photo} photoCount={report.photoCount} tone="report"
            fields={report.fields} onPhoto={onInspectReport} />
        <Card title="Registered Pet" subtitle={pet.label} photo={pet.photo} photoCount={pet.photoCount} tone="pet"
            fields={pet.fields} onPhoto={onInspectPet} />
    </div>
);

export default ManualComparisonCards;
