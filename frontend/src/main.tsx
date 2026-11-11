import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import axios from 'axios'
import 'leaflet/dist/leaflet.css'
import './index.css'
import { ADMIN_LIVE_BASE, RESIDENT_LIVE_BASE } from './live/config'
import { Redirect } from './live/Redirect'
import { API_BASE_URL } from './utils/api'
import './utils/geolocationDefaults'   // every location request gets a time limit (never "locating…" forever)

// Global Axios interceptor — attaches the logged-in user's ID as X-User-Id
// so the backend can link audit log entries to the correct actor.
axios.interceptors.request.use((config) => {
  try {
    const url = config.url || '';
    const apiBase = API_BASE_URL;
    const isExternal =
      /^https?:\/\//i.test(url) &&
      !url.startsWith(apiBase) &&
      !url.includes('localhost:8000') &&
      !url.includes('127.0.0.1:8000');

    // Do not attach custom headers to external third-party requests (e.g. Nominatim OpenStreetMap)
    if (isExternal) {
      return config;
    }

    const adminRaw =
      localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
    const staffRaw =
      localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const residentRaw =
      localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');

    const raw = adminRaw || staffRaw || residentRaw;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.user_id) {
        config.headers['X-User-Id'] = String(parsed.user_id);
      }
    }
  } catch {
    // Silently ignore JSON parse errors
  }
  return config;
});

// StraySafe 2.0 has exactly two interfaces, both on the real API and both role-guarded (src/live/config.ts):
//   / (default base URL)  Subdivision Leaders (role 2)    /resident-app  residents (role 1)
// The previous portals (the old landing page, /staff/login, /resident/*, /subd/*, /admin/* ...) no longer exist as screens.
//
// ANDROID APP (Capacitor; `vite build --mode android` and `--mode android-debug`, see docs/05-operations/ANDROID_RESIDENT_APP.md): the
// Resident interface and nothing else. ANDROID_BUILD is a constant defined in THIS file on purpose: the bundler folds a constant like it
// only within one module (not one imported from another), and the folding is what keeps the Leader interface out of the app.
const ANDROID_BUILD = import.meta.env.MODE === 'android' || import.meta.env.MODE === 'android-debug'

const AdminLiveRoot = ANDROID_BUILD ? null : lazy(() => import('./admin/AdminLiveRoot'))
// eslint-disable-next-line react-refresh/only-export-components -- the entry file: nothing hot-reloads from here
const ResidentLiveRoot = lazy(() => import('./resident/ResidentLiveRoot'))

function SubdAdminRedirect() {
  const location = useLocation();
  const subPath = location.pathname.replace(/^\/(subd-admin|subd|staff)/, '') || '/';
  return <Navigate to={`${subPath}${location.search}${location.hash}`} replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path={`${RESIDENT_LIVE_BASE}/*`} element={<Suspense fallback={null}><ResidentLiveRoot /></Suspense>} />
        {/* Addresses the retired portals used (bookmarks, e-mails and notifications sent earlier still carry them). The web app only:
            the Android app has no Leader interface, and its catch-all below already leads every address to the Resident app. */}
        {ANDROID_BUILD ? null : (
          <>
            <Route path="/resident-home" element={<Redirect to={RESIDENT_LIVE_BASE} />} />
            <Route path="/resident/*" element={<Redirect to={RESIDENT_LIVE_BASE} />} />
            <Route path="/subd-admin" element={<Navigate to="/" replace />} />
            <Route path="/subd-admin/*" element={<SubdAdminRedirect />} />
            <Route path="/staff" element={<Navigate to="/" replace />} />
            <Route path="/staff/*" element={<SubdAdminRedirect />} />
            <Route path="/subd" element={<Navigate to="/" replace />} />
            <Route path="/subd/*" element={<SubdAdminRedirect />} />
            <Route path="/subd-messages" element={<Navigate to="/" replace />} />
          </>
        )}
        {AdminLiveRoot ? <Route path={`${ADMIN_LIVE_BASE}/*`} element={<Suspense fallback={null}><AdminLiveRoot /></Suspense>} /> : null}
        <Route path="*" element={<Navigate to={RESIDENT_LIVE_BASE} replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
