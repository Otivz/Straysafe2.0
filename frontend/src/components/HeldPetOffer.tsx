import { useState } from 'react';
import { PawPrint } from 'lucide-react';
import api from '../utils/api';
import { cloudinaryResized } from '../utils/cloudinaryImage';
import { DEFAULT_PET_AVATAR } from '../utils/avatar';

// When a resident registers a pet: their subdivision may already have registered it for them before they had an
// account (the record carries their phone number and the same pet type). They say "this is my pet" (a claim the
// leader approves, no second record) or register a new pet. PET_RECORD_DUPLICATE_PREVENTION_PLAN.md, no AI.

export interface HeldPet {
    pet_id: number;
    pet_name?: string | null;
    pet_type?: string | null;
    breed?: string | null;
    primary_color?: string | null;
    photo_url?: string | null;
    registered_by_name?: string | null;
    created_at?: string | null;
}

export default function HeldPetOffer({ pets, onClaimed, onRegisterNew, onCancel }: {
    pets: HeldPet[];
    onClaimed: (pet: HeldPet) => void;
    onRegisterNew: () => void;
    onCancel: () => void;
}) {
    const [busy, setBusy] = useState<number | null>(null);
    const [error, setError] = useState('');

    const claim = async (p: HeldPet) => {
        setBusy(p.pet_id);
        setError('');
        try {
            await api.post('/pet-ownership/claim', { pet_id: p.pet_id });
            onClaimed(p);
        } catch (e: any) {
            setError(e.response?.data?.detail || 'Could not send your claim. Please try again.');
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
            <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-4" role="dialog" aria-modal="true"
                aria-labelledby="held-pet-title" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start gap-3">
                    <span className="w-11 h-11 rounded-2xl bg-orange-50 text-orange-600 border border-orange-100 flex items-center justify-center shrink-0">
                        <PawPrint className="w-5 h-5" />
                    </span>
                    <div>
                        <h3 id="held-pet-title" className="text-sm font-black text-gray-900 uppercase tracking-tight">
                            Your subdivision may already have registered this pet for you
                        </h3>
                        <p className="text-[11px] font-semibold text-gray-500 mt-0.5">
                            It was recorded with your phone number before you had an account. If it's your pet, claim it so its history stays with it.
                        </p>
                    </div>
                </div>

                <ul className="space-y-2.5">
                    {pets.map((p) => (
                        <li key={p.pet_id} className="p-3 rounded-2xl border border-gray-200 flex items-center gap-3">
                            <img loading="lazy" decoding="async" src={cloudinaryResized(p.photo_url, 200) || DEFAULT_PET_AVATAR} alt={p.pet_name || 'Pet'}
                                className="w-14 h-14 rounded-xl object-cover border border-gray-100 shrink-0" onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black text-gray-900 truncate">{p.pet_name || 'Unnamed pet'}</p>
                                <p className="text-[11px] font-semibold text-gray-500 truncate">
                                    {[p.pet_type, p.breed, p.primary_color].filter(Boolean).join(' · ')}
                                </p>
                                <p className="text-[10px] font-semibold text-gray-400 truncate">
                                    Registered{p.created_at ? ` on ${new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                                    {p.registered_by_name ? ` by ${p.registered_by_name}` : ''}
                                </p>
                            </div>
                            <button type="button" disabled={busy !== null} onClick={() => claim(p)}
                                className="px-3 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer shrink-0">
                                {busy === p.pet_id ? 'Sending…' : 'This is my pet'}
                            </button>
                        </li>
                    ))}
                </ul>

                {error && <p className="text-[11px] font-semibold text-rose-600">{error}</p>}
                <div className="flex gap-2.5">
                    <button type="button" onClick={onCancel} disabled={busy !== null}
                        className="flex-1 py-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 text-[10px] font-black uppercase tracking-widest cursor-pointer">
                        Back
                    </button>
                    <button type="button" onClick={onRegisterNew} disabled={busy !== null}
                        className="flex-1 py-2.5 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-800 text-[10px] font-black uppercase tracking-widest cursor-pointer">
                        No, register a new pet
                    </button>
                </div>
            </div>
        </div>
    );
}
