# Allow ngrok-free.dev Addresses on the Dev Server

- **Date:** 2026-11-24 13:06 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/vite.config.ts`, `docs/README.md`
- **Authorization:** Developer asked to be guided through a fixed ngrok address for the pet QR tags; the free ngrok "dev domain" ends in `.ngrok-free.dev`, which the dev server blocked, and the assistant had said it would add it.
- **Type:** Fix

## Intent

A new free ngrok account gets a fixed address ending in `.ngrok-free.dev`. The Vite dev server answered such a request with "Blocked request: host not allowed".

## Key changes

- `server.allowedHosts` in `frontend/vite.config.ts` now also contains `.ngrok-free.dev` (it already had `.sslip.io`, `.trycloudflare.com` and `.ngrok-free.app`). The dev server must be restarted to use it. Development only; nothing is built or deployed from this setting.

## Validation evidence

- The setting reads correctly in the file; the dev server was not restarted by this change. Not yet tried through a real ngrok tunnel.
