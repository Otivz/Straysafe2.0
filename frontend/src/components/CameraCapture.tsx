import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ImagePlus, RefreshCw, X } from 'lucide-react';

type Facing = 'environment' | 'user';
type CamError = 'insecure' | 'unsupported' | 'denied' | 'notfound' | 'inuse' | 'noframes' | 'playback' | 'failed';

const ERROR_TEXT: Record<CamError, { title: string; body: string }> = {
    insecure: { title: 'Camera needs a secure connection', body: 'This page is not opened over https, so the browser blocks the live camera. Use your phone camera instead.' },
    unsupported: { title: 'Live camera not supported here', body: 'This browser cannot show a live camera preview. Use your phone camera instead.' },
    denied: { title: 'Camera permission is off', body: 'Allow camera access for this site in your browser or app settings, then try again — or use your phone camera.' },
    notfound: { title: 'No camera found', body: 'This device did not report a usable camera.' },
    inuse: { title: 'Camera is busy', body: 'Another app or tab is using the camera. Close it and try again.' },
    noframes: { title: 'Camera started but shows no picture', body: 'The camera did not send any image. Try again, flip the camera, or use your phone camera.' },
    playback: { title: 'Could not show the camera preview', body: 'The preview could not start. Try again or use your phone camera.' },
    failed: { title: 'Could not start the camera', body: 'Something went wrong while opening the camera. Try again or use your phone camera.' },
};

const errorFrom = (e: unknown): CamError => {
    const name = (e as { name?: string })?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'notfound';
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'inuse';
    return 'failed';
};

// Resolves true once the video is actually receiving frames (not just "has a stream").
const waitForFrames = (video: HTMLVideoElement, stream: MediaStream, timeoutMs: number) =>
    new Promise<boolean>((resolve) => {
        const started = Date.now();
        const tick = () => {
            const track = stream.getVideoTracks()[0];
            if (!track || track.readyState === 'ended') return resolve(false);
            if (video.videoWidth > 0 && video.readyState >= 2) return resolve(true);
            if (Date.now() - started > timeoutMs) return resolve(false);
            setTimeout(tick, 100);
        };
        tick();
    });

interface Props {
    open: boolean;
    onClose: () => void;
    /** Called with the captured JPEG; the parent adds it to its media list. */
    onCapture: (file: File) => void;
    /** Opens the device's own camera through a file input (must run inside this tap). */
    onUseNativeCamera: () => void;
    onPickGallery: () => void;
}

/**
 * Full-screen live camera for phones and desktops.
 * - Starts only when opened by a tap; one camera request at a time (stale requests are discarded and released).
 * - Shows the preview only after real frames arrive; otherwise a clear error with a working fallback.
 * - Rendered at <body> level (above the app navigation) with no blur/filters around the <video>.
 * - Always stops every camera track when closed or unmounted.
 */
