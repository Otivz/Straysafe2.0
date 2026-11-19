import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Camera, ScanLine, Square } from 'lucide-react';
import { Screen } from '../../components/Screen';
import { Button, Callout } from '../../components/ui';
import { tokenFromQr } from '../../lib/petTag';

/** The browser's built-in QR reader (Chrome on Android). Not in TypeScript's DOM types yet, so only what is used is declared. */
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
 * "Scan a pet tag" (Phase 4 of docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md), with no new library: the browser's
 * BarcodeDetector reads the QR. In a phone's browser it scans live from the camera. In the Android app it reads a photo
 * taken through the phone's own camera app, the same hand-off "Take photo" uses, so the app still needs no CAMERA
 * permission. Where the phone cannot read QR codes, it explains how to use the phone's camera app instead.
 */
export default function ScanTagPage() {
  const navigate = useNavigate();
  const [detector, setDetector] = useState<QrDetector | null | undefined>(undefined);   // undefined: still checking
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const native = Capacitor.isNativePlatform();
  const liveAllowed = !native && typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  useEffect(() => {
    let live = true;
    void makeDetector().then((d) => { if (live) setDetector(d); });
    return () => { live = false; };
  }, []);

  const stop = useCallback(() => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);
  useEffect(() => stop, [stop]);

  /** True when it was a StraySafe tag (and the tag page is opening). */
  const handle = useCallback((codes: DetectedCode[]): boolean => {
    if (codes.length === 0) return false;
    for (const code of codes) {
      const token = tokenFromQr(code.rawValue);
      if (token) {
        stop();
        navigate(`/t/${token}`);
        return true;
      }
    }
    setMessage('That QR code is not a StraySafe pet tag.');
    return false;
  }, [navigate, stop]);

  const startLive = async () => {
    if (!detector) return;
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      await video.play();
      timerRef.current = window.setInterval(() => {
        if (video.readyState < 2) return;
        detector.detect(video).then(handle, () => undefined);
      }, 300);
    } catch {
      stop();
      setMessage('The camera could not be opened. Allow camera access, or take a photo of the tag instead.');
    }
  };

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
      if (codes.length === 0) setMessage('No QR code was found in that photo. Hold the phone closer, with the whole tag in view, and try again.');
      else handle(codes);
    } catch {
      setMessage('That photo could not be read. Please try again.');
    } finally {
      setReading(false);
    }
  };

  return (
    <Screen title="Scan a pet tag" back="/community">
      <div className="rs-stack">
        <p className="rs-sub">Found a pet wearing a StraySafe QR tag? Scan it to tell the owner where the pet is. Keep your distance from an animal that seems frightened.</p>

        {detector === undefined ? null : detector === null ? (
          <Callout tone="info" title="This phone can’t read QR codes in the app.">
            Open your phone’s own camera app and point it at the tag. It opens the tag’s page in the browser, where you can tell the owner.
          </Callout>
        ) : (
          <>
            {liveAllowed ? (
              <>
                <div style={{ display: scanning ? 'block' : 'none', borderRadius: 16, overflow: 'hidden', background: '#000' }}>
                  <video ref={videoRef} playsInline muted style={{ display: 'block', width: '100%', maxHeight: '60vh', objectFit: 'cover' }} />
                </div>
                {scanning ? (
                  <>
                    <p className="rs-meta">Point the camera at the QR code on the tag.</p>
                    <Button block icon={Square} onClick={stop}>Stop the camera</Button>
                  </>
                ) : (
                  <Button variant="primary" block icon={ScanLine} onClick={() => { void startLive(); }}>Start scanning</Button>
                )}
              </>
            ) : null}
            <label className={`rs-btn ${liveAllowed ? 'rs-btn--secondary' : 'rs-btn--primary'} rs-btn--block`} aria-busy={reading || undefined}>
              <Camera size={18} aria-hidden="true" />
              {reading ? 'Reading the photo…' : 'Take a photo of the tag'}
              <input type="file" accept="image/*" capture="environment" className="rs-sr-only" onChange={(e) => { void fromPhoto(e); }} />
            </label>
          </>
        )}

        {message ? <Callout tone="amber">{message}</Callout> : null}
        <p className="rs-hint">Only StraySafe pet tags are opened. The owner’s name, address and phone number are never shown.</p>
      </div>
    </Screen>
  );
}
