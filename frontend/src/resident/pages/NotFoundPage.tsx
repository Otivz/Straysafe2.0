import { Screen } from '../components/Screen';
import { NotFoundState } from '../components/ui';

/** Any address inside the signed-in app that does not match a screen. */
export default function NotFoundPage() {
  return (
    <Screen title="Page not found" back="/home">
      <NotFoundState />
    </Screen>
  );
}
