import { Compass } from 'lucide-react';
import { adminPath } from '../config';
import { LinkButton } from '../components/Button';
import { EmptyState, Panel } from '../components/layout';
import { usePageTitle } from '../lib/hooks';

export default function NotFoundPage() {
  usePageTitle('Page not found');
  return (
    <Panel>
      <EmptyState icon={Compass} title="That page doesn’t exist" action={<LinkButton variant="primary" to={adminPath('/dashboard')}>Back to the dashboard</LinkButton>}>
        The link may be out of date, or the record may have been removed.
      </EmptyState>
    </Panel>
  );
}
