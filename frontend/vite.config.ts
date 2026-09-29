import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  // Secrets/config live in a single root-level .env (shared with the backend),
  // not frontend/.env — point Vite at it so VITE_* vars actually load.
  envDir: '../',
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
})
