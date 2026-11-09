import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { adminPath } from '../config';
import { useAuth } from '../auth/context';
import { Button } from '../components/Button';
import { ConfirmDialog, Dialog } from '../components/Dialog';

/** A24 — Logout confirmation. */
export function LogoutDialog({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <ConfirmDialog
      title="Sign out of StraySafe?"
      message="You will need to sign in again to manage cases. Sample changes made in this preview stay in this browser tab until you reset them."
      confirmLabel="Sign out"
      onClose={onClose}
      onConfirm={async () => {
        navigate(adminPath('/login'), { replace: true });
        await signOut();
      }}
    />
  );
}

/** Shown when a request reports that the session is no longer valid. It cannot be dismissed: the only way on is to sign in. */
export function SessionExpiredDialog() {
  const { signOut } = useAuth();
  return (
    <Dialog
      size="sm"
      dismissible={false}
      title="Your session has expired"
      description="For your security you were signed out. Changes you already submitted are kept; anything you were still typing may need to be entered again."
      onClose={() => undefined}
      footer={(
        <Button
          variant="primary"
          icon={LogOut}
          autoFocus
          onClick={() => { void signOut('expired'); }}
        >
          Sign in again
        </Button>
      )}
    >
      <p className="sa-text-2">Sign in again to continue where you left off.</p>
    </Dialog>
  );
}
