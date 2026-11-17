# Pet QR Tags: Implementation Plan

- **Status:** Proposal, nothing built.
- **Date:** 2026-11-17
- **Decision it reverses:** pet QR tags and their scan history were retired on 2026-11-09 ([legacy cleanup, batch 1](../05-operations/agents/feature-updates/2026-11-09_1831_legacy-cleanup-batch-1.md); [PENDING_AND_FUTURE_FEATURES.md](PENDING_AND_FUTURE_FEATURES.md), "Physical Pet QR Tags: Retired"). The developer asked on 2026-11-17 to bring them back. When this is built, those two documents and [overview.md](../01-system/overview.md) must be updated in the same change.

## 1. Goal

A resident prints a QR tag for a **registered pet** and puts it on the collar. Anyone who finds the pet scans the tag with an ordinary phone camera and can tell the owner, **without seeing the owner's name, address or phone number**.

### How this answers the reasons it was retired

| Reason given on 2026-11-09 | How this plan handles it |
|---|---|
| Strays do not wear collars | Tags are only for registered, owned pets. Photo matching and community sightings stay the main tools for strays; the tag is an extra for owned pets. |
| Lost pets often lose their tags | The tag is optional and never required. A pet without one still has its lost-pet alert and photo matching. |
| Bystanders should not approach unknown animals | The scan page tells people never to approach or hold a frightened animal. A tag is read only when the pet is already calm or already safe with someone. |

## 2. What changed since the old version (and what we reuse)

The old version (`pet_qr_codes`, `pet_qr_scans`, `routes/pet_qr.py`, pages `PetScanPage`, `PetQrCardPage`) was built for the legacy portals and the barangay. It is still in git, before commit `6db99de`. We reuse its ideas (random token, public scan page, scan history), **not its code**, because the current app is different:

- **Lost pets now have alerts.** `lost_pet_alerts` has "I saw this pet" and "I have it safely" (`POST /lost-pet-alerts/{id}/sightings`, `sighting_type = seen | secured`). These already notify the owner, start the owner and finder conversation, and keep the Leader informed. A signed-in neighbour's scan should **go into this flow**, not a separate recovery system.
- **There is no barangay holding place** (the subdivision has none). The old "location type: Barangay Hall / Temporary Shelter" field is dropped.
- **The resident app now lives at `/resident-app`**, the Leader admin at the root.

## 3. How it works (user flows)

### 3.1 Owner: get a tag
1. **Pet details** (`/resident-app/pets/:petId`) gets a **"QR tag"** section: **Create tag**, then **View / Print**.
2. The print card: the QR code, the pet's photo and name, "Scan if found", and the subdivision name. No owner details. It can be downloaded as a PNG or printed at collar-tag size and card size.
3. **Replace tag** (lost or damaged tag): creates a new token, and the old one stops working at once. **Turn off** disables it without a new one.
4. **Scan history**: when and roughly where the tag was scanned, and any message left.

### 3.2 Someone scans the tag
The QR holds a link: `https://<site>/t/<token>`. The phone's own camera app opens it in the browser; **no app or account is needed**.

The public page **`/t/:token`** shows:
- the pet's photo, name, species and breed, and the subdivision;
- a banner if the pet **is reported lost** ("This pet is missing. Its owner is looking for it.");
- a safety note: keep your distance and do not chase it, and contact the guardhouse if it is aggressive.

**Never shown:** the owner's name, address, phone or email, the exact home location, or the pet's medical notes.

Then, depending on who scanned:

| Who scans | What they can do |
|---|---|
| **Signed-in resident of the same subdivision, pet has an active lost alert** | "I saw this pet" or "I have it safely" opens the existing `SightingPage` / `SecuredPetPage` for that alert. Nothing new is needed: the owner and Leader are notified, and the conversation opens the way it does today. |
| **Signed-in resident, pet not reported lost** | "Tell the owner I found this pet": a short form (where, optional photo, note). It notifies the owner in the app and by push, and opens the existing 1-to-1 owner and finder conversation. |
| **Guest (no account / another subdivision)** | "Tell the owner": where it was found (map pin or text), a note, and **optionally** a phone number with a tick box "Share my number with the owner". The owner gets a notification. The guest sees "The owner has been told", and is never shown the owner's details. |

