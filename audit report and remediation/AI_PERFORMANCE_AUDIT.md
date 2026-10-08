# StraySafe 2.0: AI Performance Audit

**Question:** why does the whole system slow down while AI analysis runs?
**Scope:** YOLOv8, Gemini, OpenCV and Pillow processing, registered-pet matching, duplicate detection, video, the database queries AI triggers, frontend polling, and the FastAPI endpoints that run AI.
**Status:** audit complete. **Both P0 fixes are now done** (see the update below). P1 and P2 are still open.

> **Update, P0 done:**
> - `analyze-media` and `validate-images` are now plain `def`, so they run in a worker thread.
> - The upload in `upload_report_media` uses `run_in_threadpool`.
> - The startup backfill runs in `asyncio.to_thread`.
> - Gemini has a 20 s per-call limit and a 35 s total limit (`GEMINI_TIMEOUT_SECONDS`, `GEMINI_TOTAL_BUDGET_SECONDS`).
>
> - **RC1 done for every endpoint:** the remaining `async def` uploads now run their blocking calls with `await run_in_threadpool(...)`. That covers pet photos (front/left/right, plus the YOLO color step), the vaccine card, profile pictures, announcement media, adoption home-visit and monitoring photos, and the government ID watermark and upload.
> - Gemini model order fixed: `gemini-2.5-flash` first. A model that times out now falls back to the next one (`gemini-flash-latest` had stopped answering).
>
> Re-measured with the same harness:
> - An unrelated request during video + Gemini analysis: **max 33 ms** (was 4,455 ms).
> - Two users analyzing at once: **4.2 s each** (was 4.6 s and 9.0 s).
> - `validate-images`: other requests **max 34 ms** (was 4,254 ms).
**Environment measured:** Windows 11, 12 logical cores, 15.7 GB RAM, Python 3.12, torch 2.12 (CPU), YOLOv8n, uvicorn `--reload` (one worker process, as in `setup.md`).

---

## 1. Root cause (summary)

> **Heavy AI work runs directly on FastAPI's single event loop.** Several endpoints are declared `async def` but call **blocking** code (YOLOv8 inference, Gemini over gRPC, Cloudinary/R2 uploads, image downloads). While such a call runs, the event loop can't handle **any other request**. Every page, every user, and even `/docs` waits until the AI call returns.

This was observed live on the running server during this audit (section 3.3). One photo analysis was stuck in a Gemini call with no timeout, and the entire API stopped responding for over 15 minutes.

The other causes make it worse, but they are not the main cause:

