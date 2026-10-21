import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Smartphone, X } from 'lucide-react';
import Button from './Button';
import { canPromptInstall, isInstalledApp, onInstallChange, promptInstall } from '../utils/pwaInstall';

// "Install App" on the landing page: the browser's own install prompt when it offers one (Chrome on Android over
// HTTPS), otherwise short steps for Android and iPhone. Hidden when StraySafe already runs as an installed app.
export default function InstallAppButton({ variant = 'light', className = '' }: {
    variant?: 'light' | 'ghost' | 'primary';
    className?: string;
}) {
    const [, rerender] = useState(0);
    const [showSteps, setShowSteps] = useState(false);

    useEffect(() => onInstallChange(() => rerender((n) => n + 1)), []);

    if (isInstalledApp()) return null;

    const install = async () => {
        if (canPromptInstall()) {
            await promptInstall();
        } else {
            setShowSteps(true);
        }
    };

    return (
        <>
            <Button variant={variant} size="lg" className={className} onClick={install}>
                <span className="inline-flex items-center gap-2"><Download className="w-4 h-4" /> Install App</span>
            </Button>

            {showSteps && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setShowSteps(false)}>
                    <div className="bg-white rounded-3xl w-full max-w-md p-6 space-y-4 shadow-2xl text-left" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <p className="text-base font-extrabold text-[#1a1208] flex items-center gap-2">
                                <Smartphone className="w-5 h-5 text-[#F97316]" /> Install STRAY SAFE on your phone
                            </p>
                            <button type="button" onClick={() => setShowSteps(false)} className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer" aria-label="Close">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-sm text-[#4a3b28]">
                            No app store needed. It opens full screen with its own icon, like a normal app.
                        </p>
                        <div className="rounded-2xl bg-[#FAFAF9] border border-[#ede8e0] p-4 space-y-1.5">
                            <p className="text-xs font-black uppercase tracking-wider text-[#F97316]">Android (Chrome)</p>
                            <ol className="text-sm text-[#1a1208] list-decimal list-inside space-y-1">
                                <li>Tap the <strong>⋮</strong> menu at the top right</li>
                                <li>Tap <strong>Install app</strong> or <strong>Add to Home screen</strong></li>
                                <li>Tap <strong>Install</strong></li>
                            </ol>
                        </div>
                        <div className="rounded-2xl bg-[#FAFAF9] border border-[#ede8e0] p-4 space-y-1.5">
                            <p className="text-xs font-black uppercase tracking-wider text-[#F97316]">iPhone (Safari)</p>
                            <ol className="text-sm text-[#1a1208] list-decimal list-inside space-y-1">
                                <li>Tap the <strong>Share</strong> button (square with an arrow)</li>
                                <li>Tap <strong>Add to Home Screen</strong></li>
                                <li>Tap <strong>Add</strong></li>
                            </ol>
                        </div>
                        {typeof window !== 'undefined' && window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && (
                            <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                Installing needs the secure (https://) address of this site. Ask the administrator for it.
                            </p>
                        )}
                        <Button variant="primary" size="lg" className="w-full" onClick={() => setShowSteps(false)}>Got it</Button>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
