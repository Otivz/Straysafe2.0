# How to Run: ngrok Version, .env Lines and Troubleshooting

- **Date:** 2026-11-24 15:39 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `how_to_run.md`, `docs/README.md`
- **Authorization:** Developer: "Could you add the ngrok to the how to run?"
- **Type:** Polish (documentation only)

## Intent

`how_to_run.md` already had an ngrok section, committed as "howtorun". Add what the developer hit while setting it up, so the next person does not.

## Key changes

- **One-time setup:**
  - check the version (free accounts need ngrok 3.30.0 or newer; `ngrok update`);
  - the free fixed address is the dashboard's "dev domain", so a new one does not need to be created;
  - the two root `.env` lines (`PUBLIC_TAG_BASE_URL`, `FRONTEND_URL`);
  - keep the authtoken private.
- **Method A:** keep the ngrok window open, and the start order (backend, website, ngrok).
- **New "ngrok troubleshooting" table:**
  - `'ngrok' is not recognized` (PATH; use the full WinGet path or reopen the terminal);
  - `unknown flag: --url` (old agent; update or use `--domain`);
  - `ERR_NGROK_121` (too old);
  - `ERR_NGROK_3200` (offline);
  - `ERR_NGROK_334` (already online);
  - "Blocked request" (restart the website);
  - the free-plan "Visit Site" page.
- **Method B:** notes that the free plan runs one fixed-domain tunnel at a time.

## Validation evidence

- Documentation only; strict documentation audit run after the change. The error texts are the ones the developer saw (`unknown flag: --url`, `ERR_NGROK_121` with version 3.3.1, `ERR_NGROK_3200`).