### 3.3 Owner receives the scan
- A push and in-app notification: "Someone found Bantay (scanned his QR tag) near Block 4."
- If the pet has an open lost alert, the scan is added to that alert's sightings and map, so the Leader sees it in the case.
- If a guest shared a phone number, the owner sees it with a reminder to meet in a public place or at the guardhouse.
- **"Pet is back home"** closes the matter (and, if there is a lost alert, uses the existing recovery step).

### 3.4 Leader
No new page. Tag scans appear in the case activity of a lost alert, and the Pet Registry shows a small "Has QR tag" mark. The Leader can turn off a tag that is being abused.

## 4. Data model (new tables)

```
pet_tags
  tag_id        PK
  pet_id        FK pets, ON DELETE CASCADE
  token         VARCHAR(32) UNIQUE   -- secrets.token_urlsafe(16); never the pet_id
  status        ENUM(active, replaced, disabled)
  created_by    FK users
  created_at, disabled_at
  -- only one active tag per pet (checked in code; MySQL has no partial unique index)

pet_tag_scans
  scan_id       PK
  tag_id        FK pet_tags
  pet_id        FK pets
  kind          ENUM(view, found_report)      -- a page view, or a "tell the owner" message
  scanner_user_id  FK users NULL              -- null for guests
  latitude, longitude  NULL                   -- only what the finder chose to give
  location_label   VARCHAR(255) NULL
  note             VARCHAR(500) NULL
  finder_phone     VARCHAR(20) NULL           -- stored only when share_contact = true
  share_contact    BOOL
  photo_url        NULL
  alert_id         FK lost_pet_alerts NULL     -- set when it was filed into an active alert
  status           ENUM(new, seen_by_owner, resolved)
  created_at
```

- **Migration:** a new `ensure_pet_tag_tables()` in `backend/app/main.py`, like the other `ensure_*` steps, plus `Database3.4_subdivision.sql` / `.txt` and `docs/01-system/DATABASE_SCHEMA.md` (72 → 74 tables).
- **Retention:** `view` rows older than 90 days are deleted. `found_report` rows are kept with the pet, and a guest's phone number is cleared when the report is resolved.

## 5. Backend (FastAPI)

New router `backend/app/routes/pet_tags.py`:

| Endpoint | Who | Does |
|---|---|---|
| `POST /pets/{pet_id}/tag` | owner | create, or replace (the old one becomes `replaced`) |
| `GET /pets/{pet_id}/tag` | owner, Leader | current tag + link |
| `GET /pets/{pet_id}/tag/qr.png` | owner | the QR image |
| `POST /pets/{pet_id}/tag/disable` | owner, Leader | turn off |
| `GET /pets/{pet_id}/tag/scans` | owner, Leader | scan history |
| `GET /t/{token}` *(public)* | anyone | safe pet card (+ "is lost", + alert id when the viewer is a resident of that subdivision) |
| `POST /t/{token}/found` *(public, optional sign-in)* | anyone | "tell the owner" → `pet_tag_scans`, notification, push; signed-in resident → also opens the owner/finder conversation |

