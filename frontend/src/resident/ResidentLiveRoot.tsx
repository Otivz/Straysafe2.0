/**
 * Entry of the Resident interface: the screens on the real backend, for residents only (role 1).
 * Mounted by src/main.tsx at RESIDENT_LIVE_BASE, and the only interface of the Android app (docs/05-operations/ANDROID_RESIDENT_APP.md).
 *
 * The Android DEBUG build (`--mode android-debug`) adds Connection Settings: a bar on every screen, a row in Settings and a screen to
 * change the backend address on the phone. `ANDROID_DEV_CONNECT` is a constant the bundler folds, so in every other build the lazy import,
 * the bar and the labels below are dropped and `devConnection` is simply undefined.
 */
import { Suspense, lazy } from 'react';
import { Server } from 'lucide-react';
import { API_BASE_URL } from '../utils/api';
import { shortBackend } from '../utils/devBackend';
import ResidentApp from './ResidentApp';
import { httpGateway } from './auth/httpGateway';
import { LiveResidentDataProvider } from './live/LiveDataProvider';
import { DevConnectionBar } from './devConnection/DevConnectionBar';
import { Frame } from './layout/Frame';
import { ResidentModeContext, type ResidentMode } from './mode';

// Defined here, not imported: the bundler folds a constant only within one module, and the folding is what keeps the screen out of other builds.
const ANDROID_DEV_CONNECT = import.meta.env.MODE === 'android-debug';
const ConnectionPage = ANDROID_DEV_CONNECT ? lazy(() => import('./devConnection/ConnectionPage')) : null;

const devConnection: ResidentMode['devConnection'] = ConnectionPage
  ? {
    Page: ({ firstRun }) => <Suspense fallback={null}><ConnectionPage firstRun={firstRun} /></Suspense>,
    title: 'Developer connection',
    meta: () => shortBackend(API_BASE_URL) || 'No backend set',
    icon: Server,
  }
  : undefined;

const liveMode: ResidentMode = {
  gateway: httpGateway,
  DataProvider: LiveResidentDataProvider,
  ...(devConnection ? { Banner: DevConnectionBar, devConnection } : {}),
};

export default function ResidentLiveRoot() {
  // Debug build with no backend yet (none saved, none built in): nothing can run until one is entered, so start on Connection Settings.
  // Never silently a default: the app makes no request at all before this is done.
  if (devConnection && !API_BASE_URL) {
    return (
      <ResidentModeContext.Provider value={{ ...liveMode, Banner: undefined }}>
        <Frame><main id="main" tabIndex={-1} className="rs-main outline-none"><devConnection.Page firstRun /></main></Frame>
      </ResidentModeContext.Provider>
    );
  }
  return <ResidentApp mode={liveMode} />;
}
