# Live GPS Rescue Responder Tracking

**Goal:** while an assigned responder travels to a reported animal, or carries it to the holding facility, the
people allowed to follow that case see a **moving responder marker** on their map. Those people are the resident who
reported it, the Subdivision Leader, and Barangay personnel once the case is escalated. The marker shows position,
destination, heading, last update and progress, updates without reloading, and stops on its own when the trip ends.

Status: **plan only.** No code, schema, dependency or workflow has been changed. Section 14 lists the decisions I need
from you.

---

## 1. Existing system audit and reusable parts

| Area | What exists today | Reuse |
|---|---|---|
| **Barangay dispatch** | `rescues` (one per report: `staff_id`, `leader_id`, `status_id`, `started_at`, `completed_at`) and `rescue_assignments` (team members, `assignment_status` = Assigned / In Transit / On Site / Completed / Cancelled) | Defines **who the responders are** for an escalated case |
| **Rescue statuses** | `rescue_status`: 1 Pending Assignment, 2 Rescuer Assigned, **3 En Route, 4 On Site, 5 Animal Secured**, 6 Failed / Cancelled | Shown read-only next to the trip progress; never changed by tracking |
| **Report statuses** | 4 Escalated, 13 Approved, 5 Rescue In Progress, 6 Picked Up, 7 Under Observation, 8 Impounded, then closed (9–12, 14, 17, 18) | Used to **end** tracking automatically when the case closes |
| **Subdivision-level handling** | No `rescues` row. The Subdivision Leader who **claimed** the report (`reports.assigned_leader_id`) handles it in person | The responder for a Subdivision case is the claiming leader |
| **Destinations** | Incident: `reports.latitude/longitude` (+ `landmark`). Holding facility: `reports.facility_id` → `landmarks` (`is_holding_facility`, coordinates) | The two trip destinations |
| **Responder-side GPS** | `frontend/src/utils/liveNavigation.ts` `useLiveRoute()`: `watchPosition` (high accuracy, `maximumAge` 5 s), re-routes after 25 m or 5 m + 15 s, "arrived" within 30 m, OSRM routing; `MapComponent` already draws a live blue position marker (`routing.live`) | Reused **as is** on the responder's phone: tracking only *also sends* the positions it already gets |
| **Maps** | One shared `MapComponent.tsx` (Leaflet + OpenStreetMap), used by the Subdivision, Barangay, Admin and resident pages | One new optional layer on the same component |
| **Who may see a case** | `routes/chat.py` `check_user_report_chat_access()` / `can_user_interact_with_report_chat()`; Barangay gate `is_report_escalated_to_barangay()`; resident rules in `utils/report_visibility.py` | **The same access rules** decide who may see the responder (section 3) |
| **Real-time** | No WebSocket or SSE anywhere. Every page uses polling, now visible-tab-only (`whenVisible`, shared pollers) | Same pattern for tracking (section 6) |
| **Notifications** | In-app notifications + Web Push (`push_service`, outbox, privacy re-check before sending) | "Your responder is on the way / has arrived" |
| **Android (Capacitor)** | `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` declared. **No** `ACCESS_BACKGROUND_LOCATION`, no foreground service, no native geolocation plugin. The WebView uses the browser's `navigator.geolocation` | Foreground tracking works with what's there; background tracking does **not** (section 9.4) |

**Nothing needs to change in the rescue workflow.** Tracking is a separate, optional layer: it reads statuses and
assignments but never sets them.

---

## 2. Proposed workflow

### 2.1 Barangay dispatch (escalated case)
1. The case is escalated (4) and approved (13), and the head officer assigns the team. This is the existing flow,
   unchanged.
2. An **assigned team member** opens the case on their phone and presses **"Start live tracking"**. A clear consent
   screen shows first (section 8.1). Nothing is shared before that press.
3. The phone sends its position every few seconds (section 6.2). The session's phase is **En Route**, destination
   = the incident.
4. Within 30 m of the incident, the phone **suggests** "Mark as Arrived". The responder confirms, and the phase
   becomes **Arrived at Location**.
5. After pickup, the responder taps **"Animal Secured"**. If they're taking it to the holding facility they tap
   **"Start transport"**, and the phase becomes **Transporting to Facility**, destination = the facility.
6. On arrival at the facility, or when the responder taps **Stop**, the session **ends**. It also ends by itself
   when the case closes, the assignment is cancelled, or the session times out (section 4).

### 2.2 Subdivision-level case
The same steps, but the responder is the **Subdivision Leader who claimed the report**, and there's no Barangay
team. Barangay staff **can't** see it unless and until it's officially escalated.

