# Tunnel documentation: Cloudflare Quick Tunnel

- **Date:** 2026-11-09 16:40 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `tunnel.md`, `docs/05-operations/ANDROID_RESIDENT_APP.md`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-09_1640_tunnel-docs-quick-tunnel.md`
- **Authorization:** Developer request in Claude Code: "Update the StraySafe tunnel documentation only" (follow-up to a read-only inspection that found the Android Connection Settings already accept Cloudflare Quick Tunnel URLs). FREEZE was OFF. Nothing was committed or pushed.
- **Type:** Polish

## Intent

`tunnel.md` still described a fixed tunnel URL, absolute paths from another computer (`c:\Users\User\Desktop\...`) and the legacy "Server settings" login link. Make it match how the project is run now, and make Cloudflare Quick Tunnel the documented preferred development tunnel.

## Key changes

- `tunnel.md`: backend, AI worker and Vite start-up commands are relative to the repository root (`cd backend`, `cd frontend`); the stale Quick Tunnel URL is removed (the document now says the URL is generated on every start and must be copied from the `cloudflared` terminal); the tunnel command is `cloudflared tunnel --url http://localhost:8000` (`cloudflared` is on the PATH); it states that each Quick Tunnel restart generates a new HTTPS URL; the Android section is rewritten for the debug APK's Connection Settings (the amber "Debug build" bar, Settings → Developer, or the first-launch screen; Test connection; Save & connect; switching signs you out); the troubleshooting rows and the second tunnel's command follow. Seed accounts, the architecture diagram and the Google Sign-In row are unchanged.
- `docs/05-operations/ANDROID_RESIDENT_APP.md`: the tunnel sentence of the backend requirements now names Cloudflare Quick Tunnel as the preferred development tunnel, with the command, the new-URL-per-restart note and a link to `tunnel.md`; other tunnels keep the valid-certificate and no-warning-page conditions.
- `docs/README.md`: the `tunnel.md` row description and this record.

## Validation evidence

Documentation only. No application code, dependency, CORS, GitHub Actions or database configuration was changed; no package installed; no server or tunnel started; no tests run. The commands and screen names written in the documents were checked against the repository: the `uvicorn` command and port 8000 against `setup.md` and the previous `tunnel.md`; the Connection Settings entry points and button names against `src/resident/devConnection/` and `src/resident/pages/account/SettingsPage.tsx`. The strict documentation audit is run after the edit (see the final report).
