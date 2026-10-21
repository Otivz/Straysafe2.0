import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, Server, X } from 'lucide-react';
import { API_BASE_URL } from '../utils/api';
import { clearSavedServer, getSavedServer, isNativeApp, normalizeServer, saveServer, testServer } from '../utils/serverAddress';

// "Server settings" on the login pages of the installed app: type the PC's current IP wherever you are (home, school),
// the app checks it is the StraySafe server, saves it on this phone and reloads. Hidden in the browser.
export default function ServerSettings({ className = '' }: { className?: string }) {
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [found, setFound] = useState('');

    if (!isNativeApp()) return null;
    const saved = getSavedServer();

    const show = () => {
        setValue((saved || API_BASE_URL).replace(/^https?:\/\//, ''));
        setError('');
        setFound('');
        setOpen(true);
    };

    const save = async () => {
        const address = normalizeServer(value);
        if (!address) {
            setError('Type the PC\'s IP address, for example 192.168.254.113');
            return;
        }
        setBusy(true);
        setError('');
        const result = await testServer(address);
        setBusy(false);
        if (!result.ok) {
            setError(result.reason || 'Could not reach the server.');
            return;
        }
        saveServer(address);
        setFound(address);
        setTimeout(() => window.location.reload(), 900);   // every screen picks up the new address
    };

    const reset = () => {
        clearSavedServer();
        window.location.reload();
    };

    return (
        <>
            <button type="button" onClick={show}
                className={`inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400 hover:text-[#F97316] cursor-pointer ${className}`}>
                <Server className="w-3.5 h-3.5" /> Server settings
                <span className="font-semibold normal-case tracking-normal">({(saved || API_BASE_URL).replace(/^https?:\/\//, '')})</span>
            </button>

            {open && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => !busy && setOpen(false)}>
                    <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl text-left" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <p className="text-base font-extrabold text-[#1a1208] flex items-center gap-2">
                                <Server className="w-5 h-5 text-[#F97316]" /> Server address
                            </p>
                            <button type="button" onClick={() => setOpen(false)} disabled={busy}
                                className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer" aria-label="Close">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-sm text-[#4a3b28]">
                            The IP address of the PC running StraySafe. It changes on every Wi-Fi: on the PC, run
                            <code className="mx-1 px-1 rounded bg-gray-100 text-xs">ipconfig</code> and use the
                            <strong> Wi-Fi IPv4 address</strong>.
                        </p>
                        <input
                            value={value}
                            onChange={(e) => { setValue(e.target.value); setError(''); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                            inputMode="url"
                            autoCapitalize="none"
                            autoCorrect="off"
                            placeholder="192.168.254.113"
                            className="w-full h-12 rounded-2xl border border-gray-200 bg-[#FAFAF9] px-4 text-sm font-bold focus:outline-none focus:border-[#F97316]"
                        />
                        <p className="text-[11px] text-gray-500">The port 8000 is added for you. The phone must be on the same Wi-Fi as the PC.</p>
                        {error && <p className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>}
                        {found && (
                            <p className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4" /> StraySafe server found at {found}. Reloading...
                            </p>
                        )}
                        <div className="flex gap-2">
                            {saved && (
                                <button type="button" onClick={reset} disabled={busy}
                                    className="px-4 py-3 rounded-2xl border border-gray-200 text-xs font-black text-gray-600 hover:bg-gray-50 cursor-pointer">
                                    Use default
                                </button>
                            )}
                            <button type="button" onClick={save} disabled={busy || !!found}
                                className="flex-1 px-4 py-3 rounded-2xl bg-[#F97316] text-white text-xs font-black uppercase tracking-wider disabled:opacity-60 cursor-pointer inline-flex items-center justify-center gap-2">
                                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking...</> : 'Check & save'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