### 2.3 Watchers
The reporter, the Subdivision Leader, authorized Barangay personnel and Admins see the moving marker on the
report's map, together with the phase, destination, last update time and a GPS-quality indicator. The marker moves
without reloading the page.

---

## 3. Roles and GPS visibility

**Rule:** you can see a responder's live location only if you can already see that case's coordination chat. It's the
same rule, reused in one place (`tracking_visible_to(user, report)`). Nobody gets new access through tracking.

| Who | Subdivision-level case | Escalated Barangay case |
|---|---|---|
| **The reporter** (resident who filed it) | ✅ their own case only | ✅ their own case only |
| **Other residents** (neighbours, the public, a pet owner with only an AI match) | ❌ never | ❌ never |
| **Owner of the pet confirmed for the case** | ❓ decision D3 (default: no) | ❓ D3 |
| **Subdivision Leader** of that subdivision | ✅ | ✅ (read-only) |
| **Barangay staff** | ❌ **not before escalation** (`is_report_escalated_to_barangay`) | ✅ head officer of that barangay, and the assigned team |
| **Admin** | ✅ (oversight) | ✅ |
| **Who may start sharing** | The leader who claimed the report | A member of the rescue's assigned team (`rescue_assignments`, not Cancelled), or the rescue's `staff_id` |

The **residents who can see a case** are exactly those the report-visibility rules already allow. A Public report
does **not** let other residents follow the responder: live location is limited to the reporter.

---

## 4. Tracking session lifecycle

```
             (responder presses Start, after consent)
 none ───────────────────────────────▶ ACTIVE: phase = en_route
                                          │  ├─ near the incident (≤30 m) → suggest "Arrived"
                                          │  ├─ arrived → phase = arrived
                                          │  ├─ "Animal Secured" → phase = secured
                                          │  └─ "Start transport" → phase = transporting (destination = facility)
                                          │
                  pause (responder) ◀────┤────▶ resume
                                          │
       ENDED ◀── any of: responder taps Stop · arrived at facility (≤30 m, confirmed) · case closed
                 (3, 9–12, 14, 17, 18) · assignment Cancelled / Completed · rescue Failed (6) ·
                 no update for 30 min (stale) · 3 h hard limit · responder signs out
```

- **One active session per report.** A second responder joining starts their own session (decision D2).
- **The phase is tracking-only.** It's shown alongside the official rescue status but **doesn't change** report,
  rescue or assignment statuses. Optionally (decision D1) the same buttons could also call the *existing* status
  endpoints, only where those transitions are already allowed for that person today.
- **Ending is automatic and server-side.** Every read and write checks the case status. A closed case ends the
  session even if the phone is still sending, and later positions are refused.

---

## 5. Frontend, backend and database requirements

### 5.1 Database (new tables only; existing tables untouched)
**`rescue_tracking_sessions`**
- `session_id`
- `report_id` (FK), `rescue_id` (FK, nullable: null for Subdivision cases)
- `responder_id` (FK users)
- `phase` (`en_route` / `arrived` / `secured` / `transporting`)
- `destination_type` (`incident` / `facility`), `destination_landmark_id`
- `status` (`active` / `paused` / `ended`), `end_reason`
- `started_at`, `ended_at`, `last_update_at`
- **latest position:** `last_lat`, `last_lng`, `last_accuracy_m`, `last_heading`, `last_speed_mps`

**`rescue_tracking_points`** (optional breadcrumb trail, decision D4)
- `point_id`, `session_id`, `lat`, `lng`, `accuracy_m`, `recorded_at`
- **Kept for a limited time only** (e.g. deleted 7 days after the session ends), never longer than needed.

> The tables are added with an `ensure_*` migration and `Database3.3.txt`, **only after your approval** (you asked for
> no schema changes in this step).

### 5.2 Backend (new `routes/tracking.py`; no existing route changes)
| Endpoint | Who | What |
|---|---|---|
| `POST /tracking/reports/{report_id}/start` | an eligible responder (section 3) | Opens a session after the case checks (escalated + approved for Barangay; claimed for Subdivision; not closed) |
| `POST /tracking/sessions/{id}/location` | that responder only | `{lat, lng, accuracy, heading, speed, recorded_at}`; validated (section 9.2); updates the latest position (+ trail) |
| `POST /tracking/sessions/{id}/phase` | that responder only | Arrived, Secured or Transporting (switches the destination to the facility) |
| `POST /tracking/sessions/{id}/pause` · `/resume` · `/stop` | that responder | Lifecycle |
| `GET /tracking/reports/{report_id}` | watchers (section 3) | Active session(s): position, accuracy, heading, phase, destination, `last_update_at`, freshness state, responder **display name + role** (no phone, email or photo) |