- **Safety:** the public endpoints return only the fields listed in §3.2, with an explicit allow-list schema (no `Pet` model dump). A `replaced` or `disabled` token returns "This tag is no longer active", without revealing the pet.
- **Abuse limits** (`slowapi`, already used): `GET /t/*` 30/min per IP, `POST /t/*/found` 3 per hour per IP and per token. Free text goes through the same checks residents' public text uses (`publicTextProblem` on the client, plus a length cap on the server).
- **Notifications:** a new category `pet_tag_found` in `push_categories.py` / `notification_dispatcher.py`, routed to the pet page or the alert.
- **QR image:** the Python `qrcode` package. It was removed from `requirements.txt`, so **adding it back needs your approval** (dependency change). The alternative is drawing the QR in the browser with the npm `qrcode` package, which is also a new dependency. Recommendation: backend, so the PNG is the same everywhere.

## 6. Frontend

**Resident app (`frontend/src/resident/`)**
- `pages/pets/PetDetailsPage.tsx`: the "QR tag" section (create / view / print / replace / turn off / scan history).
- New `pages/pets/PetTagPage.tsx`: the printable card (CSS print styles: collar tag about 3 × 3 cm, and card size).
- New public page `pages/tag/TagScanPage.tsx` at `/t/:token`, **outside the sign-in guard**. It works signed out, and when signed in it shows the matching buttons from §3.2.
- The "found" form reuses `MediaPicker` (camera + gallery, added on 2026-11-17) and the location picker from the report flow.
- `NotificationsPage` / navigation: a route for the `pet_tag_found` notification.

**Leader admin (`frontend/src/admin/`)**
- `PetsPage.tsx` / `PetDetailsPage.tsx`: the "Has QR tag" mark, scan history, and "Turn off tag".
- Case activity of a lost alert: tag scans listed with the sightings.

**In-app scanner (optional, phase 4):** a "Scan a pet tag" button using the browser's built-in `BarcodeDetector` (Chrome on Android), so **no new library**. Phones' camera apps already read QR codes, so this is a nice-to-have.

## 7. The link must not change (important for printed tags)

A printed tag is permanent, but today the site runs on **Cloudflare quick tunnels, whose address changes every run**. A tag printed today would break tomorrow.

- Add a setting `PUBLIC_TAG_BASE_URL` (backend `.env`, which you edit yourself) used to build the QR link.
- For the defense or demo with quick tunnels, re-print the demo card after starting the tunnel (one click from the pet page), or use a **named Cloudflare tunnel / fixed domain**, which keeps the same address.
- The token itself never changes, so a tag can still be read by the in-app scanner (phase 4) even if the domain changed.

## 8. Phases and implementation plan

Four phases, each shippable on its own and ending with a change record (`docs/05-operations/agents/feature-updates/`) and a working demo. Phase 0 is decisions only. Do not start Phase 1 until the §11 decisions are answered.

### Phase 0: Decisions and groundwork (about 0.5 day)

- [ ] Answer the three decisions in §11 (QR image package, guest messages, fixed address).
- [ ] Approve the dependency change (`qrcode` back into `backend/requirements.txt`, if chosen).
- [ ] Pick the public address for tags (`PUBLIC_TAG_BASE_URL`) and add it to `.env` yourself (agents may not edit `.env*`).
- [ ] Re-read `AGENTS.md`: if FREEZE is ON, each file needs approval and this counts as a new feature outside the documented scope.

**Done when:** every open question in §11 has an answer written in this plan.

### Phase 1: Owners can create and print a tag (about 2 days)

