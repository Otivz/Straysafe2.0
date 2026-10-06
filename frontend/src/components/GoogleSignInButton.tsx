import { useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        google?: any;
    }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// Google sign-in only appears when a Client ID is configured in .env.
export const isGoogleSignInEnabled = Boolean(CLIENT_ID);

let scriptPromise: Promise<void> | null = null;
let initialized = false;
// Google Identity Services takes one callback per page; every rendered button forwards to the latest handler.
let currentHandler: ((credential: string) => void) | null = null;

function loadGoogleScript(): Promise<void> {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (!scriptPromise) {
        scriptPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = GSI_SRC;
            script.async = true;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => {
                scriptPromise = null;
                reject(new Error('Failed to load Google Identity Services'));
            };
            document.head.appendChild(script);
        });
    }
    return scriptPromise;
}

interface GoogleSignInButtonProps {
    onCredential: (credential: string) => void;
    text?: 'signin_with' | 'signup_with' | 'continue_with';
}

const GoogleSignInButton = ({ onCredential, text = 'signin_with' }: GoogleSignInButtonProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [loadFailed, setLoadFailed] = useState(false);

    useEffect(() => {
        currentHandler = onCredential;
    }, [onCredential]);

    useEffect(() => {
        if (!CLIENT_ID) return;
        let cancelled = false;
        loadGoogleScript()
            .then(() => {
                const el = containerRef.current;
                if (cancelled || !el || !window.google?.accounts?.id) return;
                if (!initialized) {
                    window.google.accounts.id.initialize({
                        client_id: CLIENT_ID,
                        callback: (resp: { credential?: string }) => {
                            if (resp.credential) currentHandler?.(resp.credential);
                        },
                        ux_mode: 'popup',
                        cancel_on_tap_outside: true,
                    });
                    initialized = true;
                }
                // Google renders a fixed-width iframe; 200–400px is the range it accepts.
                const width = Math.min(Math.max(el.offsetWidth || 320, 200), 400);
                window.google.accounts.id.renderButton(el, {
                    type: 'standard',
                    theme: 'outline',
                    size: 'large',
                    shape: 'pill',
                    text,
                    logo_alignment: 'center',
                    width,
                });
            })
            .catch(() => {
                if (!cancelled) setLoadFailed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [text]);

    if (!CLIENT_ID) return null;

    return (
        <div className="w-full">
            <div ref={containerRef} className="w-full flex justify-center min-h-[44px]" />
            {loadFailed && (
                <p className="mt-2 text-center text-[11px] font-semibold text-red-500">
                    Couldn't load Google sign-in. Check your internet connection and reload the page.
                </p>
            )}
        </div>
    );
};

export default GoogleSignInButton;