| # | Cause | Effect | Status |
|---|---|---|---|
| RC1 | `async def` endpoints call blocking YOLO, Gemini and uploads | **Whole server freezes** for the full duration of every AI call | ✅ **Done.** The 3 report endpoints became plain `def` (run in a worker thread), and the other 11 blocking upload/YOLO/ID calls use `run_in_threadpool`. Re-measured: unrelated requests max 33 ms during AI (was 4,455 ms). |
| RC2 | Gemini calls have **no timeout**, plus up to 3 sequential model fallbacks | A slow or hung Gemini call freezes the server for minutes (up to about 10 min per attempt) | ✅ **Done.** 15 s per model and 35 s total (`GEMINI_TIMEOUT_SECONDS`, `GEMINI_TOTAL_BUDGET_SECONDS`). A timeout falls back to the next model. Working model first (`gemini-2.5-flash`). Every Gemini call in the code goes through this wrapper. |
| RC3 | The startup AI backfill is `async def` and calls Gemini synchronously for up to 100 reports | The server freezes about 20 s after **every start and every `--reload`** | ✅ **Done.** The backfill runs in `asyncio.to_thread`. |
| RC4 | The same photo is analyzed repeatedly, and matching scans repeat with up to 20 Gemini Vision calls each | One report can cause **about 47 Gemini calls** plus repeated YOLO and downloads | ✅ **Done** (`app/utils/ai_pipeline.py`). (1) The form's YOLO + authenticity results are reused when the identical file is uploaded (SHA-256 key, server-side, 2 h). (2) Gemini suggestions + the matching scan run **once per report**, after its last photo, instead of at creation and after every photo. (3) Each image is downloaded once per scan. Worst case for a 2-photo report: about 47 → **about 24** Gemini calls (26 if the uploaded file differs from the one analyzed in the form), YOLO 4 → 2, image downloads about 120 → about 21. |
| RC5 | Opening a report runs a Gemini backfill **inside a GET** | A page view can take seconds | ✅ **Done.** `GET /reports/{id}` no longer calls Gemini. Missing suggestions are filled in by a background job (`ai_pipeline.schedule_suggestions_backfill`), at most one per report at a time. Tested: with Gemini taking 2 s, the page still answers right away, and opening it 3 times starts only 1 Gemini call. |
| RC6 | Sidebars poll the **full reports list every 4 s** to show a count (612 SQL queries, 1.7 MB per call) | A constant background load that competes with AI work | ✅ **Done.** New `GET /reports/sidebar-ids` (ids only, 1 query, staff only, leaders limited to their subdivision). Sidebars poll every **15 s**, only while the tab is visible, plus instantly when something is viewed. The list's 2 N+1 queries are fixed with batch loading. Re-measured with 300 reports: badge refresh **1–2 ms, 1 query, 0.4 KB** (was 364–921 ms, 612 queries, 1.7 MB); full list **16 queries, ~210 ms** (was 612). |

---

## 2. AI processing flow, as it exists today

```
Citizen picks a photo/video in the report form
  └─ POST /reports/analyze-media      async def  ← YOLOv8 + Gemini (forensic + attributes) + OpenCV/Pillow colours   [BLOCKS LOOP]
  └─ POST /reports/validate-images    async def  ← YOLOv8 per photo + Gemini                                           [BLOCKS LOOP]
Citizen submits
  └─ POST /reports/                   def        ← Gemini text suggestions (generate_ai_suggestions) inside the request  [slow submit]
        └─ BackgroundTasks: run_matching_in_background → full look-alike + duplicate scan
  └─ POST /reports/{id}/media         async def  ← Cloudinary/R2 upload (blocking)                                        [BLOCKS LOOP]
        └─ BackgroundTasks: process_report_media_ai (per photo)
              YOLOv8 again → colours → Gemini photo check → Gemini suggestions again → full matching scan again
Staff opens the report
  └─ GET /reports/{id}                def        ← Gemini backfill if ai_suggested_risk_level is empty                    [slow read]
  └─ POST /matches/scan/{id}          def        ← full scan inside the request (up to 10 + 10 Gemini Vision calls)
Server start / every --reload
  └─ backfill_ai_suggestions_background   async  ← Gemini for up to 100 reports on the event loop                         [BLOCKS LOOP]
```

---

## 3. Performance measurements

### 3.1 Method

- A separate test copy of the API on port 8011 with a throwaway SQLite database and the **real YOLOv8n model**. Your live server and data were not used.
- **Gemini was simulated with a 4-second blocking wait**, the same kind of blocking network call the real library makes. No API quota was used.
- An unrelated endpoint, `/ping`, was called every 50 ms while one AI request ran, to see whether other users are blocked.
- Process CPU and RAM were sampled with `psutil` every 250 ms. On this machine 100% means one full core, and the machine has 12.

### 3.2 Results

**Normal system (no AI running)**

| Metric | Value |
|---|---|
| `/ping` (plain `def`) | median **12 ms**, p95 29 ms, max 48 ms |
| `/ping-async` | median 14 ms, p95 30 ms |
| Process CPU | about 16% |
| Process RAM | **122 MB** |

**YOLOv8 model**

