import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { androidApiUrlProblem } from './scripts/androidApiUrl.ts'

// The backend the dev server forwards /api to. Defaults to the developer's own backend on port 8000; set STRAYSAFE_API_TARGET
// (for example http://127.0.0.1:8765) to point it somewhere else, such as the isolated test API the integration tests start.
const apiTarget = process.env.STRAYSAFE_API_TARGET || 'http://127.0.0.1:8000';
const apiPort = new URL(apiTarget).port || '80';

// https://vite.dev/config/
// `npm run dev`        -> http://<ip>:5173   (normal development)
// `npm run dev:https`  -> https://<ip>:5173  (needed for camera / QR scanner / location on phones).
//   The page is HTTPS, so the browser would block calls to the plain-HTTP backend; in this mode the
//   frontend calls the same-origin path /api, and Vite forwards it to the backend on port 8000.
export default defineConfig(({ mode }) => {
// `vite build --mode android` builds the Android Resident app (Capacitor, see docs/05-operations/ANDROID_RESIDENT_APP.md). It needs
// one explicit HTTPS backend address (VITE_API_BASE_URL, from the GitHub repository variable or the environment): stop before anything is
// bundled when it is missing or unusable, so no APK can be built that quietly talks to the wrong place.
// `--mode android-debug` builds the debug APK: the same app plus a Connection Settings screen that sets the backend address on the phone,
// so VITE_API_BASE_URL is optional there (a default for the first launch), but one that is given must still be usable.
// Other modes are unaffected.
if (mode === 'android' || mode === 'android-debug') {
  const env = loadEnv(mode, '../', ['VITE_']);   // the same root .env as below, plus variables already in the environment
  const problem = androidApiUrlProblem(env.VITE_API_BASE_URL, mode === 'android-debug');
  if (problem) throw new Error(`Android build stopped: ${problem}`);
}
return {
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  // Secrets/config live in a single root-level .env (shared with the backend),
  // not frontend/.env — point Vite at it so VITE_* vars actually load.
  envDir: '../',
  server: {
    port: 5173,
    host: '0.0.0.0',
    // Google Sign-In rejects raw IP origins; https://10-1-207-251.sslip.io:5173 resolves to the same LAN IP.
    allowedHosts: ['.sslip.io', '.trycloudflare.com', '.ngrok-free.app'],
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        // Pass the visitor's real IP (X-Forwarded-For) so rate limits and audit logs are per person, not per proxy.
        xfwd: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        // FastAPI redirects "/users" -> "/users/" with an absolute Location (http://127.0.0.1:8000/users/).
        // Following that would leave the proxy (and drop the Authorization header -> 401), so keep redirects on /api.
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const loc = proxyRes.headers['location'];
            if (typeof loc === 'string') {
              proxyRes.headers['location'] = loc.replace(new RegExp(`^https?://(127\\.0\\.0\\.1|localhost):${apiPort}`), '/api');
            }
          });
        },
      },
    },
  },
}
})
