import { ChevronDown, FlaskConical, LifeBuoy, RefreshCw, RotateCcw, Timer, WifiOff } from 'lucide-react';
import { useAuth } from '../auth/context';
import { Button } from '../components/Button';
import { Menu } from '../components/Menu';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import { setPreviewFlags, usePreviewFlags } from '../../preview/lib/previewFlags';

/**
 * Permanent notice that this is a development preview with sample data, plus switches to see the failure states
 * (network down, a rejected save, an expired session) without a backend. Present only in dev builds.
 */
export function PreviewBar() {
  const flags = usePreviewFlags();
  const { resetSample, reload } = useAdminData();
  const { expireSession } = useAuth();
  const toast = useToast();

  return (
    <div className="sa-previewbar" role="note">
      <FlaskConical size={15} aria-hidden="true" />
      <strong>Development preview</strong>
      <span>Sample data only. Changes stay in this browser tab and are not sent to any server.</span>
      {flags.offline ? <strong>Network offline (simulated)</strong> : null}
      {flags.failNext ? <strong>Next save will fail (simulated)</strong> : null}
      <span className="ml-auto">
        <Menu
          width={300}
          trigger={(p) => <Button variant="ghost" size="sm" {...p}>Preview tools<ChevronDown size={14} aria-hidden="true" /></Button>}
          items={[
            { kind: 'label', label: 'Simulate' },
            { label: 'Network unavailable', icon: WifiOff, checked: flags.offline, onSelect: () => setPreviewFlags({ offline: !flags.offline }) },
            { label: 'Fail the next save', icon: LifeBuoy, checked: flags.failNext, onSelect: () => setPreviewFlags({ failNext: !flags.failNext }) },
            { label: 'Expire the session now', icon: Timer, onSelect: expireSession },
            { label: 'Reload data (loading / error state)', icon: RefreshCw, onSelect: reload },
            { kind: 'separator' },
            { label: 'Reset sample data', icon: RotateCcw, onSelect: () => { resetSample(); toast.success('Sample data reset'); } },
          ]}
        />
      </span>
    </div>
  );
}