- A small background sweep (in the existing lifespan, like the email and push workers) ends stale or overdue sessions
  and sessions of closed cases.
- **Rate limit:** at most 1 location write every 2 s per session (slowapi is already used).

### 5.3 Frontend
- **Responder (Subdivision `SubdViewReport`, Barangay `BrgyReportView` / rescue pages):** a "Start live tracking"
  button (only shown to eligible responders), the consent sheet, phase buttons (Arrived / Animal Secured / Start
  transport / Stop), a GPS-quality indicator, and a "Keep this screen open" banner. It reuses `useLiveRoute`: when a
  new position arrives, the page also sends it (section 6.2).
- **Watchers (resident `ResiViewReport`; Subdivision, Barangay and Admin report views):** a responder layer on the
  existing `MapComponent` (section 7), plus a small status card.
- **New files:** `utils/liveTracking.ts` (sending queue, polling, freshness) and `components/ResponderTrackingCard.tsx`.

---

## 6. Real-time communication

### 6.1 Options compared

| | WebSockets | Server-Sent Events | **Controlled polling** (recommended) |
|---|---|---|---|
| Latency | best (~instant) | ~instant | 3–5 s |
| Fits the current stack | needs new connection handling. With more than one server worker, updates must be shared between workers (e.g. Redis), which isn't there | same worker-sharing problem; long-open connections per watcher | **yes**: plain HTTP, the same auth, the same visible-only polling pattern already used everywhere |
| Phones on mobile data and Capacitor | sockets drop on network change and need reconnect logic | similar | **survives** network changes and sleeps naturally |
| New dependencies | possibly | possibly (`sse-starlette`) | **none** |
| Server load at this size (tens of watchers) | low | low | low: 1 small cached read per watcher per 4 s |

**Recommendation:** controlled polling now, behind a small client interface (`subscribeTracking(reportId, cb)`).
It can be switched to SSE or WebSocket later without touching the pages, if you deploy with Redis or need sub-second
updates.

### 6.2 Rates (balanced for battery and data)
- **Responder sends** when it moved ≥10 m, **or** 15 s passed, **or** the phase changed; at most every 2 s; at most
  every 30 s when standing still. Each payload is ~150 bytes, so a 20-minute trip is under ~50 KB.
- **Watchers poll** every **4 s** while the tab is visible and a session is active. With no active session it's
  every 30 s (to notice a start), and nothing while hidden. An ended session stops the polling.
- **Offline queue:** positions taken while offline are kept (latest 20) and sent in one batch when the connection
  returns. The server keeps only those newer than its last stored point.

---

## 7. Map marker and UI

- **Responder marker:** a distinct icon (a rescue vehicle or person, in the portal's role colour) with a **heading
  arrow** when the phone reports a heading. It **glides** between updates (short animation), never teleports.
- **Accuracy circle:** a faint circle with the reported accuracy radius. It's hidden when accuracy is better than
  15 m.
- **Destination:** the incident pin (existing) or the holding facility pin, plus a dashed line from responder to
  destination. That's a straight line for watchers, so their phones don't call OSRM. The responder keeps the full
  road route.
- **Status card:**
  - phase chip: **En Route**, **Arrived at Location**, **Animal Secured**, **Transporting to Facility**;
  - the official rescue status next to it, read-only;
  - "Updated 12 s ago";
  - distance left (straight line, labelled "about");
  - the responder's display name and role.
- **Freshness states**, shown as a coloured dot and text:

  | State | When | Shows |
  |---|---|---|
  | **Live** | update ≤ 30 s ago | green |
  | **Delayed** | 30 s – 2 min | amber "Last seen 1 min ago" |
  | **Signal lost** | 2 – 30 min | grey marker, "GPS signal lost: last seen 08:42" |
  | **Paused** | the responder paused | grey, "Location sharing paused by responder" |
  | **Unavailable** | permission denied / no GPS | "Responder's location isn't available" |
  | **Ended** | session ended | the marker disappears; "Tracking ended: Arrived at facility 08:55" |

- **Doesn't disturb existing maps:**
  - The layer is optional (`tracking={…}` prop) and pages without it render exactly as now.
  - The map doesn't re-centre on every update (only on the first fix, or when the user taps "Follow").
  - Marker icons are cached (audit item M1), so updates don't rebuild other markers.

---

## 8. Security, privacy and authorization

1. **Explicit opt-in.** Sharing starts only when the responder presses Start, after a consent sheet: *"Your live
   location will be visible to the reporter and the officials handling this case until you stop or the rescue ends."*
   It's never automatic, and never continuous in the background without that press.
2. **Every read is checked on the server** with `tracking_visible_to()` (section 3), and every write with "is this
   your active session and is the case still open". A non-allowed request gets **404** (it doesn't reveal that a
   session exists).
