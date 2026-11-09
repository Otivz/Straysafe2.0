import type { ReactNode } from 'react';
import { FlaskConical } from 'lucide-react';

const FLOW = ['Report', 'Assess', 'Coordinate', 'Monitor', 'Document', 'Close'];

/** Frame for the signed-out screens: brand, a card, and a quiet reminder of how a case moves. */
export function AuthShell({ children, below }: { children: ReactNode; below?: ReactNode }) {
  return (
    <div className="sa-root">
      <main className="sa-auth">
        <div className="sa-auth__brand">
          <img src="/SSLOGO-128.png" alt="" />
          <div>
            <p className="sa-brand__name">Stray<span>Safe</span></p>
            <p className="sa-brand__sub">Subdivision Admin</p>
          </div>
        </div>
        <div className="sa-panel sa-auth__card">{children}</div>
        {below}
        <ul className="sa-flow" aria-label="How a case moves">
          {FLOW.map((step) => <li key={step}>{step}</li>)}
        </ul>
      </main>
    </div>
  );
}

/** Always visible on signed-out screens in the preview, so it can never be mistaken for a live sign-in. */
export function DevPreviewNote({ children }: { children: ReactNode }) {
  return (
    <div className="sa-devbox" role="note">
      <p className="flex items-center gap-2"><FlaskConical size={15} aria-hidden="true" /><strong>Development preview</strong></p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
