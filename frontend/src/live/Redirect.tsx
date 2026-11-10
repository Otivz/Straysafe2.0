import { Navigate, useLocation } from 'react-router-dom';

/** Sends a visitor of a retired address (an old bookmark, e-mail or notification link) to the StraySafe 2.0 interface that replaced it; the query string and hash are kept. */
export function Redirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}
