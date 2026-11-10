import type { ReactNode } from 'react';

const FLOW = ['Report', 'Assess', 'Coordinate', 'Monitor', 'Document', 'Close'];

/**
 * Frame for the signed-out screens. It keeps the recognisable shape of the original Subdivision Leader sign-in: an orange
 * brand half (logo, "Operations Portal", "Subdivision Leaders") beside a light half that holds the form. Below 1024px the
 * brand half becomes a band across the top. Behaviour lives in the pages; this file only lays them out.
 */
export function AuthShell({ children, below }: { children: ReactNode; below?: ReactNode }) {
  return (
    <div className="sa-root">
      <main className="sa-auth">
        <div className="sa-auth__brand">
          {/* the same oversized, rotated logo the original used as a soft background pattern */}
          <img className="sa-auth__watermark" src="/SSLOGO.png" alt="" aria-hidden="true" />
          <div className="sa-auth__brandbody">
            <img className="sa-auth__logo" src="/SSLOGO.png" alt="StraySafe" />
            <p className="sa-auth__product">Operations <br className="sa-auth__br" />Portal</p>
            <span className="sa-auth__rule" aria-hidden="true" />
            <p className="sa-auth__audience">Subdivision Leaders</p>
          </div>
        </div>
        <div className="sa-auth__side">
          <div className="sa-auth__column">
            <img className="sa-auth__mark" src="/SSLOGO-128.png" alt="" />
            <div className="sa-auth__card">{children}</div>
            {below}
            <p className="sa-auth__notice">This login portal is restricted to authorized Subdivision Leaders. Unauthorized access is strictly prohibited.</p>
            <ul className="sa-flow" aria-label="How a case moves">
              {FLOW.map((step) => <li key={step}>{step}</li>)}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
