import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import axios from 'axios'
import App from './App.tsx'

// Global Axios interceptor — attaches the logged-in user's ID as X-User-Id
// so the backend can link audit log entries to the correct actor.
axios.interceptors.request.use((config) => {
  try {
    const url = config.url || '';
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)