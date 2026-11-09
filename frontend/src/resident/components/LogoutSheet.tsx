import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { residentPath } from '../config';
import { ConfirmSheet } from './Sheet';
import { useToast } from './toast';

/** R40 — Sign-out confirmation. Opened from Profile and from Settings. */
export function LogoutSheet({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <ConfirmSheet
      title="Sign out of StraySafe?"
      message="Your reports and pets stay saved to your account. An unfinished report on this device is kept until you sign in again."
      confirmLabel="Sign out"
      tone="danger"
      onConfirm={() => {
        navigate(residentPath('/welcome'), { replace: true });
        void signOut();
        toast.success('You have been signed out');
      }}
      onClose={onClose}
    />
  );
}