| Metric | Value |
|---|---|
| First load (`yolov8n.pt`) | **12.4 s** (only once per process) |
| RAM after load | **398 MB** (+276 MB) |
| Warm inference, 1600×1200 photo | median **255 ms** |
| `get_yolo_model()` after the first call | 0.004 ms. The singleton cache **works**: the model is **not** reloaded per request |

**While AI is analyzing**

| Scenario | AI request time | `/ping` during AI (normally 12 ms) | Process CPU | Peak RAM |
|---|---|---|---|---|
| Photo, YOLO only (Gemini off) | 444 ms | max **377 ms** | avg 93%, peak 212% | 499 MB |
| Photo, YOLO + Gemini (4 s) | 4,392 ms | max **4,351 ms**, i.e. *blocked for the whole call* | avg 22%, peak 256% | 508 MB |
| Video (8 frames), YOLO only | 612 ms | **613 ms** | avg 321%, **peak 744%** | 505 MB |
| Video + Gemini (4 s) | 4,498 ms | max **4,455 ms** | avg 112%, peak 731% | 507 MB |
| **Two users analyze at the same time** (Gemini 4 s) | **4,577 ms and 9,013 ms** (second waits for the first) | max **4,452 ms** | | |
| `validate-images`, 3 photos (Gemini 4 s) | 4,519 ms | max **4,254 ms** | | |

**Reading the table**

- During a Gemini call, CPU is low (22%) but other requests still wait 4+ seconds. The server isn't busy, it's **blocked**: the event loop is waiting on the network.
- AI requests run **one at a time**: the second user's photo took twice as long.
- YOLO on video uses **up to 7.4 cores**, because torch uses all its threads. That competes with everything else on the machine even once it's moved off the event loop.

### 3.3 Live evidence from your running server

During this audit, the live server on port 8000 stopped answering every request, including `/openapi.json` (timeouts at 10, 15, 20 and 30 s, checked repeatedly for more than 15 minutes). Its CPU time did not increase. A `py-spy` stack dump of the worker (PID 26180) showed the **event-loop thread** stuck here:

```
MainThread
  grpc _channel._blocking                 ← waiting for Google's server
  generativeai generate_content
  call_gemini_with_fallback   (app/utils/ai_suggestions.py:59)
  analyze_report_media        (app/routes/reports.py:1648)   ← async def endpoint
  asyncio run_forever                     ← the event loop itself
```

A single photo analysis hung on Gemini and made **the whole StraySafe API unavailable for every user**. This is RC1 and RC2 together.

### 3.4 Database cost of the polled list endpoint

Measured by calling `GET /reports/` directly on a throwaway database with **300 reports**, each with 2 photos, 4 history entries and 1 comment:

| Call | Reports | Time | SQL queries | Response |
|---|---|---|---|---|
| Subdivision sidebar: `/reports/?subdivision_id=…` | 300 | **364–467 ms** | **612** | **1.7 MB** |
| Barangay sidebar: `/reports/?escalated_only=true` | 150 | 190–921 ms | 311 | 0.85 MB |

The sidebars make this call **every 4 seconds per open tab**, only to show badge counts.

---

## 4. Blocking operations found

