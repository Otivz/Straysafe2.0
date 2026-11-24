# Local .env: Fixed ngrok Address for Pet QR Tags and E-mail Links

- **Date:** 2026-11-24 13:08 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `.env` (local, git-ignored), `docs/README.md`
- **Authorization:** Developer: "Okay edit just make sure that you dont delete important stuff", after being offered this exact edit.
- **Type:** Fix (local configuration)

## Intent

A quick Cloudflare tunnel gets a new address every run, so printed pet QR codes broke. The developer's free ngrok "dev domain" is a fixed address.

## Key changes

- `PUBLIC_TAG_BASE_URL` and `FRONTEND_URL` are now `https://datolitic-tatyana-subgerminally.ngrok-free.dev` (the address is public, not a secret).
- The earlier duplicate `FRONTEND_URL` line was **commented out, not deleted**, with a note; its old value is still in the file.
- Nothing else in `.env` was touched: the other settings are identical, and the line count is unchanged. A backup was written outside the project, in the session scratchpad (`env_backup_before_ngrok.txt`), so no copy of the secrets can be committed.

## Validation evidence

- The backend's own settings loader reads both values, and QR links now start with the ngrok address.
- Not checked: the tunnel itself, which the developer starts (`ngrok http --url=... 5173`), and a scan of a printed code.
