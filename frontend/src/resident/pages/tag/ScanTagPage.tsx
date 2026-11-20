import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, ScanLine, Square } from 'lucide-react';
import { Screen } from '../../components/Screen';
import { Button, Callout } from '../../components/ui';
import { tokenFromQr } from '../../lib/petTag';

/** The browser's built-in QR reader (Chrome on Android & desktop Chromium). Not in TypeScript's DOM types yet, so only what is used is declared. */
interface DetectedCode { rawValue: string }
interface QrDetector { detect(source: ImageBitmapSource): Promise<DetectedCode[]> }
interface QrDetectorClass { new (options: { formats: string[] }): QrDetector; getSupportedFormats(): Promise<string[]> }

async function makeDetector(): Promise<QrDetector | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: QrDetectorClass }).BarcodeDetector;
  if (!Ctor) return null;
  try {
    const formats = await Ctor.getSupportedFormats();
    return formats.includes('qr_code') ? new Ctor({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

/**
 * "Scan a pet tag" — opens the live rear camera immediately so pointing the camera at a StraySafe QR tag
 * automatically detects the token and navigates straight to `/t/<token>` (`TagScanPage.tsx`).
 */
export default function ScanTagPage() {
  const navigate = useNavigate();
  const [detector, setDetector] = useState<QrDetector | null | undefined>(undefined);   // undefined: still checking
  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const navigatedRef = useRef(false);
  const autoStartedRef = useRef(false);

  const liveAllowed = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    let live = true;
    void makeDetector().then((d) => { if (live) setDetector(d); });
    return () => { live = false; };
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    detectingRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
    setStarting(false);
  }, []);
  useEffect(() => stop, [stop]);

  /** True when it was a StraySafe tag (and the tag page is opening). */
  const handle = useCallback((codes: DetectedCode[]): boolean => {
    if (codes.length === 0 || navigatedRef.current) return false;
    for (const code of codes) {
      const token = tokenFromQr(code.rawValue);
      if (token) {
        navigatedRef.current = true;
        stop();
        navigate(`/t/${encodeURIComponent(token)}`);
        return true;
      }
    }
    setMessage('That QR code is not a StraySafe pet tag.');
    return false;
  }, [navigate, stop]);

  const startLive = useCallback(async () => {
    if (!detector || navigatedRef.current) return;
    setMessage(null);
    setStarting(true);
    try {
      stop();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      setStarting(false);
      timerRef.current = window.setInterval(() => {
        if (detectingRef.current || navigatedRef.current || video.readyState < 2) return;
        detectingRef.current = true;
        detector
          .detect(video)
          .then(handle, () => undefined)
          .finally(() => {
            detectingRef.current = false;
          });
      }, 200);
    } catch {
      stop();
      setMessage('The camera could not be opened automatically. Allow camera access and tap "Start camera", or scan from a photo below.');
    }
  }, [detector, handle, stop]);

  // Automatically start the live camera viewfinder as soon as the QR detector is ready
  useEffect(() => {
    if (detector && liveAllowed && !autoStartedRef.current) {
      autoStartedRef.current = true;
      void startLive();
    }
  }, [detector, liveAllowed, startLive]);

  const fromPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !detector) return;
    setMessage(null);
    setReading(true);
    try {
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close();
      if (codes.length === 0) setMessage('No QR code was found in that image. Hold the camera closer with the whole QR tag in view and try again.');
      else handle(codes);
    } catch {
      setMessage('That image could not be read. Please try again.');
    } finally {
      setReading(false);
    }
  };

  return (
    <Screen title="Scan a pet tag" back="/community">
      <div className="rs-stack">
        <p className="rs-sub">Point your camera at a StraySafe pet QR tag to open its page immediately.</p>

        {detector === undefined ? null : detector === null ? (
          <Callout tone="info" title="This browser does not support in-app QR detection.">
            Open your phone’s camera app and point it at the QR tag to open the pet’s page directly.
          </Callout>
        ) : (
          <>
            {liveAllowed ? (
              <>
                <div
                  style={{
                    position: 'relative',
                    display: scanning || starting ? 'block' : 'none',
                    borderRadius: 16,
                    overflow: 'hidden',
                    background: '#000',
                    minHeight: 280,
                  }}
                >
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    style={{ display: 'block', width: '100%', maxHeight: '60vh', objectFit: 'cover' }}
                  />
                  {/* Center QR targeting frame */}
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <div
                      style={{
                        width: 210,
                        height: 210,
                        borderRadius: 18,
                        border: '2.5px solid rgba(255, 255, 255, 0.85)',
                        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.28)',
                      }}
                    />
                  </div>
                </div>
                {scanning ? (
                  <>
                    <p className="rs-meta">Align the QR code inside the frame — it will open automatically.</p>
                    <Button block icon={Square} onClick={stop}>Stop camera</Button>
                  </>
                ) : (
                  <Button variant="primary" block icon={ScanLine} loading={starting} onClick={() => { void startLive(); }}>
                    Start camera
                  </Button>
                )}
              </>
            ) : null}
            <label className={`rs-btn ${liveAllowed ? 'rs-btn--secondary' : 'rs-btn--primary'} rs-btn--block`} aria-busy={reading || undefined}>
              <Camera size={18} aria-hidden="true" />
              {reading ? 'Reading QR code…' : 'Scan from a photo instead'}
              <input type="file" accept="image/*" className="rs-sr-only" onChange={(e) => { void fromPhoto(e); }} />
            </label>
          </>
        )}

        {message ? <Callout tone="amber">{message}</Callout> : null}
        <p className="rs-hint">Only StraySafe pet tags are opened. The owner’s name, address and phone number are never shown.</p>
      </div>
    </Screen>
  );
}