| Location | Declared as | Blocking work | Severity |
|---|---|---|---|
| `routes/reports.py:1456` `analyze_report_media` | `async def` | YOLOv8 (`yolo_model(tmp_path)`), video frame extraction and YOLO on 8 frames, **Gemini** (`call_gemini_with_fallback`), OpenCV/Pillow colours | 🔴 Critical |
| `routes/reports.py:1860` `validate_report_images` | `async def` | YOLOv8 per photo, **Gemini** | 🔴 Critical |
| `main.py:1373` `backfill_ai_suggestions_background` | `async def` (asyncio task) | **Gemini for up to 100 reports**, plus DB queries, on the event loop | 🔴 Critical |
| `routes/reports.py:2871` `upload_report_media` | `async def` | `upload_to_cloudinary()` (blocking HTTP upload) | 🟠 High |
| `routes/pets.py:1192–1346` photo/vaccine uploads (5 endpoints) | `async def` | Blocking uploads; pet photo YOLO + colours (`pets.py:1141`) | 🟠 High |
| `routes/users.py:587`, `announcements.py:291`, `adoptions.py:1388/1426/1462/3696` | `async def` | Blocking uploads | 🟡 Medium |
| `utils/ai_suggestions.py:59` `call_gemini_with_fallback` | `def` | **No timeout**, up to 3 models tried in sequence; opens a new DB session on every call to check the Gemini on/off setting | 🔴 Critical (RC2) |
| `routes/reports.py:2099` `create_report` | `def` (thread pool) | Gemini text suggestions **before** the response is sent | 🟠 High (slow submit) |
| `routes/reports.py:2305` `get_report` | `def` | Gemini backfill **during a GET** | 🟠 High |
| `routes/matches.py:1901` `POST /matches/scan/{id}`, `:1883` `scan-all` | `def` | Full scan in the request, up to 20 Gemini Vision calls, `scan-all` loops over every report | 🟠 High |
| `BackgroundTasks` (`process_report_media_ai`, `run_matching_in_background`) | sync, in-process | Runs in the **same process and thread pool** as normal requests; no queue, no limit, no retry, lost on restart or `--reload` | 🟡 Medium |

> Why `async def` matters: FastAPI runs a plain `def` endpoint in a thread pool, so blocking code there only ties up one thread. An `async def` endpoint runs **on the event loop itself**, so any blocking call inside it stops the whole server.

---

## 5. Expensive database queries

| # | Where | Problem | Measured | Status |
|---|---|---|---|---|
| D1 | `routes/reports.py:150` `populate_merge_info` | **N+1**: queries each report's merged children separately | about 1 query per report | ✅ Done |
| D2 | `ReportResponse.disputes` (lazy relationship) | **N+1**: lazy-loaded per report during serialization, although `get_reports` already batch-loads disputes | about 1 query per report | ✅ Done |
| D3 | `GET /reports/` | No default limit; eager-loads history, history media, comments and all photos for every report | 612 queries / 1.7 MB for 300 reports | ✅ **Done.** Queries fixed (612 → 16). Default page size **500** (newest first), hard maximum **1,000** per request (`REPORTS_DEFAULT_PAGE_SIZE`, `REPORTS_MAX_PAGE_SIZE`). Responses carry `X-Total-Count`, `X-Page-Size` and `X-Has-More`. At current data sizes no screen changes. Follow-up: true page-by-page loading on the big list screens (Reports, History) if the data grows past 500. |
| D4 | `SubdSidebar.tsx:90`, `BrgySidebar.tsx:112` | Calls D3 **every 4 s** only to count items (Barangay also calls 5 more endpoints) | about 15 list calls per minute per tab | ✅ Done |
| D5 | `is_gemini_enabled_in_db()` | A new DB session for every Gemini call (dozens per report) | **Checked:** 1.6 ms per check on MySQL; about 70 checks per report (2–3 per Gemini call: caller, `compare_animals_vision`, `call_gemini_with_fallback`) ≈ **0.1 s per report**, negligible next to Gemini. **Bigger issue found:** both checks **fail open** (any DB error → Gemini treated as ON, so an Admin "OFF" can be ignored), and the logic is duplicated in `ai_suggestions.py` and `matches.py`. | ✅ **Done.** One shared check (`ai_suggestions.is_gemini_enabled_in_db`; `matches.is_gemini_vision_enabled` now calls it). Cached 5 s and cleared the moment the setting row is saved or the Admin endpoint commits, so a switch is immediate. **Fails closed:** if the setting can't be read, Gemini is OFF and the local YOLO / rule-based results are used. Tested (`test_gemini_setting.py`): 100 checks → 0 queries; instant ON/OFF; DB error → OFF. |
| D6 | `get_reports` endpoint | Has **no authentication dependency** (security note found while auditing) | n/a | ✅ **Done.** `GET /reports/` and `GET /reports/{id}` now require sign-in. The registered pet owner's phone, email, home address and QR token are only sent to staff and to that owner; other residents still see the report and the owner's name (`redact_owner_contact`). Before, anyone could read them without signing in. Tested in `test_report_privacy.py` (8/8). |

