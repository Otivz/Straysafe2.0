# Add ngrok Tunnel Instructions to How to Run Guide

- **Date:** 2026-11-24 13:33 (UTC)
- **AI tool:** Antigravity
- **Files changed:** `how_to_run.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-24_1333_add-ngrok-to-how-to-run.md`
- **Authorization:** User request ("Could you add the ngrok in the how to run md?")
- **Type:** Polish

## Intent

Document step-by-step `ngrok` usage in `how_to_run.md` alongside Cloudflare Quick Tunnels for both web browser testing (port 5173) and mobile Android APK testing (port 8000).

## Key changes

- **`how_to_run.md`:**
  - Added Section 4 ("Running with ngrok (Alternative Tunnel & Static Domain)") covering one-time authtoken setup, Method A (`ngrok http 5173` for Subdivision Leader Admin and Resident Web App), Method B (`ngrok http 8000` for Android debug APK), and static domain flag `--url=<your-static-domain>.ngrok-free.app`.
  - Updated troubleshooting FAQs to include `ngrok` commands and static domain notes.

## Validation evidence

- Verified `frontend/vite.config.ts` (`allowedHosts: ['.sslip.io', '.trycloudflare.com', '.ngrok-free.app', '.ngrok-free.dev']`) and `backend/app/main.py` (`allow_origin_regex`) match the documented ngrok domains.
