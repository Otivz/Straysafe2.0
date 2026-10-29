import { useCallback, useState } from 'react';
import { AlertTriangle, CheckCircle2, Crop, Loader2 } from 'lucide-react';
import api from '../utils/api';
import PhotoCropper from './PhotoCropper';

// Pet registration with a photo of several animals (MULTI_ANIMAL_REPORT_PLAN.md, pet registration).
// A pet record is one animal. When the AI photo check counts more than one animal, the registrant crops the pet
// being registered (the crop is checked again), or, if the AI miscounted, confirms it with a short reason (logged on
// the server). The original photo stays in memory for the whole registration session, so the other animals can be
// cropped for the next registrations without uploading it again.

export interface PetPhotoOverride {
    fields: string[]; ai_verdict: 'multiple'; detected_count: number; reason: string;
}

export function usePetPhotoGuard() {
    const [original, setOriginal] = useState<{ file: File; url: string; count: number } | null>(null);
    const [count, setCount] = useState(0);               // animals the AI counted in the CURRENT main photo
    const [fromCrop, setFromCrop] = useState(false);     // the current main photo is a crop of `original`
    const [checking, setChecking] = useState(false);
    const [cropping, setCropping] = useState(false);
    const [override, setOverride] = useState({ confirmed: false, reason: '' });
    const [noAnimal, setNoAnimal] = useState(false);     // the photo check found no dog or cat (registration refused)

    /** Record what the AI check said about the main photo (the form may run the check itself). */
    const noteResult = useCallback((file: File, ai: any | null, isCrop: boolean) => {
        const n = Number(ai?.detected_animal_count || 0);
        const multi = !!ai && (Boolean(ai.multiple_animals_detected) || n > 1);
        const c = multi ? Math.max(2, n) : 1;
        setCount(c);
        setNoAnimal(ai?.animal_detected === false);   // null / unavailable check: never refused
        setOverride({ confirmed: false, reason: '' });
        setFromCrop(isCrop);
        if (!isCrop) {
            setOriginal((prev) => {
                if (prev && prev.file === file) return prev;
                return multi ? { file, url: URL.createObjectURL(file), count: c } : null;
            });
        }
    }, []);

    /** Run the AI photo check for a form that doesn't (the staff Add Pet form). */
    const check = useCallback(async (file: File, isCrop: boolean) => {
        setChecking(true);
        try {
            const form = new FormData();
            form.append('file', file);
            form.append('purpose', 'pet');   // pet registration: YOLO only (dog or cat, how many), no Gemini
            const res = await api.post('/reports/analyze-media', form);
            noteResult(file, res.data, isCrop);
            return res.data;
        } catch {
            noteResult(file, null, isCrop);   // check unavailable: the photo is accepted
            return null;
        } finally {
            setChecking(false);
        }
    }, [noteResult]);

    const reset = useCallback((keepSession = false) => {
        setCount(0);
        setNoAnimal(false);
        setFromCrop(false);
        setCropping(false);
        setOverride({ confirmed: false, reason: '' });
        if (!keepSession) setOriginal(null);
    }, []);

    const multi = count > 1;
    const overrideValid = override.confirmed && override.reason.trim().length >= 5;
    return {
        original, count, multi, fromCrop, checking, cropping, override, noAnimal,
        setOverride, setCropping, setChecking, noteResult, check, reset,
        blocked: multi && !overrideValid,
        hasSession: !!original,
        overridePayload: (multi && overrideValid
            ? { fields: ['photo_url'], ai_verdict: 'multiple', detected_count: count, reason: override.reason.trim() }
            : undefined) as PetPhotoOverride | undefined,
    };
}

export type PetPhotoGuard = ReturnType<typeof usePetPhotoGuard>;

/** Warning, "Crop this pet", the override, and the crop tool. `onCropped` puts the crop in the form as the main photo. */
export function PetPhotoGuardPanel({ guard, onCropped }: { guard: PetPhotoGuard; onCropped: (file: File) => void }) {
    const { original, count, multi, fromCrop, checking, cropping, override } = guard;
    if (!checking && !multi && !(fromCrop && original) && !cropping) return null;

    return (
        <div className="space-y-2">
            {checking && (
                <p className="text-[11px] font-bold text-gray-500 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking how many animals are in the photo…
                </p>
            )}

            {!checking && multi && (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                    <p className="text-[11px] font-black text-amber-900 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                        This photo shows {count} animals. A pet record is for one animal, so crop the pet you are registering.
                        You can register the others from the same photo afterwards.
                    </p>
                    <button type="button" onClick={() => guard.setCropping(true)} disabled={!original}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-50 cursor-pointer">
                        <Crop className="w-3.5 h-3.5" /> Crop this pet
                    </button>
                    <div className="pt-2 border-t border-amber-200/70 space-y-1.5">
                        <label className="flex items-start gap-2 text-[11px] font-semibold text-amber-900 cursor-pointer">
                            <input type="checkbox" className="mt-0.5" checked={override.confirmed}
                                onChange={(e) => guard.setOverride({ ...override, confirmed: e.target.checked })} />
                            The AI is wrong: this photo shows only the pet I'm registering.
                        </label>
                        {override.confirmed && (
                            <>
                                <input value={override.reason} maxLength={300}
                                    onChange={(e) => guard.setOverride({ ...override, reason: e.target.value })}
                                    placeholder="Why? e.g. the second 'animal' is a stuffed toy"
                                    className="w-full p-2 rounded-lg border border-amber-200 bg-white text-xs" />
                                <p className="text-[10px] font-semibold text-amber-700">
                                    {override.reason.trim().length >= 5
                                        ? 'Your confirmation and reason are recorded with this registration.'
                                        : 'Write a short reason (at least 5 characters).'}
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {!checking && !multi && fromCrop && original && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 flex-wrap">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span className="text-[11px] font-bold text-emerald-800 flex-1">
                        Cropped from a photo with {original.count} animals. The crop shows one animal.
                    </span>
                    <button type="button" onClick={() => guard.setCropping(true)}
                        className="text-[10px] font-black text-role hover:underline cursor-pointer">Crop again</button>
                </div>
            )}

            {cropping && original && (
                <PhotoCropper src={original.url} title="Crop the pet you are registering"
                    onClose={() => guard.setCropping(false)}
                    onCropped={(file) => { guard.setCropping(false); onCropped(file); }} />
            )}
        </div>
    );
}

/** After saving: offer to register another animal from the same photo. */
export function RegisterAnotherPrompt({ petName, count, onYes, onNo }: {
    petName?: string | null; count: number; onYes: () => void; onNo: () => void;
}) {
    return (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-[#151B26] rounded-3xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
                <p className="text-sm font-black text-gray-900 dark:text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {petName || 'The pet'} is registered
                </p>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    The photo you used shows {count} animals. Register another animal from this photo? You'll crop it from the
                    same photo, so nothing has to be uploaded again.
                </p>
                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onNo} className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50 cursor-pointer">No, I'm done</button>
                    <button type="button" onClick={onYes} className="px-4 py-2 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-black cursor-pointer">Register another animal from this photo</button>
                </div>
            </div>
        </div>
    );
}