---

## 6. Duplicate and unnecessary AI processing

For **one report with 2 photos**, the current flow can run:

| Step | YOLO | Gemini calls | Image downloads |
|---|---|---|---|
| `analyze-media` while filling in the form (per photo) | 2 | 2 | 0 |
| `create_report` text suggestions | 0 | 1 | 0 |
| Matching scan after create | 0 | 0–20 (if a photo exists) | up to 40 |
| `process_report_media_ai` per uploaded photo: YOLO, photo check, suggestions | **2 again** | **4** | 0–2 |
| Matching scan **again after each photo** (`trigger_looks_matching`) | 0 | **up to 40** | **up to 80** |
| **Total, worst case** | **4** | **about 47** | **about 120** |

Specific findings:

- **The same photo is analyzed twice:** once by `analyze-media` before submit, then again by `process_report_media_ai` after upload. The first result is not reused.
- **The full matching scan runs once per photo** instead of once per report.
- **No image cache:** in a scan, `fetch_image_for_entity()` downloads the **sighting photo again for every candidate** (up to 10 times), and downloads every candidate pet photo again on every scan (Cloudflare R2 / Cloudinary egress and latency).
- **No feature cache:** colours, YOLO boxes and Gemini attributes for a registered pet are recalculated on every scan instead of being stored once per pet photo.
- **Startup backfill on every `--reload`:** each code save restarts the server and re-runs the Gemini backfill for any report still missing suggestions.
- **No de-duplication of jobs:** two uploads, or a manual "Scan AI Matches" click, start overlapping full scans for the same report.

What is already good:

- The YOLO model is a thread-safe singleton.
- Gemini Vision is limited to the top 10 candidates per scan.
- Uploads are capped at 10 MB.
- Video analysis samples at most 8 frames.

---

## 7. Recommended architecture

Target flow:

```
User submits report ──► report saved, response in < 300 ms ──► user keeps using StraySafe
                              │
                              └─► AI job queued (report_id, media_id, type)
                                      │
                         AI worker process(es), separate from the web server
                         YOLOv8 · Gemini (with timeouts) · colours · photo check · matching (once)
                                      │
                              results saved to DB (+ notification)
                                      │
                    UI shows "AI analysis pending…" → result appears on the next refresh
```

**Step 1 (smallest change, biggest win): stop blocking the event loop.** Inside the existing code, move every blocking call in an `async def` endpoint off the loop. Either change the endpoint to plain `def`, after reading the upload with `file.file.read()`, or wrap the heavy part with `await run_in_threadpool(...)` / `asyncio.to_thread(...)`. Do the same for the startup backfill (`await asyncio.to_thread(...)`).

**Step 2: time-limit Gemini.** Pass `request_options={"timeout": 20}` to `generate_content` and cap the total fallback time at about 30 s. Fall back to the rule-based result, which already exists, when Gemini doesn't answer in time.

**Step 3: run AI as jobs, not inside requests.**
- Add a small `ai_jobs` table (`job_id, kind, report_id, media_id, status, attempts, error, created_at, finished_at`) and a **separate worker process** started next to uvicorn (`python -m app.ai_worker`). It loads YOLO once and handles jobs with limited concurrency (for example 1 YOLO job and 3 Gemini jobs at a time).
- This keeps the capstone simple: no Redis or Celery needed. Jobs survive restarts and `--reload`, can be retried, and are visible to the Admin. Celery or RQ with Redis is the production-grade upgrade later.
- Limit torch threads in the worker (`torch.set_num_threads(2)`) so YOLO can't take all 12 cores.

