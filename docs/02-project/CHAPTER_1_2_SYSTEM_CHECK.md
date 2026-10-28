# STRAYSAFE: Chapters 1 and 2 checked against the system

This review compares *STRAYSAFE (3).pdf* (Chapters 1–2) with the StraySafe 2.0 code as it stands on the `main` branch (October 2026).
Each claim was checked in the code: the backend routes, models and utilities, the frontend pages and routes, and the dependency lists.
The ratings at the end are my own judgment of readiness, not a panel score.

**Bottom line:** most of what the chapters describe is really built, and the writing is strong. Four claims, however, describe a different workflow from what the system does. A panelist who tries the system will notice them, so fix these first.

1. **Priority.** The chapters say the leader recommends a priority and the barangay finalizes it. The system has no such step.
2. **Visibility.** The chapters say residents choose Private or Public. The system ignores that choice.
3. **Notifications.** The chapters say "in-app and email only". The system also sends push notifications.
4. **AI scope.** The Delimitation lists less than the AI actually does.

Chapter 2 also has several ERD figures under the wrong caption, a leftover editing note in the text, and screenshots that are out of date.

---

## 1. What matches the system ✅

| Claim in the chapters | Where it is in the system |
|---|---|
| React 19, TypeScript, Vite, Tailwind, Leaflet / React-Leaflet | `frontend/package.json` (React 19.2, Vite 8, Tailwind 4) |
| FastAPI, SQLAlchemy 2.0, MySQL | `backend/requirements.txt` (`fastapi`, `sqlalchemy>=2.0`, `pymysql`) |
| YOLOv8 **Nano**, OpenCV, Pillow, Gemini | `yolov8n.pt`, `utils/model_loader.py`, `opencv-python`, `Pillow`, `google-genai` |
| Cloudinary media storage | `cloudinary` package and `utils/cloudinaryUpload` |
| bcrypt password hashing | `passlib[bcrypt]` |
| Password policy of 12–128 characters | `utils/password_policy.py` (`PASSWORD_MIN_LENGTH = 12`, `MAX = 128`) |
| Email OTP and Google Sign-In for residents | `routes/auth.py`, `google-auth` |
| Token revocation and rate limiting | `models/revoked_token.py`, `slowapi` (`app/limiter.py`) |
| Role- and jurisdiction-based access | Enforced on the server (for example `report_visibility.resident_scope`) |
| Near-real-time updates, no persistent real-time connection | No WebSocket code anywhere, so updates come from polling |
| No offline caching | `sw.js` exists for push only and caches nothing |
| Geofence validation | `utils/coverageArea` and the coverage check before Step 6 of the report wizard |
| Heatmap | Admin heat map, admin dashboard and barangay dashboard |
| OSRM routing assistance | `components/RoutingControl.tsx`, `MapComponent.tsx` |
| Duplicate detection and merge/unmerge with audit trail | Merge and unmerge routes, plus the case-group helpers |
| Lost-pet matching (AI suggests, people decide) | `report_matches`, `routes/matches.py`; owner and staff confirm |
| Pet QR registration and public scan | `/pet/scan/:token` (no login needed) |
| Public adoption catalog and certificate check | `/adopt` and `/verify/certificate/:number` (no login needed) |
| Adoption lifecycle with Day 7, 14 and 30 check-ins | `routes/adoptions.py` (`Day_7`, `Day_14`, `Day_30` milestones) |
| Barangay staff accounts invited by email setup code | Register Barangay Staff form: no password, setup code emailed |
| Ownership change accepted by the new owner | `pet_owner_confirmations` |
| Residents can file disputes | `report_disputes` |
| Every ERD table exists | `ai_jobs`, `ai_vision_comparisons`, `adoption_*`, `push_deliveries`, `report_returns`, `coverage_settings` and the rest are all in `app/models` |
| Subdivision leader holding facility is view-only | `SubdHoldingFacility.tsx` shows records read-only |
| Admin can turn AI photo matching on or off | `AdminAccountSettings.tsx` |

The architecture, stack, AI components, mapping, adoption flow, QR flow and data model are therefore described accurately.

---

## 2. Claims that do NOT match the system ❌ (fix before defense)

