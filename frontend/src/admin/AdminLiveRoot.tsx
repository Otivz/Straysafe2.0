/**
 * Entry of the Subdivision Leader interface: the screens on the real backend, for Subdivision Leaders only (role 2). Mounted by
 * src/main.tsx at ADMIN_LIVE_BASE; the Android app does not include it.
 */
import AdminApp from './AdminApp';
import { httpGateway } from './auth/httpGateway';
import { LiveAdminDataProvider } from './live/LiveDataProvider';
import type { AdminMode } from './mode';

const liveMode: AdminMode = { gateway: httpGateway, DataProvider: LiveAdminDataProvider };

export default function AdminLiveRoot() {
  return <AdminApp mode={liveMode} />;
}