**Step 4: do each piece of AI work once.**
- Reuse the `analyze-media` result. Pass the client-side analysis to `create_report` (or cache it by file hash) instead of running YOLO and Gemini again after upload.
- Run **one** matching scan per report, after its last photo is saved, and skip duplicate queued scans for the same report.
- Cache downloaded images per scan, and store per-pet-photo features (colours, YOLO box, Gemini description) so later scans only compare.

**Step 5: make polling cheap.**
- Add `GET /reports/counts` (a single `COUNT … GROUP BY` query) for the sidebars, and poll every 15–30 s, or only when the tab is visible.
- Fix the two N+1 queries, and give `/reports/` a default page size.

---

## 8. Files that need modification

| File | Change |
|---|---|
| `backend/app/routes/reports.py` | `analyze_report_media`, `validate_report_images`, `upload_report_media`: don't block the loop. `create_report`: enqueue instead of inline Gemini. `get_report`: remove the Gemini backfill from GET. `process_report_media_ai`: reuse earlier results, scan once. `populate_merge_info`: batch children (N+1). |
| `backend/app/utils/ai_suggestions.py` | Gemini timeout and total time cap; cache the Gemini on/off setting for a few seconds |
| `backend/app/utils/ai_matching.py`, `backend/app/routes/matches.py` | Per-scan image cache; reuse stored pet features; `scan/{id}` and `scan-all` enqueue a job instead of scanning inside the request |
| `backend/app/utils/photo_checks.py` | Use the Gemini timeout wrapper |
| `backend/app/main.py` | Run the backfill in a thread or as a job, not on the event loop |
| `backend/app/routes/pets.py`, `users.py`, `announcements.py`, `adoptions.py` | Upload and pet-photo AI calls off the event loop |
| `backend/app/utils/model_loader.py` | `torch.set_num_threads(...)`; optional warm-up at worker start |
| **New** `backend/app/ai_jobs.py` + `app/models/ai_job.py` + `app/ai_worker.py` | Job table, enqueue helper, worker loop |
| `frontend/src/components/SubdSidebar.tsx`, `BrgySidebar.tsx` (+ new `/reports/counts`) | Cheap counts endpoint, slower polling |
| `frontend/src/pages/citizen/ReportStrayPage.tsx`, `ResiHomePage.tsx`, `components/Modals/SubdReportModal.tsx` | Show "AI analysis pending"; send or reuse the earlier analysis |
| `Database3.3.txt` | `ai_jobs` table |

---

## 9. Priority fixes