| # | Task | Files |
|---|---|---|
| 1.1 | Models `PetTag`, `PetTagScan` | `backend/app/models/pet_tag.py` (new), `models/__init__.py` |
| 1.2 | Startup migration `ensure_pet_tag_tables()` (creates both tables if missing, alters nothing else) | `backend/app/main.py` |
| 1.3 | Schemas for the owner-side responses | `backend/app/schemas/pet_tag.py` (new) |
| 1.4 | Service: token generation (`secrets.token_urlsafe(16)`), one active tag per pet, replace, disable, QR PNG, link built from `PUBLIC_TAG_BASE_URL` | `backend/app/services/pet_tags.py` (new) |
| 1.5 | Endpoints `POST/GET /pets/{id}/tag`, `GET .../tag/qr.png`, `POST .../tag/disable`, with owner and Leader checks | `backend/app/routes/pet_tags.py` (new), `main.py` (`include_router`) |
| 1.6 | API client and adapter | `frontend/src/resident/live/api.ts`, `adapters.ts`, `actions.ts` |
| 1.7 | "QR tag" section on the pet page: create, view, replace, turn off | `frontend/src/resident/pages/pets/PetDetailsPage.tsx` |
| 1.8 | Printable card page with print CSS (collar tag size and card size) | `frontend/src/resident/pages/pets/PetTagPage.tsx` (new), `ResidentApp.tsx` (route `pets/:petId/tag`) |
| 1.9 | Backend tests: only the owner or Leader can create or disable; one active tag; replacing kills the old token | `backend/tests/test_pet_tags.py` (new) |
| 1.10 | SQL snapshot, `DATABASE_SCHEMA.md` (72 to 74 tables), change record | `Database3.4_subdivision.sql/.txt`, `docs/` |

**Done when:** an owner creates a tag for a registered pet and prints the card, and replacing the tag makes the old token stop being active. No public page yet.

### Phase 2: Anyone can scan and tell the owner (about 3 days)

| # | Task | Files |
|---|---|---|
| 2.1 | Public safe pet card `GET /t/{token}` using an explicit allow-list schema (never a `Pet` dump); an inactive token returns "no longer active" | `backend/app/routes/pet_tags.py`, `schemas/pet_tag.py` |
| 2.2 | `POST /t/{token}/found` (optional sign-in): validates text and location, stores the scan, stores the phone only with consent | `pet_tags.py`, `services/pet_tags.py` |
| 2.3 | Rate limits with `slowapi`: `GET /t/*` 30 per minute per IP, `POST .../found` 3 per hour per IP and per token | `pet_tags.py`, `app/limiter.py` |
| 2.4 | Notification category `pet_tag_found`, in-app plus push, deep link to the pet page | `utils/push_categories.py`, `utils/notification_dispatcher.py`, resident notification routing |
| 2.5 | Signed-in finder: also open the existing 1-to-1 owner and finder conversation | service using the existing chat helpers |
| 2.6 | Public page `/t/:token` outside the sign-in guard: pet card, lost banner, safety note, "tell the owner" form with `MediaPicker` and the location picker | `frontend/src/resident/pages/tag/TagScanPage.tsx` (new), `ResidentApp.tsx` |
| 2.7 | Owner's scan history on the pet page (new, seen, resolved; "Pet is back home") | `PetDetailsPage.tsx` |
| 2.8 | Tests: the public response has no owner fields; a disabled or replaced token leaks nothing; rate limits; phone stored only with consent | `backend/tests/test_pet_tags.py` |
| 2.9 | Change record and `docs/README.md` row | `docs/` |

**Done when:** a signed-out phone scans a printed tag and sends a message with a location, and the owner gets a push and sees it in the scan history, without the finder ever seeing owner details.

### Phase 3: Connect scans to lost-pet alerts and the Leader (about 2 days)

| # | Task | Files |
|---|---|---|
| 3.1 | `GET /t/{token}` also returns the active `alert_id` when the viewer is a resident of that subdivision | `pet_tags.py` |
| 3.2 | Scan page for a signed-in neighbour: "I saw this pet" and "I have it safely" go to `SightingPage` / `SecuredPetPage` for that alert | `TagScanPage.tsx` |
| 3.3 | A guest or non-lost scan on a pet with an open alert is linked to that alert (`alert_id` set on the scan row) so it shows on the tracking map | `services/pet_tags.py`, `routes/lost_pet_alerts.py` (read only) |
| 3.4 | Leader admin: "Has QR tag" mark, scan history, "Turn off tag", tag scans in the case activity | `frontend/src/admin/pages/PetsPage.tsx`, `PetDetailsPage.tsx`, case activity view, `admin/live/api.ts`, `adapters.ts` |
| 3.5 | Tests: a resident of another subdivision cannot reach alert-only actions; the Leader sees scans for their own subdivision only | `test_pet_tags.py` |
| 3.6 | Docs: update `overview.md`, `PENDING_AND_FUTURE_FEATURES.md` (the "Retired" row) and `DEFENSE_PLAN.md`; change record | `docs/` |