export default function CameraCapture({ open, onClose, onCapture, onUseNativeCamera, onPickGallery }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const requestRef = useRef(0);
    const [facing, setFacing] = useState<Facing>('environment');
    const [status, setStatus] = useState<'starting' | 'ready' | 'error'>('starting');
    const [error, setError] = useState<CamError | null>(null);
    const [cameraCount, setCameraCount] = useState(0);
    const [capturing, setCapturing] = useState(false);

    const stopStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
    }, []);

    const fail = (kind: CamError) => {
        setError(kind);
        setStatus('error');
    };

    const start = useCallback(async (wanted: Facing) => {
        const id = ++requestRef.current;
        stopStream();
        setStatus('starting');
        setError(null);

        if (typeof window !== 'undefined' && window.isSecureContext === false) return fail('insecure');
        if (!navigator.mediaDevices?.getUserMedia) return fail('unsupported');

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: wanted }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
        } catch (first) {
            const kind = errorFrom(first);
            if (kind === 'denied') { if (id === requestRef.current) fail('denied'); return; }
            try {
                // Fallback: any camera, no size/facing preference
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            } catch (second) {
                if (id === requestRef.current) fail(errorFrom(second));
                return;
            }
        }

        // A newer request (flip/close/reopen) replaced this one: release it and stop
        if (id !== requestRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const video = videoRef.current;
        if (!video) { stopStream(); return; }
        video.muted = true;
        video.setAttribute('muted', '');
        video.setAttribute('playsinline', '');
        video.srcObject = stream;
        try {
            await video.play();
        } catch (e) {
            if ((e as { name?: string })?.name !== 'AbortError') {
                if (id === requestRef.current) fail('playback');
                return;
            }
        }

        const gotFrames = await waitForFrames(video, stream, 6000);
        if (id !== requestRef.current) return;
        if (!gotFrames) { stopStream(); return fail('noframes'); }
        setStatus('ready');

        // How many cameras exist (labels/ids are only reliable after permission was granted)
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            if (id === requestRef.current) setCameraCount(devices.filter((d) => d.kind === 'videoinput').length);
        } catch { /* not important */ }
    }, [stopStream]);

    // Open/close: start once per open, always release the camera when closing or unmounting
    useEffect(() => {
        if (!open) return;
        start(facing);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => {
            requestRef.current++;
            stopStream();
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', onKey);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const flip = () => {
        const next: Facing = facing === 'environment' ? 'user' : 'environment';
        setFacing(next);
        start(next);
    };

    const capture = () => {
        const video = videoRef.current;
        if (!video || status !== 'ready' || capturing) return;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) return fail('noframes');
        setCapturing(true);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { setCapturing(false); return fail('failed'); }
        // The frame is already upright (the browser rotates camera frames to the screen orientation);
        // the front-camera preview is only mirrored on screen, the saved photo is not.
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob((blob) => {
            setCapturing(false);
            if (!blob) return fail('failed');
            onCapture(new File([blob], `stray_camera_${Date.now()}.jpg`, { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.92);
    };

    if (!open) return null;

    const err = error ? ERROR_TEXT[error] : null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Camera"
            className="fixed inset-0 z-[100000] bg-black text-white flex flex-col h-[100dvh] select-none"
        >
            {/* Top: close + hint */}
            <div className="shrink-0 flex items-center gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close camera"
                    className="w-11 h-11 rounded-full bg-white/15 active:bg-white/25 flex items-center justify-center shrink-0"
                >
                    <X className="w-6 h-6" />
                </button>
                <p className="text-sm font-semibold text-white/85 leading-snug">
                    {status === 'ready' ? 'Fit the whole animal in the frame, then tap the shutter.' : status === 'starting' ? 'Starting camera…' : 'Camera unavailable'}
                </p>
            </div>

            {/* Middle: the live preview (whole frame shown, not stretched) */}
            <div className="relative flex-1 min-h-0">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className={`absolute inset-0 w-full h-full object-contain ${facing === 'user' ? '-scale-x-100' : ''} ${status === 'ready' ? 'opacity-100' : 'opacity-0'}`}
                />
                {status === 'starting' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin" />
                        <p className="text-sm text-white/80">Starting camera…</p>
                    </div>
                )}
                {status === 'error' && err && (
                    <div className="absolute inset-0 flex items-center justify-center p-5">
                        <div className="w-full max-w-sm bg-white text-gray-900 rounded-2xl p-5 text-center">
                            <div className="w-12 h-12 mx-auto rounded-full bg-orange-50 text-[#F97316] flex items-center justify-center">
                                <Camera className="w-6 h-6" />
                            </div>
                            <h2 className="mt-3 text-base font-black">{err.title}</h2>
                            <p className="mt-1 text-sm text-gray-600 leading-relaxed">{err.body}</p>
                            <div className="mt-4 grid gap-2">
                                <button
                                    type="button"
                                    onClick={() => { onClose(); onUseNativeCamera(); }}
                                    className="h-11 rounded-xl bg-[#F97316] text-white font-bold text-sm"
                                >
                                    Use phone camera
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { onClose(); onPickGallery(); }}
                                    className="h-11 rounded-xl border border-gray-200 font-bold text-sm text-gray-700"
                                >
                                    Choose from gallery
                                </button>
                                {error !== 'insecure' && error !== 'unsupported' && (
                                    <button type="button" onClick={() => start(facing)} className="h-10 text-sm font-bold text-[#F97316]">
                                        Try again
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom: flip · shutter · gallery */}
            <div className="shrink-0 grid grid-cols-3 items-center px-6 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
                <div className="flex justify-start">
                    <button
                        type="button"
                        onClick={flip}
                        disabled={status === 'starting' || cameraCount === 1}
                        aria-label="Flip camera"
                        className="w-12 h-12 rounded-full bg-white/15 active:bg-white/25 flex items-center justify-center disabled:opacity-40"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                </div>
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={capture}
                        disabled={status !== 'ready' || capturing}
                        aria-label="Take photo"
                        className="w-[76px] h-[76px] rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
                    >
                        <span className="w-[60px] h-[60px] rounded-full bg-white" />
                    </button>
                </div>
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => { onClose(); onPickGallery(); }}
                        aria-label="Choose from gallery"
                        className="w-12 h-12 rounded-full bg-white/15 active:bg-white/25 flex items-center justify-center"
                    >
                        <ImagePlus className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
