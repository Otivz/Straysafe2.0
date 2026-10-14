# StraySafe 2.0: Performance Audit

**Date:** 2026-10-13
**Scope:** backend, database, frontend, polling, AI, maps, messaging, media, Android app.
**Status:** audit only. No code, schema or configuration was changed for this report. Every number below was
measured on this machine, on the live development setup (Windows, 12 logical CPUs, MySQL, `uvicorn --reload`, Vite
dev server), unless it is marked **(not measured)**. Section 13 says exactly how to measure those.

---

## 1. Executive summary

The database is **tiny**: 34 reports, 59 photos, 613 notifications, 14 pets. So StraySafe isn't slow because of data
volume. It's slow because of **how much work each page asks for, how often, and where that work runs**.

The five root causes, in order of impact:

1. **AI runs inside the web server.** The separate AI worker (`python -m app.ai_worker`) has **never run**: all 73
   AI jobs ran in the web server's built-in fallback ("embedded runner").
   - Each new report starts a follow-up job that takes **37 s on average and up to 114 s**. It runs Gemini Vision
     calls one after another, inside the same process that answers every page.
   - Two upload endpoints also run YOLO + Gemini **while the reporter waits**.
2. **A 30 MB animated GIF** (plus a 7 MB one) is used for loading screens and for the AI photo-check badge. It's
   packed into the build **twice**, so the web build is **80 MB** and the Android app's web assets are **78 MB**.
   On a phone this alone can take many seconds.
3. **"One query per item" endpoints that are also polled:**
   - `/matches/`: **304 queries, 449 KB**.
   - `/claims/` (Subdivision Leader): **265 queries, 200 KB**.
   - `/rescue-requests/`: **78 queries, 65 KB**.
   - With 10 requests at once, each `/matches/` took **~3 s instead of 0.3 s**, and an unrelated tiny request went
     from **8 ms to 86 ms**. One busy dashboard slows everyone.
4. **Sidebars download whole lists to show a number.** The Barangay and Subdivision sidebars fetch the full
   `/claims/` list (and the full adoption applications list) **every 15 s**, just to draw a badge count.
5. **Heavy pages poll a lot.** The Barangay dashboard makes **43 requests on load and 53 per minute** while open,
   including the full report list (315 KB) and rescue list every 30 s.

YOLO itself is **not** a problem: it analyses a photo in **~35 ms**.

**Already fixed earlier today** (before this audit, measured):
- The cross-tab polling loop: tabs no longer wake each other up through `localStorage` events.
- The duplicated unread-message pollers are now one shared poller, paused in hidden tabs.
- `/chat/threads` went from **265 to 46 queries** for Barangay staff and **279 to 37** for the Subdivision Leader,
  about **250 ms → 50–80 ms**.

---

## 2. Measured evidence

### 2.1 Endpoint timings
Measured on `127.0.0.1:8000`, median of 3 runs, signed in as each role, read-only GETs.