**Done when:** a scan of a lost pet's tag shows on the alert map and in the Leader's case activity, and the neighbour's buttons use the existing flows.

### Phase 4: Extras (optional, about 1 day)

- [ ] In-app "Scan a pet tag" button using the browser's `BarcodeDetector` (no new library), with the camera-app fallback explained when it is unsupported.
- [ ] Scheduled cleanup: delete `view` scans older than 90 days and clear a guest's phone number when a scan is resolved.
- [ ] Android: nothing extra for the public page (it is a normal link). The in-app scanner uses `getUserMedia`, which needs the CAMERA permission declared in the manifest and an APK rebuild; weigh that before building it.

### Order, effort and risks

| Phase | Effort | Depends on | Main risk | Mitigation |
|---|---|---|---|---|
| 0 | 0.5 day | you | Open decisions stall the work | Answer §11 first |
| 1 | 2 days | 0 | New dependency needs approval | Ask in Phase 0 |
| 2 | 3 days | 1 | Abuse of the public form; leaking owner data | Allow-list schema, rate limits, tests |
| 3 | 2 days | 2 | Touching the lost-pet alert flow | Read-only use of existing endpoints, tests |
| 4 | 1 day | 2 | Needs CAMERA permission and an APK rebuild | Optional; ship without it |

Total: about 8 to 9 working days for Phases 1 to 3. The defense demo needs only Phases 1 and 2, plus a fixed address.

### Rollout and rollback

- **Migration:** the new tables are created at startup and nothing existing is altered, so rollback is "stop using the router": remove the `include_router` line, and the tables can stay unused.
- **Feature switch:** guard the public endpoints with an `ENABLE_PET_TAGS` setting (default off), so tags go live only after the address and `.env` are ready.
- **Remote database:** nothing here touches a production database until you run it yourself; an agent will not run migrations against a remote database (`AGENTS.md`).
- **Verification per phase:** `pytest backend/tests/test_pet_tags.py`, `npx tsc -p tsconfig.app.json --noEmit`, `npx eslint src/resident src/admin`, the docs audit, then a manual test on a real phone with a printed tag.

## 9. Tests to add

- **Backend:** the public endpoint never returns owner fields; a replaced or disabled token gives "no longer active"; the rate limits; a guest's phone is stored only when consent is ticked; a resident of another subdivision cannot reach the alert-only actions; only the owner or Leader can create, disable or read scans.
- **Browser:** scan page signed out and signed in; print card layout; notification opens the right page.

## 10. Documents to update when built

- [overview.md](../01-system/overview.md): change "The pet QR tags ... were retired on 2026-11-09" to describe the new tags.
- [PENDING_AND_FUTURE_FEATURES.md](PENDING_AND_FUTURE_FEATURES.md): the "Physical Pet QR Tags: Retired" row.
- [DATABASE_SCHEMA.md](../01-system/DATABASE_SCHEMA.md) and the SQL snapshot.
- [DEFENSE_PLAN.md](../02-project/DEFENSE_PLAN.md): step 1 already demos scanning a QR card; check it matches.
- A change record for each phase, and this plan's status line.

## 11. Decisions needed before building

1. **QR image:** add the Python `qrcode` package back (recommended), or the npm one?
2. **Guests:** may people without an account send "tell the owner" messages (recommended, since that is the point of a tag), or signed-in residents only?
3. **Stable address:** a named tunnel or fixed domain for the defense, or re-print cards per demo?