3. **Only during the trip.** Positions are served only while the session is active. After it ends, watchers get "ended"
   and **no coordinates**. The trail (if kept) is **staff-only** and deleted after the retention period (D4).
4. **No personal details** in tracking responses: the responder's display name and role only, no phone, email or
   photo. The reporter's own home address is never in tracking data.
5. **Escalation gate:** Barangay staff get nothing for a Subdivision-only case, the same as the chat rule.
6. **Push notifications** ("Your responder is on the way") use the existing push privacy re-check and contain no
   coordinates.
7. **Audit log** (existing `audit_logs`): session start, stop and who viewed it (one entry per viewer per session, not
   per poll).

---

## 9. Offline devices, inaccurate GPS and interruptions

### 9.1 Connectivity
- The phone keeps sending when it can and queues while offline (section 6.2).
- Watchers see Delayed or Signal lost honestly, with the last known position and time. Positions are never guessed
  or extrapolated.

### 9.2 Bad GPS
The server **rejects** a point (and keeps the previous one) if:
- the accuracy is worse than **100 m**;
- the implied speed from the last point is over **150 km/h** (a jump);
- the timestamp is more than 2 minutes in the future, or older than the last stored point;
- the coordinates aren't valid, or are far outside the service area (reuse the existing coverage check, with a
  margin).

Watchers see an accuracy circle so a weak fix looks uncertain, not precise.

### 9.3 Interruptions
- **Phone screen off / browser in background:** most browsers **stop GPS updates** when the page isn't visible.
  Mitigations:
  - request a **Screen Wake Lock** while sharing (the browser API; no dependency);
  - show "Keep StraySafe open while sharing";
  - on returning to the page, sharing resumes on its own and sends a fresh fix.
- **Responder closes the tab:** the session goes stale after 2 min (Signal lost) and ends automatically after
  30 min.

### 9.4 Android app (Capacitor): verified limits
- **What works now:** while the StraySafe app is **open and in the foreground**, `navigator.geolocation` in the
  WebView works with the already-declared `ACCESS_FINE_LOCATION`. This is the same as the browser.
- **What does NOT work now:** tracking with the app **in the background or the screen locked**. Android throttles or
  stops a WebView's location, and the app has **no foreground service** and **no `ACCESS_BACKGROUND_LOCATION`**.
  We must **not** assume background tracking works.
- **Making background work would need (decision D5):**
  - a native background-geolocation plugin (a new dependency);
  - a **foreground service** with an ongoing notification ("StraySafe is sharing your location");
  - the `FOREGROUND_SERVICE_LOCATION` permission (Android 14+);
  - possibly `ACCESS_BACKGROUND_LOCATION` with a Google Play policy declaration;
  - and a real device test.

  Recommended only after the foreground version proves useful.

---

## 10. Performance and scalability

- **Writes:** one small UPDATE per location (latest position) + one INSERT if the trail is kept. That's a few per
  second even with several active rescues.
- **Reads:**
  - `GET /tracking/reports/{id}` reads one row (indexed by `report_id`, `status`). The access check is cached per
    viewer for 60 s.
  - That's ~1 ms of database work, so 50 watchers polling every 4 s is about 12 small requests per second.
  - The browser never polls while the tab is hidden.
- **No OSRM for watchers** (straight line only), so the free routing service isn't hit by every viewer.
- **Battery:**
  - high accuracy only while a session is active;
  - sending is skipped while standing still;
  - the Wake Lock is released when sharing stops.
- **Fits the audit work:** separate small endpoint, visible-only polling, cached icons, nothing added to the heavy
  list endpoints.

---

## 11. Implementation phases (after approval)

| Phase | Content | Done when |
|---|---|---|
| **T1** | Tables + migration + `Database3.3.txt` (after your OK); model; `tracking_visible_to()` reusing the chat and visibility rules | Unit tests for every role and case type pass |
| **T2** | Endpoints: start, location, phase, pause/resume/stop, watch; validation (section 9.2); rate limit; auto-end sweep | API tests (section 12) pass |
| **T3** | Responder UI: consent, start/stop, phase buttons, GPS-quality indicator, wake lock, offline queue, reusing `useLiveRoute` | Works on a phone in Chrome (https or `localhost`) |
| **T4** | Watcher UI: responder layer in `MapComponent`, status card, freshness states, polling via `subscribeTracking` | Watcher sees the marker move; existing maps unchanged |
| **T5** | Notifications: "responder on the way / arrived / animal secured" to the reporter (existing push + in-app) | Pushes arrive; no coordinates inside |
| **T6** (optional, D5) | Android background tracking (native plugin + foreground service) | Verified on a real device |

