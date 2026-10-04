import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
// `npm run dev`        -> http://<ip>:5173   (normal development)
// `npm run dev:https`  -> https://<ip>:5173  (needed for camera / QR scanner / location on phones).
//   The page is HTTPS, so the browser would block calls to the plain-HTTP backend; in this mode the
//   frontend calls the same-origin path /api, and Vite forwards it to the backend on port 8000.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'https' ? [basicSsl()] : [])],
  // Secrets/config live in a single root-level .env (shared with the backend),
  // not frontend/.env — point Vite at it so VITE_* vars actually load.
  envDir: '../',
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
}))