| ms | Size | Role | Endpoint |
|---:|---:|---|---|
| 252 | 449 KB | Admin | `GET /matches/` |
| 212 | 200 KB | Leader | `GET /claims/` |
| 185 | 65 KB | Leader | `GET /rescue-requests/?subdivision_id=1` |
| 173 | 65 KB | Barangay | `GET /rescue-requests/?barangay_id=1` |
| 96 | 23 KB | all | `GET /holding/` |
| 75–80 | **315 KB** | Leader / Barangay / Admin | `GET /reports/` (34 reports, about 9 KB per report) |
| 76 | 121 KB | Resident | `GET /reports/` |
| 64 | 26 KB | Barangay | `GET /claims/` |
| 45–59 | 4–32 KB | all | `GET /chat/threads` (after today's fix) |
| ≤ 40 | — | — | report detail, notifications, pets, users, counts, landmarks |

> Calls to `localhost` measured ~200 ms slower than `127.0.0.1` on this PC (Windows tries IPv6 first). The Vite
> proxy already uses `127.0.0.1`, so this doesn't affect the app, only tools that call `localhost:8000`.

### 2.2 Database queries per request

| Queries | ms | Size | Endpoint | Most-repeated table |
|---:|---:|---:|---|---|
| **304** | 325 | 449 KB | `/matches/` (Admin) | `report_media` ×163, `reports` ×31, `comments` ×25, `status_history` ×25 |
| **265** | 258 | 200 KB | `/claims/` (Leader) | `report_media` ×127, `reports` ×39, `report_returns` ×19 |
| 93 | 61 | 26 KB | `/claims/` (Barangay) | `report_media` ×20, `endorsement_letters` ×19 |
| 78 | 247 | 65 KB | `/rescue-requests/` (Leader) | `report_media` ×57 |
| 44 | 56 | 26 KB | `/matches/?subdivision_id=1` | `reports` ×17 |
| 30 | 55 | 121 KB | `/reports/` (Resident) | |
| 22 | 62 | 315 KB | `/reports/` (Leader) | (already batched) |

### 2.3 Contention: one process serves everyone
With 10 simultaneous heavy requests and one small request alongside:

| Load | Each heavy request | Small request (alone: 8 ms) |
|---|---|---|
| 10 × `/matches/` | **2.7–3.0 s** (alone 0.3 s) | **86 ms** |
| 10 × `/claims/` | **1.9–2.2 s** (alone 0.3 s) | 35 ms |

The backend is one Python process, started with `--reload`, so heavy Python work queues up behind the interpreter
lock and every user waits.

### 2.4 Requests a real browser sends
Headless Chrome, signed in, development build, 60 s on the page, then 30 s with the tab hidden.

| Page (user) | On load | Per minute, visible | Per 30 s, hidden |
|---|---:|---:|---:|
| Barangay dashboard (#4) | **43** | **53** | 4 |
| Resident home (#6) | 24 | 20 | 0 |
| Subdivision reports (#3) | 26 | 21 | 2 |

**Barangay dashboard, per minute:**
- `/chat/threads` ×6, `/chat/adoptions/threads` ×6, notifications ×6
- `/reports/sidebar-ids` ×5
- `/claims/` ×4, `/adoptions/applications` ×4, `/adoption-tasks/count` ×4, `/holding/metrics` ×4
- `/reports/`, `/rescue-requests/`, `/holding/`, `/users/` and `/landmarks` ×2 each

The load counts are doubled for many endpoints because the development build uses React StrictMode, which runs each
page's start-up code twice. Production builds don't (see M2).

### 2.5 AI

| Measure | Value |
|---|---|
| AI jobs run by the separate worker | **0 of 73** |
| AI jobs run inside the web server | **73 of 73** |
| Follow-up job (Gemini + look-alike / duplicate scan) | avg **36.7 s**, max **114 s** (40 jobs) |
| Photo job | avg 2.6 s, max 33 s (33 jobs) |
| YOLO model load | 3.0 s once, **+318 MB** memory |
| YOLO inference, warm | **31–40 ms** per photo (CPU, 8 threads, no GPU) |
| Gemini budget per call | 35 s, with fallback through several models (`ai_suggestions.py`) |

### 2.6 Media and assets

| Item | Size |
|---|---|
| `dog_and_cat_running.gif` | **29.8 MB** (1280×720, 120 frames), in the build **twice** |
| `straysafe_running_cat.gif` | **6.9 MB** (600×338, 120 frames), in the build twice |
| Web build (`dist/`) | **80 MB**, of which ~73 MB is these GIFs |
| Android web assets | **78 MB**, built 2026-09-28 (stale) |
| JavaScript total | 5.9 MB in 190 lazy chunks. Largest: QR scanner 719 KB, map 585 KB, app shell 212 KB |
| Report photos | Cloudinary originals, **no resizing** (sampled 21–618 KB each) |
| `<img>` tags with `loading="lazy"` | **1 of 314** |
| `SSLOGO.png` | 816 KB at 1024×1024, shown at about 36 px |

### 2.7 Memory and CPU

| Process | Memory |
|---|---|
| Web server process (no YOLO loaded at the time) | 163 MB |
| Plus YOLO when loaded | +318 MB |
| MySQL | 165 MB |
| Vite dev server (node) | 215 MB |

CPU during an AI job: **(not measured)**. See section 13.

---

## 3. Findings by severity

Each finding gives the evidence, the cause, the impact, the safe fix and its risk. **Confirmed** means measured.
**Likely** means inferred from code and not yet measured.

### CRITICAL

**C1. AI work runs inside the web server.** Confirmed.
- **Where:**
  - `app/utils/ai_jobs.py`: `start_embedded_runner()`, `run_loop()`, `process_one()`
  - `app/utils/ai_pipeline.py`: `run_follow_up_now()`
  - `app/routes/matches.py`: `scan_and_generate_matches_for_report()`
- **Evidence:** all 73 jobs have `locked_by = embedded:…`; follow-up jobs run 37 s on average, up to 114 s.
- **Why it's slow:** the embedded runner is a safety net for when the separate worker isn't running. But that worker
  has never been started, so the long Gemini scan, image decoding and comparisons all run in the process that serves
  every page. The scan calls Gemini Vision **one candidate at a time** (`for pet in eligible_pets`,
  `for cand in near_cands`), each with up to a 35 s budget.
- **Impact:** report submission, dashboards and chat share CPU and the interpreter with the scan. Section 2.3 shows
  how heavy work in this process slows everyone. How much an AI job specifically adds hasn't been measured yet
  (section 13 has the test).
- **Fix, with no code change:** start the AI worker that already exists (`python -m app.ai_worker`, already in
  `setup.md` as Terminal 2). The embedded runner then steps aside on its own (`only_if_no_worker`). Later, set
  `AI_WORKER_EMBEDDED=off` in `.env` so it can never run in the web server again.
- **Risk:** none for behaviour, as it's the same code in a different process. If the worker is stopped, jobs wait in
  the queue instead of running.

**C2. AI and Gemini run inside upload requests.** Confirmed by reading the code; timing not measured.
- **Where:** `app/routes/reports.py`: `analyze_report_media()` (`POST /reports/analyze-media`) and
  `validate_report_images()` (`POST /reports/validate-images`).
- **Why it's slow:** YOLO plus one Gemini Vision call per photo run while the reporter waits. YOLO is fast (35 ms);
  the Gemini calls are the wait, up to the 35 s budget each.
- **Fix (needs your decision, because it changes what the reporter sees):**
  - (a) run the per-photo Gemini checks at the same time instead of one by one, with a limit of 2–3; or
  - (b) show the YOLO result straight away and move the authenticity check to the AI worker.

  Neither changes the detection logic.
- **Risk:** (a) more parallel Gemini calls means rate limits and cost; (b) the AI-generated warning would appear a
  little later instead of before submitting.

**C3. Very large GIFs on loading screens and the AI badge.** Confirmed.
- **Where:**
  - `src/components/StraySafeLoading.tsx` (10 uses), whose "both" variant uses the 29.8 MB GIF
  - `src/components/AiImageVerificationBadge.tsx`, which shows the 29.8 MB GIF during the photo check
  - copies in both `src/assets/` and `public/assets/`, so both end up in `dist/`
- **Why it's slow:** 30 MB has to download before the animation shows, and decoding 120 frames at 1280×720 uses a lot
  of memory and CPU, especially on phones and inside the Android WebView. It shows up exactly during AI processing.
- **Fix:** re-encode the animations as a short MP4/WebM (`<video autoplay muted loop playsinline>`) or a small
  animated WebP at display size. That's typically well under 1 MB, but the exact size can only be known after
  encoding. Then delete the duplicate copy in `public/assets/` (the `src/assets/` import is enough) and keep the
  fallback path pointing at the same file.
- **Risk:** visual only. Check that the animation looks the same.

### HIGH

**H1. "One query per item" in polled list endpoints.** Confirmed (section 2.2).
- **Where:**
  - `app/routes/matches.py`: `get_matches()` → `_serialize_matches()` (`ReportMatchResponse.model_validate` loads each
    embedded report's media, comments and history separately)
  - `app/routes/claims.py`: the claims list
  - `app/routes/rescue.py`: `get_rescue_requests()` → `_populate_rescue_fields()`
- **Why it's slow:** each item loads its photos and history in separate queries. `report_media` alone is queried 163
  times for one `/matches/` call.
- **Fix:** load the related rows in bulk (`selectinload(Report.media)`, comments, history; one query for owner
  returns), the same way `/reports/` and `/chat/threads` already do. **Same output**; check with a before/after
  JSON comparison, as done for `/chat/threads`.
- **Expected gain:** `/chat/threads` went from 265 to 46 queries and about 250 to 50–80 ms with this exact technique.
  Similar gains are likely, but they must be measured.
- **Risk:** low with an output comparison. It doesn't change matching logic, only how data is loaded.

**H2. Sidebar badges download whole lists every 15 s.** Confirmed.
- **Where:**
  - `src/components/SubdSidebar.tsx` `fetchCounts()`: `/claims/` (200 KB, 265 queries), `/reports/sidebar-ids`,
    `/chat/unread-count`
  - `src/components/BrgySidebar.tsx` `fetchCounts()`: `/claims/`, `/adoptions/applications`,
    `/adoption-tasks/count`, `/holding/metrics`, `/reports/sidebar-ids`
- **Fix:** one small `GET /sidebar/counts` endpoint per role that returns only the numbers, using the same access
  rules as the lists. The sidebar then makes 1 call instead of 4–5.
- **Risk:** the counts must use exactly the same scoping as the lists, so test each badge against its list.

**H3. One backend process, auto-reload on, no workers.** Confirmed.
- **Where:** the way the server is started, `uvicorn app.main:app --reload` (`setup.md`).
- **Why it's slow:**
  - Everything shares one Python process (section 2.3).
  - `--reload` restarts the server on every code change. That **kills in-flight background work**: it happened
    today to emails #71–72 and to AI jobs mid-run.
- **Fix:** for demos and deployment, run **without `--reload`** and with a few workers (e.g. `--workers 3`), and run
  the AI worker separately (C1). Keep `--reload` only while coding.
- **Risk:**
  - With several workers, each process loads YOLO if it handles a photo request (+318 MB each).
  - The background loops (email worker, push worker, unassigned-report watcher) would run once per worker. They're
    safe against double-sending (claims and unique keys), but run them in one place if you prefer.

**H4. Report list payload: 315 KB for 34 reports.** Confirmed size; growth is projected.
- **Where:** `GET /reports/` (`app/routes/reports.py` `get_reports()`), used by maps, feeds, search and lists.
- **Why it's slow:** each report carries its full history, comments, disputes, media, merge and warning details, about
  9 KB each. That grows linearly: around 1,000 reports would be roughly 9 MB per call (a projection).
- **Fix:** an optional `?view=summary` that returns only what lists and maps need (id, status, coordinates, animal,
  first photo, priority, visibility), used by the map, feed and search. Detail pages keep the full report.
- **Risk:** each page switched to the summary must be checked for fields it reads, so do it one page at a time.
  Visibility rules stay on the server either way.

**H5. Barangay dashboard polling.** Confirmed: 53 requests per minute.
- **Where:** `src/pages/Barangay_Staff/BrgyDashboard.tsx`: `fetchDashboardData` every 30 s (reports, rescues,
  holding, users, landmarks), plus the sidebar, navbar and chat.
- **Fix:**
  - Refresh only the small counters every 30 s, and the full lists only on demand or every 2–5 minutes (your call).
  - Once H1 and H2 are done, this page's cost drops a lot anyway.
- **Risk:** data updates less often. Use push notifications for urgent changes.

**H6. Full-size photos everywhere, almost no lazy loading.** Confirmed.
- **Where:** 314 `<img>` tags in `frontend/src`, 1 of them lazy. Report cards and lists load Cloudinary originals.
- **Fix:**
  - Add a small helper that turns a Cloudinary URL into a thumbnail URL (`/upload/f_auto,q_auto,w_400/…`). It's a
    URL change only: no new library, the stored data is unchanged, and the original stays available for viewers and
    AI.
  - Add `loading="lazy"` to list and card images.
- **Risk:**
  - Never use the thumbnail URL for AI or evidence viewing.
  - Cloudinary transformations count against the plan's quota (check the plan).

### MEDIUM

**M1. Map markers are rebuilt on every render.** Confirmed in code; effect not measured.
- **Where:** `src/components/MapComponent.tsx`, around lines 1296–1312. Each marker's `icon={create…Icon(...)}` creates
  a **new** Leaflet icon on every render, and `eventHandlers={{…}}` is a new object each time.
- **Why it's slow:** react-leaflet sees a new icon and **replaces the marker's HTML**, so every poll that re-renders a
  page with a map rebuilds all markers. The `markers` memo also depends on the array the page passes in, which most
  pages rebuild on each render.
- **Fix:** cache icons by their inputs (category, colour, zoom, label), and memoize the event handlers. Same look and
  behaviour.
- **Risk:** low. Check every marker type still shows correctly.

**M2. You're measuring the development build.** Confirmed.
- **Where:** `src/main.tsx` uses `<StrictMode>`, which doubles start-up effects in development. Vite dev also serves
  hundreds of separate modules.
- **Effect:** page loads in development make about twice the requests and feel slower than production.
- **Fix:** none needed in code. Judge speed with `npm run build && npm run preview` (section 13).

**M3. The Android app bundle is stale, huge, and tied to one network address.** Confirmed.
- **Where:** `frontend/android/app/src/main/assets/public/` (built 2026-09-28, 78 MB). `.env` `VITE_API_BASE_URL`
  points to a fixed LAN IP, and the PC's IP has changed several times.
- **Effect:**
  - The APK is two weeks old: no lazy loading, no fixes since.
  - Most of its 78 MB is GIFs (C3), which slows install and start-up.
  - When the IP changes, every API call **times out**, which looks like "very slow".
- **Fix:**
  - Rebuild and sync before each test: `npm run build` then `npx cap sync android`.
  - Do C3.
  - Set the API address to a stable host (a DHCP reservation for the PC, or the deployed server).
- **Measure:** see section 13.

**M4. Gemini look-alike comparisons run one at a time.** Confirmed in code.
- **Where:** `app/routes/matches.py` scan loops, `app/utils/ai_matching.py` `compare_animals_vision_cached()`.
  Comparisons are already cached per image pair (`ai_vision_comparisons`, 240 rows), and images are cached on disk.
- **Fix:** run 2–4 comparisons at once inside the AI worker, with a limit. **Same candidates, same scoring, same
  results**; only waiting overlaps.
- **Risk:**
  - Gemini rate limits and cost per minute.
  - Database writes to the cache table must happen on the worker's main thread.
  - Do this only after C1, so it never runs in the web server.

**M5. A few database indexes are missing.** Confirmed; effect at today's size is negligible.
- **Missing:**
  - `chat_threads.related_id` (joined on every thread list)
  - `notifications (user_id, created_at)` for the per-user list sorted by date
  - `chat_messages (thread_id, is_read)` for unread counts
  - `audit_logs (target_table, target_id)`
- **Note:** adding indexes is a **schema change**. Per your rules this is a recommendation only, to apply with your
  approval, as `ensure_*` migrations plus `Database3.3.txt`. Benefit grows with data; at 600 notifications it's
  milliseconds.

**M6. Address look-ups from the browser.** Confirmed in code.
- **Where:** `PetMatchReview.tsx` calls Nominatim (OpenStreetMap) on every load; `MapComponent` calls it when a
  sighting popup opens (`reverseGeocodeStreet`).
- **Effect:** each look-up depends on an outside service (often 0.5–2 s, not measured here) that limits clients to
  1 request per second.
- **Fix:** cache results per rounded coordinate in the browser (`sessionStorage`), or reuse the stored landmark.

**M7. The sidebars still fetch once when a tab is hidden.** Confirmed: the 4 hidden-tab requests in section 2.4.
- **Where:** `BrgySidebar.tsx` and `SubdSidebar.tsx` add `visibilitychange → fetchCounts`, which also fires when the
  tab is *hidden*.
- **Fix:** only fetch when the tab becomes visible.

### LOW

- **L1.** YOLO is **not** a bottleneck (35 ms per photo). No change is needed beyond C1/C2.
- **L2.** `SSLOGO.png` is 816 KB at 1024 px but shown at ~36 px. A 128 px copy would save about 800 KB on first
  load.
- **L3.** Very large page components (4,000+ lines: `BrgyAdoptions`, `ResiHomePage`, `SubdViewReport`). Every poll
  that changes state re-renders the whole page. **(not measured)** Profile them before splitting anything (section
  13). Don't refactor them just for size.
- **L4.** `pool_pre_ping=True` adds one tiny query each time a connection is taken from the pool. It's kept on
  purpose (it prevents "MySQL has gone away"); there's nothing to change.
- **L5.** `/holding/` takes 84–96 ms with 1 query, so the cost is Python-side shaping of the response. Small;
  revisit after H1.
- **L6.** Cloudflare R2 isn't used (only an old compiled file `app/utils/__pycache__/r2_storage.cpython-312.pyc`
  remains). All media is on Cloudinary.

---

## 4. Polling inventory (frontend)

All network polls are now visible-only after today's fix, except where marked. "Shared" means one request per tab
however many components use it.

| Component | Every | Calls | Notes |
|---|---|---|---|
| `useUnreadMessageCount` (navbars and sidebar) | 10 s | `/chat/threads` (+ `/chat/adoptions/threads`) | Shared per tab, visible only, chat changes only |
| `ResiNavbar` | 8 s | `/notifications/user/{id}` | |
| `BrgyNavbar` | 10 s | notifications | |
| `SubdNavbar` | 30 s | notifications | |
| `BrgySidebar` | 15 s | `/reports/sidebar-ids`, **`/claims/`**, **`/adoptions/applications`**, `/adoption-tasks/count`, `/holding/metrics` | H2, M7 |
| `SubdSidebar` | 15 s | `/reports/sidebar-ids`, **`/claims/`**, `/chat/unread-count` | H2, M7 |
| `AdminSidebar` | 30 s | badge counts | |
| `BrgyDashboard` | 30 s | reports, rescues, holding, users, landmarks | H5 |
| `AdminDashboard` | 30 s | dashboard data | |
| `BrgyMessages` / `SubdMessages` | 5 s | thread list, plus the open conversation every few seconds | Intended for a live chat feel |
| `ReportChatDrawer` | 5 s | the open chat | Already paused when hidden |
| `useAdoptionChatUnread` | poll | adoption chat counts | Visible only |
| `BrgyAdoptions` / `MyAdoptionApplications` | 8 s | applications | Also refreshes on focus |
| `EndorsementArch` (2), `EscelatedMissions` | 5 s | documents, missions | Live mission tracking |
| `BrgyAdoptionTasks` | 30 s | tasks | |
| `BrgyHoldingFacility` / `SubdHoldingFacility` | 10 s | **none** (a local "time in holding" tick) | No network |
| `utils/liveNavigation.ts` | GPS watch | position, re-route after 5 m / 5 s | Only during live navigation; throttled |
| `AdminHeatMap` | GPS watch | position | Only on that page |
| `InactivityManager` | timer | none (local session timeout) | |
| Push worker (backend) | 5 s | outbox sweep | Off without keys |
| Email worker (backend) | 60 s | email retries | |
| AI embedded runner (backend) | 2 s | job queue | **Should be off: C1** |

---

## 5. Backend API bottlenecks (summary)

| Endpoint | Problem | Finding |
|---|---|---|
| `GET /matches/` | 304 queries, 449 KB | H1 |
| `GET /claims/` | 265 queries (Leader), polled by sidebars | H1, H2 |
| `GET /rescue-requests/` | 78 queries, polled by the dashboard | H1, H5 |
| `GET /reports/` | 315 KB / 34 reports, used by maps, feeds and search | H4 |
| `POST /reports/analyze-media`, `/validate-images` | YOLO + Gemini inside the request | C2 |
| AI follow-up job | 37–114 s inside the web server | C1, M4 |
| The server as a whole | one process, `--reload` | H3 |

## 6. Frontend rendering and network (summary)
- **Network:** C3 (GIFs), H2 (sidebars), H5 (dashboard), H6 (images), M6 (address look-ups).
- **Rendering:** M1 (map markers), L3 (large pages, profile first).
- **Timers and listeners:** all timers clean up on unmount. The storage-event loop is fixed. M7 is the only leftover.

## 7. AI performance (summary)
YOLO is fine. The time goes to **Gemini network calls**, made **one at a time**, **in the wrong process** (C1), and
**while the reporter waits** (C2). Caching is already done well (per image pair and on disk), so there's no repeated
analysis of the same pair. Fix order: C1, then M4, then C2.

## 8. Database (summary)
The data is too small for SQL speed to matter yet. The issue is the **number of queries** (H1) and **payload size**
(H4), not slow queries. There are no slow JOINs at this size. Indexes: M5, with approval.

## 9. Maps and GPS (summary)
- M1: markers rebuilt on every render.
- The map is lazy-loaded (585 KB chunk, only on map pages).
- Each map instance fetches `/landmarks` and the HQ itself, which is acceptable.
- Live navigation is already throttled (5 m / 5 s). The heat map's `watchPosition` runs only on its own page.

## 10. Messaging and notifications (summary)
After today's fixes:
- one shared thread poll per tab, visible only;
- `/chat/threads` at about 46 queries;
- the push worker sends from an outbox, outside requests.

Remaining:
- the Messages pages poll the thread list every 5 s (intended for a live feel; could be 10 s);
- notifications poll every 8–30 s depending on the navbar.

## 11. Android app (Capacitor) (summary)
M3 covers it: the bundle is stale, 78 MB (mostly the GIFs from C3), and pointed at a fixed LAN address. Start-up
time, memory and WebView rendering on a device **(not measured)**: see section 13.

---

## 12. Recommended fixes, ranked by impact

| # | Fix | Effort | Risk | Changes behaviour? |
|---|---|---|---|---|
| 1 | **Run the AI worker** (C1), then `AI_WORKER_EMBEDDED=off` | none (run a command) | none | no |
| 2 | **Re-encode the GIFs and remove the duplicates** (C3) | small | visual check | no |
| 3 | **Batch-load `/matches/`, `/claims/`, `/rescue-requests/`** (H1) | medium | low (output diff) | no |
| 4 | **Sidebar count endpoint** (H2) | small–medium | badge correctness | no |
| 5 | **Run without `--reload`, with workers, for demos** (H3) | none (command) | memory per worker | no |
| 6 | Thumbnails + lazy images (H6) | small | quota | no |
| 7 | Map icon caching (M1) | small | marker look | no |
| 8 | Dashboard polling split (H5) | small | data freshness | **yes**, slightly less frequent |
| 9 | `?view=summary` for lists and maps (H4) | medium | page fields | no, if done carefully |
| 10 | Parallel Gemini comparisons in the worker (M4) | medium | rate limits and cost | no |
| 11 | Upload-time Gemini checks in parallel, or moved later (C2) | medium | UX timing | **yes**, your decision |
| 12 | Indexes (M5) | small | schema change | no; needs approval |
| 13 | M6, M7, L2 | small | low | no |

## 13. How to measure what this report couldn't

**API latency while an AI job runs (C1):**
1. Start sampling with the benchmark script below in a loop.
2. Submit a report with a photo as a resident.
3. Compare latency during the follow-up job against before it.
4. Repeat with `python -m app.ai_worker` running. Expected: the web server's numbers stay flat in the second run.

**CPU and RAM during AI:** Task Manager → Details → add the "CPU" and "Memory (private working set)" columns for each
`python.exe`, then submit a report. Or run
`python -c "import psutil,time; p=psutil.Process(PID); [print(p.cpu_percent(1), p.memory_info().rss//2**20) for _ in range(120)]"`.

**Gemini latency per call:** wrap `client.models.generate_content` in `call_gemini_with_fallback`
(`ai_suggestions.py`) with `time.perf_counter()` and log it, for one test session. A temporary log line is enough;
remove it afterwards.

**Production speed (M2):**
1. Run `cd frontend && npm run build && npm run preview`, then open the printed URL. The API needs
   `VITE_API_BASE_URL` reachable.
2. In Chrome DevTools, use the **Lighthouse** tab (Navigation, Mobile), and the **Network** tab with "Slow 4G" to see
   C3.

**React re-renders (M1, L3):**
- In React DevTools → Profiler → record 30 s on a page.
- Or use ⚙ → "Highlight updates when components render" and watch what flashes on each poll.

**Android (M3):**
- Build with `npm run build` then `npx cap sync android`, and open it in Android Studio.
- **App Inspection / Profiler** shows CPU, memory and network.
- `chrome://inspect` on the PC shows the WebView's DevTools (Network and Performance), same as the browser.
- Cold start: run `adb shell am start -W com.straysafe.app/.MainActivity` and read `TotalTime`.

**Benchmark scripts used for this report:**
- `bench.py`: endpoint timings per role
- `qcount.py`: queries per request (SQLAlchemy `before_cursor_execute` counter)
- `contention.py`: 10 parallel requests plus a small one
- `poll_probe.mjs`: headless Chrome request counter, visible and hidden

They're in the session scratchpad; I can add them to the repo under `backend/perf/` if you want them kept. Re-run all
four **before and after** each fix, and compare JSON outputs for any endpoint that's batch-loaded.

## 14. Optimization roadmap

**Step 0 (no code):**
- Run the AI worker (C1).
- Run without `--reload` when demoing (H3).
- Judge speed on a production build (M2).
- Rebuild the APK (M3).

**Step 1 (biggest wins, behaviour unchanged):** GIFs (C3), then batch-loading (H1), then the sidebar count endpoint
(H2). Re-run the benchmarks after each.

**Step 2 (front end):** image thumbnails and lazy loading (H6), map icon caching (M1), the M6/M7/L2 small fixes.

**Step 3 (needs your decisions):**
- dashboard refresh cadence (H5)
- summary list view (H4)
- parallel Gemini in the worker (M4)
- upload-time AI checks (C2)
- indexes (M5)

**At each step:**
- run the full backend test suite, `tsc` and `vite build`;
- compare JSON outputs for any changed endpoint;
- do a manual check of the affected pages in each role.

---

## 15. Implementation order (safe sequence)

Status: **plan only, nothing implemented.** Each step waits for your go-ahead.

**The order rule:** biggest gain for least risk first. Steps that don't change any code go first. Then come changes
that keep exactly the same output, which are checked automatically. Anything that changes behaviour comes last and
needs your decision.

### 15.1 Already done since this audit (so they're not repeated)

| Item | What was done | Verified by |
|---|---|---|
| Cross-tab polling loop | Tabs no longer wake each other through `localStorage` events | Headless browser request count |
| Duplicate unread pollers | One shared `/chat/threads` poller per tab, paused in hidden tabs | Same |
| `/chat/threads` queries | 265 → 46 (Barangay), 279 → 37 (Subdivision Leader), identical output | JSON before/after diff |
| Hidden-tab polling | Network timers skip hidden tabs (`whenVisible`) | Probe: 0–4 requests while hidden |
| Barangay portal caching | Instant return to modules; filters kept; cache tied to the account and cleared on sign-out | Browser probe; sign-out removed 10 → 0 entries |
| Barangay sidebar | Overlapping badge refreshes merged; "viewed" events recount locally; refresh only when the tab becomes visible (**M7 done for the Barangay sidebar**) | Probe: 31 → 21 requests on page return (dev build) |

### 15.2 Safety rules for every step

1. **One item per step.** Never two at once, so if something breaks we know which change did it.
2. **Measure before and after** with the same scripts (section 13): `bench.py`, `qcount.py`, `contention.py`,
   `poll_probe.mjs`. Keep each run's output.
3. **Same output.** For any endpoint whose loading changes, save its JSON for **every role**
   (Resident, Leader, Barangay, Admin) before the change, and compare after it. **Zero differences allowed.** This is
   how the `/chat/threads` fix was checked.
4. **Full backend test suite** (`for t in tests/test_*.py`), plus `tsc` and `vite build`, must pass after every
   step.
5. **A manual check of the affected pages in each role** before moving on.
6. **Can be undone:**
   - each step is its own commit (you commit);
   - steps that only change how the system is run (not code) are undone by running it the old way.
7. **Untouched throughout:** the database schema, permissions, report visibility, AI matching and duplicate logic,
   rescue workflows, and messaging rules (as listed in your audit restrictions).

### 15.3 The order

**Phase A: no code changes (do first; biggest gain, close to zero risk)**

| # | Step | Finding | Why it's safe | How we check it | Undo |
|---|---|---|---|---|---|
| A1 | **Save a baseline**: run all four benchmark scripts and store the outputs | — | Read-only | Files saved | — |
| A2 | **Run the AI worker** in its own terminal: `python -m app.ai_worker` (already in `setup.md`) | C1 | Same code, different process. The web server's embedded runner already steps aside on its own when the worker is alive. | New AI jobs show `locked_by = worker:…` instead of `embedded:…`. Submit a report and run `bench.py` during the follow-up job: the web server should stay flat. | Stop the worker; the embedded runner takes over again automatically |
| A3 | After A2 works for a few days: set `AI_WORKER_EMBEDDED=off` in `.env` | C1 | Only stops the fallback | AI jobs keep finishing (`ai_jobs.status = done`) | Remove the line |
| A4 | **For demos and speed tests, run the backend without `--reload`** (`uvicorn app.main:app --host 0.0.0.0 --port 8000`) | H3 | Same app. Stops restarts that kill in-flight emails, pushes and AI jobs. | `contention.py` before/after; no more "interrupted" emails | Run with `--reload` again |
| A5 | **Judge speed on a production build** (`npm run build && npm run preview`) instead of the dev server | M2 | Read-only | Lighthouse + request counts (no StrictMode doubling) | — |

> Several workers (`--workers 3`) are **not** in Phase A. Each worker runs its own email, push and watcher loop, and
> loads YOLO separately (+318 MB each). That's step D5, after we check it's safe.

**Phase B: same output, faster (backend)**

Do these one at a time, each with the JSON diff from rule 3.

| # | Step | Finding | Files | Why it's safe | How we check it | Undo |
|---|---|---|---|---|---|---|
| B1 | Batch-load photos, comments and history in **`GET /matches/`** | H1 | `routes/matches.py` `get_matches` / `_serialize_matches` | Only *how* rows are loaded changes (`selectinload`), not *which* rows or fields. Visibility redaction still runs per item. | JSON diff for all 4 roles = 0. Queries 304 → expected a few dozen (measured, not assumed). `test_matches*`, `test_report_visibility` pass. | Revert the commit |
| B2 | Same for **`GET /claims/`** | H1 | `routes/claims.py` list | Same; `claim_visible_to()` scoping untouched | JSON diff 0 (Leader, Barangay, Admin, resident). Queries 265 → measured. `test_claims_scope`, `test_case_claims` pass. | Revert |
| B3 | Same for **`GET /rescue-requests/`** | H1 | `routes/rescue.py` `get_rescue_requests` / `_populate_rescue_fields` | Same; staff-only access untouched | JSON diff 0. `test_case_gating`, `test_owner_return` pass. | Revert |
| B4 | **One `GET /sidebar/counts` endpoint per role** returning only the badge numbers. Sidebars switch to it; the old list endpoints stay. | H2 | new route; `BrgySidebar.tsx`, `SubdSidebar.tsx` | Counts use the **same scoping** as each list; nothing is removed | For each role and badge, the new count equals what the old code computed from the full list (automated test). Probe: `/claims/` no longer polled by sidebars. | Point the sidebars back at the old calls |

**Phase C: same look, lighter (frontend)**

| # | Step | Finding | Files | Why it's safe | How we check it | Undo |
|---|---|---|---|---|---|---|
| C1 | **Replace the 30 MB and 7 MB GIFs** with a short muted looping video (or small animated WebP) at display size. Remove the duplicate copy in `public/assets/`. | C3 | `StraySafeLoading.tsx`, `AiImageVerificationBadge.tsx`, `src/assets`, `public/assets` | Same component, same props, same places. Only the file changes. | Visual check of every loading screen and the AI badge. `dist/` size 80 MB → measured. Build passes. | Put the GIF back |
| C2 | **Thumbnails + lazy loading** for list and card images: a helper that adds Cloudinary resizing to the URL (`/upload/f_auto,q_auto,w_400/…`), plus `loading="lazy"` | H6 | small util + list/card components | URL change only; stored data untouched. **Never** used for AI, evidence, lightboxes or downloads (those keep the original). | Network tab: list photos KB → measured. Lightbox still opens the full photo. | Remove the helper call |
| C3 | **Cache map marker icons** (same icon for the same inputs) and memoize marker event handlers | M1 | `MapComponent.tsx` | Same icons and behaviour; just not rebuilt every render | Every marker type looks the same (resident, leader, Barangay, admin maps). React Profiler shows fewer marker updates. | Revert |
| C4 | Small ones: **Subdivision sidebar** (same coalescing and visible-only refresh as the Barangay sidebar, finishing M7); **address look-up cache** per rounded coordinate (M6); **128 px logo** (L2) | M7, M6, L2 | `SubdSidebar.tsx`, `PetMatchReview.tsx`, `utils/sighting.ts`, `public/` | Same results; fewer repeated calls | Probe and a visual check | Revert |
| C5 | **Rebuild the Android app** (`npm run build` → `npx cap sync android`) after C1, and point it at a stable API address | M3 | build only | Packaging only | APK size; app opens and logs in | Previous APK |

> **C1 needs one tool:** converting a GIF to video needs a converter such as `ffmpeg`, which isn't installed here.
> Either I install it (your approval needed: it's a new tool, not an app dependency), or you convert the two files with
> any converter and I wire them in.

**Phase D: needs your decision first (behaviour or timing changes)**

| # | Step | Finding | The decision needed |
|---|---|---|---|
| D1 | Barangay dashboard: refresh counters every 30 s, the big lists less often | H5 | How fresh the dashboard lists must be (e.g. 2–5 min) |
| D2 | `?view=summary` for maps, feed and search (lighter `/reports/`) | H4 | OK to switch those pages one by one |
| D3 | Run 2–4 Gemini look-alike comparisons at once **inside the AI worker** (only after A2) | M4 | Gemini cost and rate limits |
| D4 | Upload-time AI checks: run per-photo Gemini checks in parallel, or move the authenticity check to the worker | C2 | Whether the "AI-generated" warning may appear a little later |
| D5 | `--workers 2–3` for deployment, with the background loops kept in one place | H3 | Memory budget (YOLO per worker) |
| D6 | The four missing indexes | M5 | It's a **schema change** (`ensure_*` migration + `Database3.3.txt`) |

### 15.4 Expected effect (to be proven by measurement, not promised)

| After | What should improve | The measurement that proves it |
|---|---|---|
| A2/A4 | No more slowdowns while a report's AI scan runs; no killed background jobs | `bench.py` during an AI job; `locked_by` |
| B1–B3 | The heaviest lists load in a fraction of the time, and under load other users aren't slowed | `qcount.py`; `contention.py` (was 3 s each / small request 86 ms) |
| B4 | The sidebars stop downloading whole lists every 15 s | `poll_probe.mjs` |
| C1 | First loading screens and the AI badge appear quickly on phones; the APK shrinks | `dist/` size, Lighthouse "Slow 4G" |
| C2–C4 | Lighter pages with photos and maps; fewer repeated calls | Network tab, React Profiler |

### 15.5 When to stop and ask
- Any JSON diff isn't zero.
- Any test fails.
- A page looks or behaves differently.
- A measurement gets worse.

I revert that one step and report what happened instead of pressing on.

---

*Nothing in sections 3–15 is implemented yet, apart from the items listed in 15.1. I'm waiting for your approval
before each step.*
