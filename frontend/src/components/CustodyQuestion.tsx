// The owner confirmed a sighting of their pet, but nobody is holding it (Phase 6): no claim is needed. The owner says
// whether it is home or still missing, and the Subdivision Leader is told.
import { useState } from 'react';
import { Home, Search } from 'lucide-react';
import Button from './Button';
import { type CustodyAnswer, sendCustodyAnswer } from '../utils/claimCustody';
import { followUpError } from '../utils/ownerFollowUp';

interface Props {
    reportId: number;
    petId: number;
    petName?: string | null;
    answer?: string | null;          // the owner's latest answer, if any
    onAnswered?: (answer: CustodyAnswer) => void;
    embedded?: boolean;              // inside another card: no card frame or heading of its own
}

export default function CustodyQuestion({ reportId, petId, petName, answer: initial, onAnswered, embedded = false }: Props) {
    const [answer, setAnswer] = useState<string | null | undefined>(initial);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pet = petName || 'your pet';

    const send = async (value: CustodyAnswer) => {
        setBusy(true);
        setError('');
        try {
            await sendCustodyAnswer(reportId, petId, value, note.trim());
            setAnswer(value);
            setNote('');
            onAnswered?.(value);
        } catch (err) {
            setError(followUpError(err, 'Your answer could not be sent. Try again.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={embedded ? 'space-y-4' : 'bg-white dark:bg-[#151C2C] rounded-[2.5rem] border border-gray-100 dark:border-gray-700 shadow-xl p-6 sm:p-8 space-y-4'}
            aria-label="Is your pet home?">
            {!embedded && <h3 className="text-lg font-black text-[#1a1208] dark:text-gray-100 uppercase tracking-tight">Nobody is holding {pet}</h3>}
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 leading-relaxed">
                The animal in this report was only seen, nobody picked it up, so there is nothing to claim or hand over.
                Is {pet} home with you? Your Subdivision Leader is told your answer.
            </p>
            {answer && (
                <p role="status" className={`text-xs font-bold rounded-xl px-3 py-2 border ${answer === 'home'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                    {answer === 'home' ? `You said ${pet} is home.` : `You said ${pet} is still missing. The sighting stays on ${pet}'s record.`}
                    {' '}You can change your answer below.
                </p>
            )}
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={500} aria-label="Note for the Subdivision Leader"
                placeholder="Optional note, e.g. it came back this morning, the gate is fixed"
                className="w-full px-3 py-2 bg-white dark:bg-[#151C2C] border border-gray-200 dark:border-gray-700 rounded-xl text-xs" />
            {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button disabled={busy || answer === 'home'} onClick={() => send('home')}>
                    <Home className="w-4 h-4 mr-1.5" /> Yes, it's home
                </Button>
                <Button variant="light" disabled={busy || answer === 'missing'} onClick={() => send('missing')}>
                    <Search className="w-4 h-4 mr-1.5" /> No, still missing
                </Button>
            </div>
        </div>
    );
}