---

## 12. Test scenarios and acceptance criteria

**Automated tests (throwaway SQLite, like the existing ones):**

| # | Scenario | Expected |
|---|---|---|
| 1 | An unassigned staff member, or a resident, tries to start | 403 |
| 2 | Barangay staff watch a Subdivision-only case | 404, no coordinates |
| 3 | The same case after escalation | Head officer and assigned team can watch |
| 4 | The reporter watches their own case | Position, phase, freshness |
| 5 | Another resident (also: the report is Public) | 404 |
| 6 | Someone else posts a location to the session | 403 |
| 7 | Point with 300 m accuracy / a 500 km/h jump / a future timestamp | Rejected; previous point kept |
| 8 | Case closed while a session is active | Session ends; further positions 409; watchers get "ended" and no coordinates |
| 9 | Assignment cancelled | The session ends |
| 10 | No updates for 30 min | Auto-ended (stale) |
| 11 | Pause | Watchers see "Paused" with no new positions |
| 12 | Start transport | Destination switches to the holding facility |
| 13 | Offline batch of 10 points | Accepted in order; older-than-last ignored |
| 14 | Watch response | Contains no phone, email or photo |
| 15 | Tracking actions | Never change report, rescue or assignment statuses (unless D1 is approved) |

**Manual:**
1. Two phones (responder + reporter) walk a short route. The marker moves within ~5 s, the heading arrow turns, and
   "Arrived" is suggested near the pin.
2. Airplane mode on the responder for 1 minute: watchers go Delayed, then Signal lost. Back online, the marker
   jumps to the fresh position and the queued points are sent.
3. Lock the responder's screen: watchers see Signal lost, and the app shows the "keep open" note. (This documents the
   foreground-only limit.)
4. Existing maps without tracking look and behave exactly as before.

**Acceptance:**
- Only allowed people ever receive coordinates.
- Tracking never starts without the responder's press, and always ends with the trip or case.
- Watchers see updates within ~5 s with an honest freshness state.
- No existing workflow, status rule or map changes.
- The full test suite, `tsc` and build pass.

---

## 13. Risks and solutions

| Risk | Solution |
|---|---|
| Browser stops GPS when the screen locks | Wake Lock, "keep open" note, honest "Signal lost"; native background only via D5 |
| GPS drift or jumps make the marker jump | Server-side accuracy and speed filters; accuracy circle; smooth animation |
| Privacy: tracking left on by mistake | Auto-end on case close, assignment end, arrival, 30-min stale and 3-hour limit; Stop always visible; trail deleted after retention |
| Location visible to the wrong people | One shared access rule (chat + visibility), 404 for others, tests for every role |
| Battery and data drain | Distance/time thresholds, no sending while still, high accuracy only during a session, ~50 KB per trip |
| Several workers later (deployment) | Polling reads from the database, so any worker can answer; WS/SSE would need Redis (deferred) |
| OSRM rate limits | Watchers never route; only the responder's existing navigation does |
| Android Play policy for background location | Foreground-only first; background only with D5 and its declaration |
| Confusing tracking phase vs official status | Show both, labelled ("Trip: En Route · Rescue status: Rescuer Assigned"), unless D1 links them |

---

## 14. Decisions I need from you

| # | Decision | My recommendation |
|---|---|---|
| **D1** | Should the tracking buttons (Arrived, Animal Secured) also update the **official** rescue / assignment status (via the existing endpoints, only where already allowed)? | **No at first**: keep tracking separate; revisit after testing |
| **D2** | More than one teammate sharing at once on the same case? | **Yes**: each sharing responder is their own marker (max 3) |
| **D3** | Can the **owner of the confirmed pet** also watch? | **No** (only the reporter, as you specified) |
| **D4** | Keep a breadcrumb trail? How long? | **Yes, staff-only, deleted 7 days after the trip** |
| **D5** | Android background tracking (native plugin + foreground service, new dependency, Play declaration)? | **Later**, after foreground tracking is tested |
| **D6** | The two new tables (schema change) | Needed for the feature; approve when you approve coding |
| **D7** | Session limits: stale 30 min, maximum 3 h | **Yes** (adjustable in `.env`) |

*Nothing above has been implemented. I'm waiting for your approval and answers to D1–D7.*