### 2.1 Priority: "leaders recommend, barangay staff finalize" does not exist
**Where the chapters say it:**
- Chapter 1: Specific Problem 6, Specific Objective 6.
- Chapter 1 modules: Rescue Request Management, Report Escalation, Stray Animal Reporting.
- Chapter 1: Delimitation.
- Chapter 2: Standardized Severity Triage.

**What the system does:**
- Reports have a single `priority_level` field. There is nothing for a "recommended" or a "final" priority, and no screen where a leader recommends or barangay staff finalize one.
- The priority shown everywhere is the **AI's suggested priority**, from `effective_priority()` in `schemas/report.py`. If the AI gives none, a keyword-based fallback in `utils/ai_suggestions.py` sets it.
- `priority_level` is in `RESIDENT_EDITABLE_REPORT_FIELDS`, so a resident can technically change it through the API while the report is unverified. It is not shown, though, because the AI value always wins.

**Choose one fix:**
- **(a) Change the text.** For example: *"The system suggests a priority level from the AI analysis of the photos and description, with a rule-based fallback. Subdivision leaders and barangay staff review it before acting on the case."* Then remove "recommend" and "finalize" from Problem 6, Objective 6 and the module descriptions.
- **(b) Build the feature.** Add a leader recommendation and a barangay final decision. That needs a database change and new endpoints, so it is a real feature, not a wording fix. Also remove `priority_level` from the resident-editable fields.

### 2.2 Visibility: residents do not choose it
**Where the chapters say it:**
- Chapter 1, Stray Animal Reporting Module: *"visibility setting (private report or public sighting)"*.
- Chapter 2, Functional Requirements: *"Reports shall include … visibility settings."*

**What the system does:** every report starts **Private**, even if the form says otherwise (`routes/reports.py`: *"Nobody chooses visibility when filing"*). Only the **Subdivision Leader** can make it Public. A false or rejected report, or a merged duplicate, can never be public.

**Fix:** *"Every report starts as private. The subdivision leader handling it decides whether it becomes a public sighting that other residents can see. Reports closed as false, rejected or merged are never shown publicly."* This is actually a stronger RA 10173 (Data Privacy Act) point, so use it in the Security and Privacy discussion as well.

### 2.3 Notifications: push exists but the scope says "in-app and email only"
**Where the chapters say it:**
- Chapter 1, Notifications Module: *"in-app and email channels"*.
- Chapter 1, Delimitation: *"Notifications are delivered in-app and by email."*

**What the system does:** it also sends **Web Push** notifications to phones (`pywebpush`, `push_subscriptions`, `push_deliveries`). Chapter 2's own context diagram (Figure 2.6), Figure 2.8 and Figure 2.33 already show the Web Push Service, so the document contradicts itself.

**Fix:** *"…through in-app, email and web push notifications, with per-user preferences. SMS is not included."*

### 2.4 AI scope: the Delimitation lists less than the AI does
**Where the chapters say it:** the Delimitation says the AI is *"limited to animal detection and cat-or-dog species identification, report validation, photo authenticity checking, image similarity checking and pet matching, and duplicate report detection."*

**What the system does:** Gemini also suggests the **colour, size, possible breed, risk level and priority**, each with a reason (`utils/ai_suggestions.py`). Chapter 2's Functional Requirements already says *"species, color, size, and other visual characteristics"*, so Chapters 1 and 2 disagree.

**Fix:** add these to the Delimitation, presented as *suggestions that staff review*. Keep "advanced breed identification" in the out-of-scope list, but make clear that the possible breed is only a suggestion.

### 2.5 Admin "emailed sign-in code" is optional and currently OFF
**Where the chapters say it:** the Administrator Login Module and the Security delimitation (*"emailed sign-in codes"*).

**What the system does:** the code exists (`routes/auth.py`), but only runs when `ADMIN_LOGIN_2FA=true` is set. It is not set in your `.env`, so admins currently sign in without a code.

**Fix:** either turn it on for the deployed backend (Render settings), or write *"an optional emailed sign-in code for administrators"*.

### 2.6 Session security wording
**Where the chapters say it:** Non-Functional Requirements: *"safeguard sessions via HttpOnly JWT cookies"*.

