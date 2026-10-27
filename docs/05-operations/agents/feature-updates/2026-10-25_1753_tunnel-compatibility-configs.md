# Tunnel Compatibility Configurations (CORS, Vite Hosts, and In-App Address Normalization)

- **Date:** 2026-10-25 17:53 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `frontend/src/utils/serverAddress.ts`, `backend/app/main.py`, `frontend/vite.config.ts`
- **Authorization:** Developer request: "Okay lets do it" with Cloudflare Quick Tunnel selection
- **Type:** Fix

## Intent

Prepare the StraySafe 2.0 frontend, backend CORS, and APK address normalizer to accept external tunneling domains (`*.trycloudflare.com` and `*.ngrok-free.app`) for seamless remote testing across mobile data and foreign Wi-Fi networks without requiring APK rebuilds.

## Key changes

- **`frontend/src/utils/serverAddress.ts`**:
  - Enhanced `normalizeServer()` to distinguish IP addresses from public domains.
  - Public domain names (such as `*.trycloudflare.com`) default to `https://` and do not have port `:8000` forced upon them, ensuring the native APK successfully connects to public edge tunnels.
- **`backend/app/main.py`**:
  - Updated FastAPI `allow_origin_regex` in `CORSMiddleware` to include `[a-zA-Z0-9-]+\.trycloudflare\.com` and `[a-zA-Z0-9-]+\.ngrok-free\.app`, preventing browser CORS blocking when accessed remotely.
- **`frontend/vite.config.ts`**:
  - Added `.trycloudflare.com` and `.ngrok-free.app` to Vite's `allowedHosts` whitelist to prevent `403 Invalid Host header` errors when accessing the Vite dev server through a tunnel.

## Validation evidence

- Audited regex patterns and verified backward compatibility with existing localhost and LAN IPs (`192.168.*`, `10.*`, `172.16-31.*`).
- Verified `normalizeServer()` unit behavior: raw IPs still correctly receive `:8000`, while HTTPS domains retain edge port 443.