| Priority | Fix | Effort | Removes | Status |
|---|---|---|---|---|
| **P0** | Move YOLO, Gemini and uploads off the event loop in the 3 report endpoints and the startup backfill | Small (hours) | RC1, RC3: **the system-wide freeze** | ✅ Done |
| **P0** | Gemini timeout (about 20 s) and total cap, with the rule-based fallback | Small | RC2: multi-minute outages | ✅ Done |
| **P1** | Remove the Gemini backfill from `GET /reports/{id}`; the startup backfill uses a thread | Small | RC5 | ✅ Done |
| **P1** | Sidebar counts endpoint and slower polling; fix the 2 N+1 queries | Small–Medium | RC6, D1–D4 | ✅ Done |
| **P1** | One matching scan per report, plus an image cache per scan | Medium | Most of RC4 (about 47 → about 15 Gemini calls) | ✅ Done |
| **P2** | `ai_jobs` table and a separate worker process; limit torch threads | Medium | Isolation from web traffic; jobs survive `--reload` | ✅ **Done.** Requests only add rows to `ai_jobs` (`app/utils/ai_jobs.py`); the worker `python -m app.ai_worker` runs them (photo analysis, one follow-up per report, suggestions backfill). Jobs survive restarts; failures retry up to 3× with back-off; jobs stuck in `running` are re-queued; `SKIP LOCKED` lets several workers share the queue. If no worker checks in, the web server runs the queue itself as a safety net (`AI_WORKER_EMBEDDED=off` disables it). YOLO limited to 2 CPU threads (`AI_TORCH_THREADS`): 77 ms vs 57 ms per photo, ~3 cores instead of ~8. Admin view: `GET /admin/ai-jobs`. Tested with the real worker process (`test_ai_worker.py`) and the queue rules (`test_ai_pipeline.py`). |
| **P2** | Reuse the `analyze-media` result instead of re-running YOLO and Gemini after upload; store per-pet features | Medium | The remaining duplicate work | ✅ **Done.** Reuse of `analyze-media` done (RC4). For pets, the scan turned out not to recompute colours or YOLO (those come from the pet record); the repeated work was **re-downloading pet photos** and **re-asking Gemini Vision for the same pair of photos on every rescan**. Now: (1) each Gemini Vision result is stored per pair of photos in `ai_vision_comparisons` (key = both photo URLs + the descriptions sent; a changed photo or description is compared again; not reused after 60 days; not used when Gemini is OFF); (2) downloaded photos are kept as ≤1024 px JPEGs in `backend/ai_cache/images` (removed after 30 days). A rescan of a report with 10 pet candidates: 10 Gemini calls + 11 downloads → **0 Gemini calls, 0 downloads**. Tested in `test_vision_cache.py` (12/12). |
| **P3** | Migrate `google.generativeai` → `google.genai`; add authentication to `GET /reports/` | Small | Deprecated SDK; D6 | ✅ **Done.** Authentication done (D6). Gemini now goes through **`google-genai` 2.29** (`requirements.txt`: `google-genai>=1.0.0`); `google-generativeai` was removed from the venv and nothing imports it. Only `call_gemini_with_fallback` changed: same Admin ON/OFF check, model order, 15 s / 35 s time limits (enforced by the SDK's HTTP timeout, verified) and fallback on rate limit / missing model / overload / timeout; a real request error (e.g. 400) is raised instead of retried. Callers get a small `GeminiResponse` (`.text`, `.model`, `.raw`). Verified with real calls: text 2.3 s, image JSON 4.3 s, full photo authenticity check 8.5 s. |

---

## 10. Expected improvement

These are estimates based on the measurements above.

| Metric | Now | After P0 | After P0–P2 |
|---|---|---|---|
| Unrelated request while a photo is analyzed (Gemini 4 s) | **~4,350 ms** | ~15–60 ms | ~15–30 ms |
| Unrelated request while Gemini hangs | **No response (minutes)** | ~15–60 ms (AI request itself ends at the timeout) | ~15–30 ms |
| Second user analyzing at the same time | 9.0 s (waits for the first) | ~4.6 s (runs in parallel) | ~4.6 s |
| Report submit (`POST /reports/`) | Includes 1 Gemini call | Same | **< 300 ms**, AI runs as a job |
| Gemini calls per 2-photo report (worst case) | ~47 | ~47 | **~15** |
| Sidebar refresh (300 reports) | 364–921 ms, 612 queries, 1.7 MB, every 4 s | Same | **< 20 ms, 1–2 queries, < 1 KB**, every 15–30 s |
| Web server RAM | 500 MB (YOLO loaded in the web process) | 500 MB | ~120 MB web + ~500 MB worker |

The AI itself doesn't get faster: YOLO stays about 0.25 s per photo and Gemini about 2–5 s per call. The difference is that **nobody else has to wait for it**.

---

## Appendix: measurement artefacts

- The harness scripts (`perf_harness.py`, `list_cost.py`) were run from the session scratchpad and are not part of the repository. They can be added under `backend/tests/perf/` to re-measure after the fixes.
- `py-spy` was installed into the project `.venv` to inspect the stuck server; uninstall it with `.venv\Scripts\python -m pip uninstall py-spy` if you don't want it. It is a diagnostic tool, not an application dependency.
- The live database was found reset to seed data during the audit (0 reports, 0 pets, 5 users), so the database measurements use a seeded throwaway database instead.
