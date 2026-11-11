# Resident Server Connectivity Simplification and Run Documentation

- **Date:** 2026-11-11 06:42 (UTC)
- **AI tool:** Antigravity (Gemini)
- **Files changed:** `how_to_run.md`, `tunnel.md`, `frontend/src/utils/devBackend.ts`, `frontend/src/resident/devConnection/ConnectionPage.tsx`, `frontend/tests/devBackend.test.mjs`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-11_0642_resident-server-connectivity-simplification.md`
- **Authorization:** User requests: "create how to run .md in root, for both localhost and tunnel setup" and "for the resident do not add additional route at the end like /resident-app for server connectivity, make it simple to just put whatever the tunnel gives by daefult"
- **Type:** Polish

## Intent

Clarify and simplify server connectivity for the resident app so users can paste whatever URL the tunnel outputs by default (e.g. `https://<tunnel>.trycloudflare.com`) without adding `/resident-app` or any route suffix. In addition, document both localhost and tunnel setups comprehensively in a root `how_to_run.md` guide.

## Key changes

1. **Root Run Guide (`how_to_run.md`):**
   - Created comprehensive guide covering prerequisites, the 3 local services (FastAPI on 8000, AI worker, Vite frontend on 5173), localhost URLs, and both Cloudflare tunnel methods (Method A for web browsers on port 5173, Method B for Android APK on port 8000).
   - Indexed in `docs/README.md`.

2. **Resident Server Connectivity Simplification:**
   - `frontend/src/utils/devBackend.ts`: Updated `parseBackendUrl` to automatically normalize and strip any accidental frontend routes (e.g., `/resident-app`, `/resident-app/login`) from the server address, ensuring whatever default host/tunnel URL is entered connects directly to the backend root.
   - `frontend/src/resident/devConnection/ConnectionPage.tsx`: Clarified the input hint to state: "Paste the default tunnel URL (https://your-tunnel.trycloudflare.com) or your computer on Wi-Fi (http://192.168.1.10:8000). Do not add /resident-app or any route at the end."
   - `frontend/tests/devBackend.test.mjs`: Added unit tests verifying that accidental `/resident-app` paths are automatically stripped.
   - `tunnel.md`: Updated connection instructions to emphasize entering the plain default tunnel URL as-is without appending `/resident-app`.

## Validation evidence

- `node --test frontend/tests/devBackend.test.mjs`: 18/18 tests passed.
- `node frontend/node_modules/typescript/bin/tsc -b frontend`: 0 errors.
- `npm --prefix frontend run build`: Built successfully in 3.37s.

