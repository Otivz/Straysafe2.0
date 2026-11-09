import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { PreviewBar } from '../components/Chrome';
import { useOffline } from '../lib/hooks';

/**
 * The phone-sized column every resident screen lives in. On wider screens it stays a centred, restrained width instead of
 * stretching. The preview bar is sticky, so the "sample data" notice is always visible.
 */
export function Frame({ signedIn = false, children }: { signedIn?: boolean; children: ReactNode }) {
  const offline = useOffline();
  return (
    <div className="sa-root rs-root">
      <a className="rs-skip" href="#main">Skip to content</a>
      <div className="rs-frame">
        <PreviewBar signedIn={signedIn} />
        {offline ? (
          <div className="rs-offline" role="status">
            <WifiOff size={16} aria-hidden="true" />
            <span><strong>No connection.</strong> You can read what is already here, but changes can’t be saved.</span>
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}