**What the system does:** only the **refresh token** is in an HttpOnly cookie. The 60-minute **access token** is kept in browser storage and sent as a header (`utils/api.ts`).

**Fix:** *"short-lived access tokens with a refresh token stored in an HttpOnly cookie"*.

### 2.7 Owner warnings and fines
**Where the chapters say it:** the Delimitation says warnings *"do not impose fines"*.

**What the system does:** `owner_warnings.fine_amount` exists in the database, the API accepts it, and Figure 2.20 shows it. No screen sets it, so it is always 0.

**Fix:** remove `fine_amount` from Figure 2.20, or add one sentence saying the field is unused and always 0. Leaving it in the ERD with no comment invites the question "so you do fine owners?"

### 2.8 Android app and installable web app are not mentioned
**What the chapters say:** the system is a *"standalone web-based platform"* that runs *"without requiring … software installations"*.

**What the system does:** besides the website, there is an **Install App** button (installable web app) and an **Android APK** built with Capacitor (`.github/workflows/build-apk.yml`). Installing is optional, so the claim is not false, but you are leaving out a feature.

**Fix:** add one line to the Scope: *"The web application can also be installed on Android phones (installable web app, or an APK packaged with Capacitor); it uses the same features and server."* Also add Capacitor to Table 2.3.

### 2.9 Holding facility: "medical" wording
**Where the chapters say it:** the Figure 2.60 description says *"treatment requirements, general health marks … medical notes"*.

**Why it is a problem:** this contradicts your own Delimitation (*"non-clinical observations, not veterinary assessments"*), and the database column is named `medical_notes`.

**Fix:** reword the description to *"care status and non-clinical care notes"*. Keeping the column name is fine.

---

## 3. Chapter 2 document errors (figures and text) 🧾

