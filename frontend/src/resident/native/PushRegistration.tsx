import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { residentPath } from '../config';
import { startPush } from './push';

/** Mounted while a resident is signed in: push notifications on the Android app (nothing in a browser). A tap opens the screen it names. */
export function PushRegistration() {
  const navigate = useNavigate();
  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    void startPush((path) => navigate(residentPath(path))).then((s) => { if (cancelled) s(); else stop = s; });
    return () => { cancelled = true; stop?.(); };
  }, [navigate]);
  return null;
}
