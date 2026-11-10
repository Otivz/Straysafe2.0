/**
 * The slim bar at the top of every Resident screen in the DEBUG APK (before sign-in, signed in, and on error screens): it names the
 * backend the app is calling and opens Connection Settings. Plugged in through `ResidentMode.Banner` by ResidentLiveRoot only when
 * the build is `android-debug`; no other build mounts or contains it.
 */
import { Server } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/api';
import { shortBackend } from '../../utils/devBackend';
import { residentPath } from '../config';

export function DevConnectionBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  if (/\/connection\/?$/.test(pathname)) return null;   // that screen shows the address itself
  return (
    <div className="rs-previewbar" role="note">
      <Server size={14} aria-hidden="true" />
      <span className="rs-previewbar__text"><strong>Debug build</strong> · {shortBackend(API_BASE_URL) || 'no backend set'}</span>
      <button type="button" onClick={() => navigate(residentPath('/connection'))}>Connection</button>
    </div>
  );
}
