import { useEffect, useState } from 'react';
import { BellRing, Send } from 'lucide-react';
import { api } from '../utils/api';
import { currentPushState, disablePush, enablePush, type PushState } from '../utils/push';

// Push notification settings (PUSH_NOTIFICATION_IMPLEMENTATION.md P15): this device on/off, the categories, the
// lock-screen preview and a test. Categories are per account; the on/off switch is per device.
type PushPrefs = {
    push_enabled: boolean; push_reports: boolean; push_rescues: boolean; push_pet_matches: boolean;
    push_claims: boolean; push_messages: boolean; push_show_preview: boolean;
};

const CATEGORIES: { key: keyof PushPrefs; label: string; staffOnly?: boolean }[] = [
    { key: 'push_reports', label: 'Reports (status updates, comments)' },
    { key: 'push_rescues', label: 'Rescues and holding alerts' },
    { key: 'push_pet_matches', label: 'Possible pet matches' },
    { key: 'push_claims', label: 'Pet claims' },
    { key: 'push_messages', label: 'Messages' },
];

const STATE_TEXT: Record<PushState, string> = {
    on: 'On for this device.',
    off: 'Off for this device.',
    denied: 'Notifications are blocked for this site. Allow them in your browser\'s site settings, then turn this on.',
    unsupported: 'This browser can\'t receive push notifications. On iPhone, add StraySafe to your Home Screen first (Share → Add to Home Screen).',
    unavailable: 'Push notifications aren\'t set up on the server yet.',
    untrusted: 'This connection\'s security certificate isn\'t trusted, so the browser won\'t allow push here. Use a trusted HTTPS address, or localhost on the PC.',
};

export default function PushSettingsCard({ userId, className = '', showIcons = true }: { userId?: number | string; className?: string; showIcons?: boolean }) {
    const [state, setState] = useState<PushState | null>(null);
    const [prefs, setPrefs] = useState<PushPrefs | null>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        currentPushState().then(setState).catch(() => setState('unsupported'));
        api.get('/notifications/preferences').then(r => setPrefs(r.data)).catch(() => undefined);
    }, []);

    const toggleDevice = async () => {
        setBusy(true);
        setMessage('');
        try {
            const next = state === 'on' ? await disablePush(userId) : await enablePush(userId);
            setState(next);
            if (next === 'on' && prefs && !prefs.push_enabled) {
                const r = await api.put('/notifications/preferences', { push_enabled: true });
                setPrefs(r.data);
            }
        } catch {
            setMessage('Could not change push notifications on this device.');
        } finally {
            setBusy(false);
        }
    };

    const setPref = async (key: keyof PushPrefs, value: boolean) => {
        if (!prefs) return;
        setPrefs({ ...prefs, [key]: value });
        try {
            const r = await api.put('/notifications/preferences', { [key]: value });
            setPrefs(r.data);
        } catch {
            setPrefs(prefs);
            setMessage('Could not save that setting.');
        }
    };

    const sendTest = async () => {
        setMessage('');
        try {
            await api.post('/push/test');
            setMessage('Test sent. It should arrive in a few seconds.');
        } catch (e: any) {
            setMessage(e.response?.data?.detail || 'Could not send a test notification.');
        }
    };

    const on = state === 'on';
    const canToggle = state === 'on' || state === 'off';

    return (
        <div className={`p-5 bg-gray-50 dark:bg-[#1E2738] rounded-2xl border border-gray-200 dark:border-gray-800 space-y-4 ${className}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    {showIcons && <div className="w-9 h-9 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-[#F97316] flex items-center justify-center shrink-0">
                        <BellRing className="w-4 h-4" />
                    </div>}
                    <div>
                        <span className="text-xs font-black text-gray-800 dark:text-gray-200 block">Push Notifications</span>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold leading-snug block">
                            {state ? STATE_TEXT[state] : 'Checking this device…'}
                        </span>
                    </div>
                </div>
                <button type="button" onClick={toggleDevice} disabled={busy || !canToggle}
                    className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 shrink-0 ${on ? 'bg-green-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                    {busy ? '…' : on ? 'ON' : 'OFF'}
                </button>
            </div>

            {on && prefs && (
                <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 pt-2">Send me pushes about</p>
                    {CATEGORIES.map(c => (
                        <label key={c.key} className="flex items-center justify-between gap-3 cursor-pointer">
                            <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">{c.label}</span>
                            <input type="checkbox" className="accent-[#F97316] w-4 h-4" checked={Boolean(prefs[c.key])}
                                onChange={(e) => setPref(c.key, e.target.checked)} />
                        </label>
                    ))}
                    <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-gray-200 dark:border-gray-700">
                        <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                            Show details on the lock screen
                            <span className="block text-[10px] text-gray-400">Off: only "You have a new StraySafe update".</span>
                        </span>
                        <input type="checkbox" className="accent-[#F97316] w-4 h-4" checked={prefs.push_show_preview}
                            onChange={(e) => setPref('push_show_preview', e.target.checked)} />
                    </label>
                    <button type="button" onClick={sendTest}
                        className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-orange-300 rounded-lg text-[10px] font-black uppercase tracking-wider text-gray-700 dark:text-gray-200 cursor-pointer">
                        {showIcons && <Send className="w-3 h-3" />} Send test notification
                    </button>
                </div>
            )}
            {message && <p className="text-[10px] font-semibold text-gray-600 dark:text-gray-300">{message}</p>}
        </div>
    );
}
