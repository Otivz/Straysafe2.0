# Project

Status: Current (baseline written 2026-10-25 from repository evidence; dates come from `git log` and the plan documents named below)

StraySafe 2.0 is a capstone project (first commit 2026-05-22; 207 commits and pull requests up to #92 on 2026-10-24). Requirements below are derived from the implemented code and the existing plan documents, not from a signed requirements specification. Whether such a specification exists outside this repository is **Unknown**.

## Requirements (as implemented)

| Area | Requirement | Evidence |
|---|---|---|
| Accounts | Four roles (Resident, Subdivision Leader, Barangay Staff, Administrator) with sign-in, OTP email verification, Google sign-in, stay-signed-in with per-role lifetimes | `backend/app/routes/auth.py`, `backend/app/utils/auth.py` |
| Reporting | Residents report strays or lost pets with photos or video, inside a configurable reporting radius; reports carry a status timeline and can be disputed, merged, split per animal, and hidden or shown by visibility rules | `backend/app/routes/reports.py`, `report_split.py`, [REPORT visibility tests](../../backend/tests/test_report_visibility.py), [MULTI_ANIMAL_REPORT_PLAN](../03-development/implementation-reports/MULTI_ANIMAL_REPORT_PLAN.md) |
| AI assistance | AI suggests, staff decide: animal detection, photo authenticity, attributes, duplicate sightings, pet look-alikes | [AI_TECHNOLOGIES](../01-system/AI_TECHNOLOGIES.md), [AI_TODO](../03-development/AI_TODO.md) |
| Rescue and holding | Dispatch, holding facility records, stay limits, care logs | `backend/app/routes/rescue.py`, `holding.py` |
| Pet registry | Pet records, QR tags, scan history, ownership requests, de-duplicated records | [PET_RECORD_DUPLICATE_PREVENTION_PLAN](../03-development/implementation-reports/PET_RECORD_DUPLICATE_PREVENTION_PLAN.md) |
| Claims | Owner claims with proof; staff approval links the pet record | `backend/app/routes/claims.py`, `backend/app/utils/claim_identity.py` |
| Adoption | Catalog, applications, staged review, home assessment, certificates, monitoring | `backend/app/routes/adoptions.py`, `adoption_tasks.py`, `adoption_certificates.py` |
| Communication | Chat, announcements, notifications, email, web push | [PUSH_NOTIFICATION_IMPLEMENTATION](../03-development/implementation-reports/PUSH_NOTIFICATION_IMPLEMENTATION.md), [NOTIFICATION_UI_IMPROVEMENTS](../03-development/implementation-reports/NOTIFICATION_UI_IMPROVEMENTS.md) |
| Analytics | Dashboards for administrators and subdivision leaders | [ANALYTICS_SPECIFICATION](../01-system/ANALYTICS_SPECIFICATION.md) |
| Mobile | Responsive web plus a Capacitor Android app (debug APK from GitHub Actions) | `frontend/capacitor.config.ts`, `.github/workflows/build-apk.yml` |

## Decisions in force

These are visible in the code or in a plan document; none was recorded as a formal decision record until now.

1. **The AI only suggests.** Duplicates, look-alikes and priority are confirmed by staff ([AI_TODO](../03-development/AI_TODO.md)).
2. **Permissions are enforced in the backend** by role and by subdivision or barangay scope; the frontend mirrors them ([CLAUDE_HANDOFF](../05-operations/agents/CLAUDE_HANDOFF.md)).
3. **Reports have visibility rules**: private reports do not reach other residents' lists or maps (`backend/tests/test_report_visibility.py`).
4. **A report is geofenced** to a centre and radius stored in `coverage_settings`, changeable by the administrator; the server checks it when a report is filed and when a resident moves a pin (map audit (deleted from the working tree in commit `5e46d00`; last version: `git show 8cb074f:STRAYSAFE_MAP_AUDIT_AND_IMPROVEMENTS.md`)).
5. **Custody decides who may edit an animal's record** while it is in official care (`backend/app/utils/pet_record_access.py`).
6. **The installed app stays signed in** through a refresh token carried in a header; browsers use an httpOnly cookie ([CLAUDE_HANDOFF](../05-operations/agents/CLAUDE_HANDOFF.md), `backend/tests/test_app_stay_signed_in.py`).
7. **AI runs in a separate worker process** so it does not slow the API ([setup.md](../05-operations/setup.md)).
8. **Bite and chasing history are counted only from verified incident reports** and cannot be edited on the pet record by anyone; an owner's or officer's own account is stored separately as a *declaration*, which a resident can add but only staff can remove (2026-10-25, `backend/app/routes/pets.py` `check_behavior_edit`, `backend/tests/test_pet_behavior_history.py`).
9. **Nobody grants themselves account powers.** A person edits only their own name, email, phone, address and map pin. A barangay Head Officer manages position, active status and officer-in-charge for staff of their own barangay. Only the administrator changes role, Head Officer, barangay, subdivision or verification. Certificates are signed by the Head Officer flag, never by a position title (2026-10-25, `backend/app/routes/users.py` `update_user`, `backend/tests/test_account_self_edit.py`).
10. **Code is the source of truth** when documents disagree (see below).

## Milestones (from git history and plan documents)

| Date | Milestone | Evidence |
|---|---|---|
| 2026-05-22 | First commit, initial documentation | `git log` |
| 2026-10-12 | Web push notifications (phase 1) | [PUSH_NOTIFICATION_IMPLEMENTATION](../03-development/implementation-reports/PUSH_NOTIFICATION_IMPLEMENTATION.md) |
| 2026-10-15 | One pet record per pet for owners without an account | [PET_RECORD_DUPLICATE_PREVENTION_PLAN](../03-development/implementation-reports/PET_RECORD_DUPLICATE_PREVENTION_PLAN.md) |
| 2026-10-20 | Multi-animal reports split into per-animal records | [MULTI_ANIMAL_REPORT_PLAN](../03-development/implementation-reports/MULTI_ANIMAL_REPORT_PLAN.md) |
| 2026-10-21 | Installable app build (GitHub Actions) and responsive UI | `git log`, `.github/workflows/build-apk.yml` |
| 2026-10-23 | Maps audit: report location picker, phone report card, geofence fixes | map audit (git history, commit `8cb074f`) |
| 2026-10-24 | Landing page update; analytics dashboards (PR #91, #92) | `git log` |

## Current status

- **Done and tested locally:** the capabilities in the table above, with 95 backend test scripts in `backend/tests/` and browser checks in `frontend/tests/`. How many pass today is **Unverified** (the full suite was not run for this baseline).
- **In the working tree, not committed:** many changes, including pet-record custody permissions, claim identity, notifications and the sign-out fix ([CLAUDE_HANDOFF](../05-operations/agents/CLAUDE_HANDOFF.md)). Their state on `main` is **Unverified**.
- **Planned, not built:** Android push through FCM (phase 2 of the push plan), live GPS responder tracking ([plan](../06-future-proposals/LIVE_GPS_RESPONDER_TRACKING_PLAN.md), plan only), and public deployment ([DEPLOYMENT_GUIDE](../05-operations/DEPLOYMENT_GUIDE.md), plan: Aiven, Cloudinary, Render, Vercel; not started).
- **Open questions:** whether `Database3.3.txt` matches the ORM; whether the Gemini free quota (20 requests per model per day) suffices for a demonstration ([AI_TODO](../03-development/AI_TODO.md)); whether the YOLO step fits the chosen host's memory ([DEPLOYMENT_GUIDE](../05-operations/DEPLOYMENT_GUIDE.md)).

## Stale or conflicting records

| Record | Problem |
|---|---|
| `tech_stack_details.txt` | Names Cloudflare R2, OpenRouter/Groq and PostgreSQL; the code uses Cloudinary, Gemini and MySQL |
| `architectural_design.txt` | Names Jose and `routers/` / `core/` folders; the code uses PyJWT and `routes/`, `utils/`, `services/` |
| `setup.md` | Names `STRAYSAFE_DB_URL` and `Database.txt`; the API reads `DATABASE_URL`, and the schema file is `Database3.3.txt`. It also lists seed accounts and a shared seed password in a tracked file, which should be reviewed before the repository is made public |
| Root-level `*.md` plans and audits | Not yet indexed under `docs/`; see [docs/README.md](../README.md) for where they are referenced |

None of these was edited in this pass; each needs an owner decision (update, move to `docs/archive/`, or delete).
