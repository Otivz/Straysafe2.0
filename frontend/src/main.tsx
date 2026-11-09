import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import axios from 'axios'
import 'leaflet/dist/leaflet.css'
import App from './App.tsx'
import { ADMIN_BASE } from './admin/config'
import { RESIDENT_BASE } from './resident/config'
import { API_BASE_URL } from './utils/api'
import './utils/pwaInstall'   // catch the browser's install prompt early (Install App button)
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

// Subdivision Admin UI (mock-data preview). DEVELOPMENT BUILDS ONLY.
// `import.meta.env.DEV` is written out here, not read from a shared constant, on purpose: Vite replaces it with the
// literal `false` in `vite build`, the bundler then drops the dead branch, and the lazy chunk (sample sign-in, mock
// data) is not emitted at all. To verify, run `npm run build` and confirm dist/assets has no AdminRoot-*.js file.
// It is mounted outside <App /> so none of the legacy session guards, theme sync or API calls run for it.
// See src/admin/config.ts.
const AdminRoot = import.meta.env.DEV ? lazy(() => import('./admin/AdminRoot')) : null

// Resident mobile UI (mock-data preview). DEVELOPMENT BUILDS ONLY, gated exactly like the Admin preview above: the
// condition is written inline so Vite folds it to `false` in `vite build` and the whole chunk (sample resident, mock
// data) is not emitted. To verify, run `npm run build` and confirm dist/assets has no ResidentRoot-*.js file.
// See src/resident/config.ts.
const ResidentRoot = import.meta.env.DEV ? lazy(() => import('./resident/ResidentRoot')) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {AdminRoot ? <Route path={`${ADMIN_BASE}/*`} element={<Suspense fallback={null}><AdminRoot /></Suspense>} /> : null}
        {ResidentRoot ? <Route path={`${RESIDENT_BASE}/*`} element={<Suspense fallback={null}><ResidentRoot /></Suspense>} /> : null}
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)