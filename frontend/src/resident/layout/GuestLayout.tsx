import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { residentPath } from '../config';
import { Frame } from './Frame';

/**
 * Frame for the signed-out screens (welcome, sign-up, verification, sign-in, password reset).
 * A resident who is already signed in is sent on (to where they were heading, or Home), except on the password screens,
 * which a link from an email can reach, and on verification, which shows its own success state once the code is accepted.
 */
export default function GuestLayout() {
  const { session } = useAuth();
  const { pathname, state } = useLocation();
  const stays = /\/(forgot-password|reset-password|verify)\/?$/.test(pathname);
  // Signing in happens on a guest screen, so this redirect and the screen's own navigation must agree on the destination.
  const from = ((state ?? null) as { from?: string } | null)?.from;
  if (session && !stays) return <Navigate to={from ?? residentPath('/home')} replace />;
  return (
    <Frame>
      <main id="main" tabIndex={-1} className="rs-main outline-none"><Outlet /></main>
    </Frame>
  );
}
