import { Navigate, useLocation } from 'react-router-dom';
import { stepPath } from '../../lib/flow';

/** R11 — The old photos step. Photos are now added on the details step, so a saved link or an open tab lands there (keeping `?from=review`). */
export default function EvidencePage() {
  return <Navigate to={`${stepPath('details')}${useLocation().search}`} replace />;
}
