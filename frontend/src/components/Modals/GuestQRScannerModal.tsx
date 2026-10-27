import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { QrCode, X, Upload } from 'lucide-react';

// Temporary guest scanner for the landing page: reads a pet QR tag and opens the public scan page (/pet/scan/:token).
// No login and no API call here; PetScanPage loads the pet and handles the guest "I found this pet" form.

interface GuestQRScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SCANNER_ID = 'guest-qr-reader';

// Matches http://.../pet/scan/TOKEN, /pet/scan/TOKEN, or a bare urlsafe token
function extractToken(text: string): string | null {
    const raw = text.trim();
    const match = raw.match(/pet\/scan\/([a-zA-Z0-9_-]+)/i);
    if (match) return match[1];
    if (/^[a-zA-Z0-9_-]{16,32}$/.test(raw) && isNaN(Number(raw))) return raw;
    return null;
}

const GuestQRScannerModal: React.FC<GuestQRScannerModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const handledRef = useRef(false);
    const [error, setError] = useState('');
    const [starting, setStarting] = useState(false);

    const stopCamera = async () => {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        if (!scanner) return;
        try {
            if (scanner.isScanning) await scanner.stop();
            scanner.clear();
        } catch {
            // already stopped
        }
    };

    const handleDecoded = async (text: string) => {
        if (handledRef.current) return;
        const token = extractToken(text);
        if (!token) {
            setError('This QR code is not a StraySafe pet tag.');
            return;
        }
        handledRef.current = true;
        await stopCamera();
        onClose();
        navigate(`/pet/scan/${token}`);
    };

    useEffect(() => {
        if (!isOpen) return;
        handledRef.current = false;
        setError('');

        if (!window.isSecureContext) {
            setError('The camera needs https. Open this site with https:// or upload a photo of the QR code instead.');
            return;
        }

        let cancelled = false;
        const start = async () => {
            setStarting(true);
            try {
                const scanner = new Html5Qrcode(SCANNER_ID);
                scannerRef.current = scanner;
                await scanner.start(
                    { facingMode: 'environment' },
                    {
                        fps: 10,
                        qrbox: (width, height) => {
                            const size = Math.min(width, height) * 0.75;
                            return { width: size, height: size };
                        },
                    },
                    (decodedText) => { handleDecoded(decodedText); },
                    () => {}
                );
                if (cancelled) await stopCamera();
            } catch (err) {
                console.warn('Guest QR camera failed to start:', err);
                if (!cancelled) setError('Could not open the camera. Allow camera access, or upload a photo of the QR code.');
            } finally {
                if (!cancelled) setStarting(false);
            }
        };
        start();

        return () => {
            cancelled = true;
            stopCamera();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setError('');
        await stopCamera();
        try {
            const fileScanner = new Html5Qrcode('guest-qr-file-temp');
            const text = await fileScanner.scanFile(file, false);
            fileScanner.clear();
            await handleDecoded(text);
        } catch {
            setError('No QR code found in that photo. Try a clearer, closer picture.');
        }
    };

    const handleClose = async () => {
        await stopCamera();
        onClose();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 px-4" onClick={handleClose}>
            <div
                className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
                    <div className="flex items-center gap-2">
                        <QrCode className="w-5 h-5 text-orange-500" />
                        <h2 className="text-base font-bold text-stone-800">Scan a Pet QR Tag</h2>
                    </div>
                    <button onClick={handleClose} className="p-1 rounded-lg text-stone-500 hover:bg-stone-100" aria-label="Close scanner">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-sm text-stone-600">
                        Found a pet with a StraySafe tag? Point your camera at the QR code. No account needed.
                    </p>

                    <div className="relative w-full aspect-square rounded-xl bg-stone-900 overflow-hidden">
                        <div id={SCANNER_ID} className="w-full h-full" />
                        {starting && (
                            <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-300">
                                Opening camera...
                            </div>
                        )}
                    </div>
                    <div id="guest-qr-file-temp" className="hidden" />

                    {error && (
                        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
                    )}

                    <label className="flex items-center justify-center gap-2 w-full cursor-pointer rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                        <Upload className="w-4 h-4" /> Upload a photo of the QR code
                        <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
                    </label>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default GuestQRScannerModal;