| Page | Problem | Fix |
|---|---|---|
| 57 | A leftover editing note is in the body text: *"Each explanation follows the corrected diagram's flows, so redraw Figures 2.3 and 2.5 with the corrections before using this text."* | Delete it, after redrawing Figures 2.3 and 2.5 if that is still pending |
| 58 | The heading says "Context Diagram Proposed" but the paragraph says *"level 1 DFD … nine processes"* and *"four external entities"* | The paragraph belongs under the Level 1 section. The context diagram has five people/roles (Resident, Subdivision Leader, Barangay Staff, Administrator, Public Visitor) plus outside services (Gemini, Cloudinary, Email, Web Push, OpenStreetMap) |
| 58–59 | The figure calls the outside user **"Public Visitor"** but the text calls them **"Public Finder"** | Use one name |
| 61 | Sentence cut off: *"…go through process 3.0, which stores the photos"* | Finish it, and add process 4.0 (AI matching), which is in Figure 2.7 but not described |
| 64–65, 83 | Typos "Barangay **Staf**", "Part 2**F**", "**Staf** Assignments" | Spelling |
| 72 | Figure 2.18 is captioned *"QR Tags and Pet History"* but shows the **pets / pet_vaccinations** table | Caption: "Pet Record and Vaccinations" |
| 76 | Figure 2.22 *"Report Timeline and Media"* shows the **QR scans and pet history** diagram again (same as 2.19) | Insert the real status_history and report_media diagram (currently in 2.27's place) |
| 81 | Figure 2.27 *"Holding Facility"* shows **status_history and report_media** | Insert the holding_animals and holding_timeline diagram (currently in 2.28's place) |
| 82 | Figure 2.28 *"Application and Verification"* shows **holding_animals** | Insert the adoptions and adoption_verifications diagram (currently in 2.29's place) |
| 83 | Figure 2.29's text mentions adoption_assignments, adoption_interviews and adoption_home_visits, but the figure shows adoptions, verifications and timeline logs | Insert the assignments, interviews and home-visits diagram. These tables do exist in `models/report.py` |
| 37 | Unclosed citation: *"(Roldan-Gan & Gregorio, 2025; The framework…"* | Close it, or add the missing second source |
| 70 | Typo "**aa**coverage_settings" | "coverage_settings" |
| 90, 93 | Two figures both titled "Login Page" (2.36 staff, 2.40 resident) | "Staff Login Page" / "Resident Sign-In Page" |
| 97, 102 | "real-time timeline" and "real-time operational visibility" | Use "near-real-time", as you correctly do everywhere else |

**Figures 2.22, 2.27, 2.28 and 2.29 look shifted by one.** Each figure shows the diagram that belongs to the next caption. Re-insert them in order and check every ERD caption against its picture.

---

## 4. Screenshots are out of date and some show personal data 📸

The User Interface figures (2.36–2.61) were taken before this month's redesign, and several show things the system no longer does:

- **Figure 2.37 (Admin Dashboard)** shows "AI Smart Insights" with a *"predictive forecast: high report probability"* card. That card showed invented numbers and has been removed. The dashboard now shows only real counts and a real API status. A predictive forecast also contradicts your Delimitation ("no predictive spatial modeling").
- **Figure 2.56 (Pet Claims)** shows sample claims (Bruno, Max, Brownie…) with 90%+ match scores. Those were placeholder rows that are now removed. Real claims show "Match score N/A" when there is no score.
- **Figures 2.38, 2.39 and 2.43** show real names, **email addresses** and a phone number. For a document about RA 10173 compliance, blur them or use test accounts.
- **Figure 2.47** says leaders see a live map. That is true, but the phone layout has changed.

**Fix:** retake the screenshots after the UI work is finished, using test accounts. Add at least one phone screenshot (for example the Report a Stray wizard), since the document stresses mobile reporting.

---

## 5. Things I could not verify from the code

- **Hosting on Vercel, Render and Aiven:** there are no `vercel.json` or `render.yaml` files in the repo, so this is configured in the hosting dashboards. That is fine; just make sure it is true at defense time.
- **MySQL version (8.0):** set by the hosting service, not the code.
- **The study design** (respondents, sampling, instruments, t-test, Cronbach's alpha): this is methodology, not code. It is internally consistent (50 end users plus 5 IT experts; benchmark 2.51; one-tailed test at α = 0.05; Wilcoxon fallback).

---

## 6. Ratings

| Area | Score | Why |
|---|---|---|
| Chapter 1: rationale, literature, gap | **9 / 10** | Local data, current sources, a clearly stated contribution ("integrative and contextual rather than technical"). This is the strongest part |
| Chapter 1: problems, objectives, scope vs. the real system | **6.5 / 10** | Most modules match, but the priority workflow, resident visibility choice, notification channels and AI scope are described differently from what was built |
| Chapter 1: theoretical and conceptual framework | **8.5 / 10** | TAM, ISO 25010:2023, One Health and Crowdsourcing are well connected; the IPO figure matches the text. Only the unclosed citation needs fixing |
| Chapter 2: methodology and requirements | **8 / 10** | The functional requirements match the system closely; the non-functional requirements need the token-wording fix |
| Chapter 2: diagrams (DFD and ERD) | **5.5 / 10** | The tables are all real, but four ERD figures are under the wrong caption, a leftover editing note remains, and some DFD text is incomplete |
| Chapter 2: UI figures | **5 / 10** | Out of date, show removed placeholder data, and expose personal data |
| Chapter 2: research design and statistics | **8.5 / 10** | Consistent sample, scales, hypothesis and tests |
| **How well the system matches the document overall** | **~73%** | Of the 33 claims checked: 24 match (Section 1) and 9 don't (Section 2). The mismatches are mostly wording, but 2.1 and 2.2 change how the workflow is described |
| **Overall (Chapters 1–2)** | **7.4 / 10** | Strong content. Most deductions are fixable in a day of editing, except the priority workflow, if you decide to build it |

### If you fix only five things
1. **Priority:** reword it as "AI-suggested, reviewed by staff", or build the recommend and finalize step (2.1).
2. **Visibility:** describe it as decided by the leader, not the resident (2.2).
3. **Notifications:** add web push to Chapter 1 (2.3).
4. **ERD figures:** re-order Figures 2.22, 2.27, 2.28 and 2.29, and delete the leftover note on page 57 (Section 3).
5. **Screenshots:** retake them after the redesign, with personal data blurred (Section 4).
