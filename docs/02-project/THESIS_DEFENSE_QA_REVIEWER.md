# STRAY-SAFE 2.0 — Strict Thesis Defense Panelist Q&A Reviewer

**System Under Defense:** STRAY-SAFE 2.0: Smart Stray Animal Reporting and Rescue System  
**Pilot Community:** Selera Homes Subdivision, Barangay San Vicente, Santa Maria, Bulacan  
**Format per Topic:** Panelist's Question → Suggested Answer → Possible Follow-up Question → Stronger Defense

---

## 1. System Overview and Rationale

**Panelist's Question:**  
Why did you build a dedicated platform just for one subdivision when residents already have Facebook group chats, Messenger, and Barangay hotlines? Isn't STRAY-SAFE redundant?

**Suggested Answer:**  
Group chats and Messenger are unstructured—reports get buried under casual messages, there is no standardized location pin, no status tracking, and no way to tell if a case was already verified or escalated. STRAY-SAFE 2.0 centralizes reporting with mandatory photos, geofenced map pins, a 4-stage case lifecycle (`reported` → `under_review` → `in_progress` → `closed`), and permanent Pet QR tags so nothing gets lost or duplicated.

**Possible Follow-up Question:**  
Even if Messenger is messy, residents already use it daily. How do you guarantee residents will actually install or open STRAY-SAFE instead of posting in their HOA Facebook group?

**Stronger Defense:**  
We designed adoption around practical incentives rather than forcing behavior: first, registering a pet gives the owner a free permanent QR tag (`/t/<token>`) and physical QR collar request workflow so anyone who finds their pet can contact them without exposing their home address or personal email. Second, we built both a web app (`/resident-app`) and a native Android APK with push notifications so updates reach residents directly. Still, we acknowledge in our limitations that initial adoption requires HOA endorsement and onboarding support.

---

## 2. Problems and Objectives

**Panelist's Question:**  
Your title says *"Smart Stray Animal Reporting and Rescue System,"* yet your system does not actually dispatch ambulances or rescue teams by GPS in real time. Isn't your title overclaiming what the system actually does?

**Suggested Answer:**  
"Smart" in STRAY-SAFE 2.0 refers to structured, data-assisted coordination—specifically permanent QR recovery tags, geofence validation, automated priority triage for injured or aggressive animals, rule-based Lost & Found matching, and advisory AI photo checks. Actual physical rescue or handling is carried out by subdivision officers or external partner agencies after human review.

**Possible Follow-up Question:**  
Then what happens if an aggressive dog bites someone at 2:00 AM and no Subdivision Administrator is online? Doesn't your human-in-the-loop workflow become a bottleneck?

**Stronger Defense:**  
That is a real operational constraint of a subdivision-level tool, and we do not claim STRAY-SAFE replaces emergency 911 or veterinary hotlines. What the system does is automatically flag `injured` (especially immobile) and `safety` reports as urgent priority, surface them at the top of the Admin Attention Queue, and log exact timestamps, photos, and GPS coordinates so admins or partner agencies (Barangay, Veterinary Office, Animal Control) have complete, auditable evidence as soon as they respond.

---

## 3. System Features and Functionalities

**Panelist's Question:**  
Looking at your system, you have Pet Registry, QR Tags, QR Collar Requests, Incident Reporting, Matching, Complaints, Warning Templates, Messaging, External Referrals, and Analytics. Isn't this feature creep for an undergraduate capstone? Which features are actually complete and tested, and which are half-baked?

**Suggested Answer:**  
All those modules are implemented and integrated in our current `vitzupdates` / `update` branch—backed by 70 MySQL tables, FastAPI route modules, the Subdivision Admin Web Portal (`/`), and the Resident App (`/resident-app` and Android APK). Rather than separate unrelated tools, they form one linear workflow: Pet/QR registration → Incident/Lost reporting → Triage & Matching → Owner Verification / Observation / Warnings or External Referral → Analytics.

**Possible Follow-up Question:**  
Having 70 tables does not automatically mean every workflow works end-to-end. For example, what happens if a resident uploads a photo from Google Photos on Android or submits an "Others" animal type—did you actually handle those edge cases?

**Stronger Defense:**  
Yes, we encountered and fixed real edge cases during testing: for example, Android WebView can revoke temporary `content://` read permissions before form submission, so our `MediaPicker` now buffers picked photos into memory immediately on selection (`takeFilesInMemory`). For animal types, residents can select `Dog`, `Cat`, or `Others` with a required custom text field, while Pet Registration is intentionally scoped to `Dog` and `Cat` for RA 9482 vaccination tracking. We also enforce mandatory photo uploads on both frontend and backend so empty/unverifiable reports cannot enter the queue.

---

## 4. AI-Based Pet Matching and Identification

**Panelist's Question:**  
Be honest: you mention AI in your system, but when I look at how Lost & Found and Related Report matching actually work, it's mostly rule-based filtering on species, breed, color, and distance. Why call it AI-based matching?

**Suggested Answer:**  
We use a hybrid, **human-in-the-loop** approach. Our core matching engine (`lost_found_matching.py`) and Related Report detection are deliberately **rule-based**—filtering strictly by species, normalized breed, partial color overlap, size, Haversine distance, and time window—because deterministic rules are explainable and predictable. Meanwhile, AI vision (`ai_jobs` and `ai_vision_comparisons`) is used strictly as **advisory support** (such as suggesting animal type, dominant color, or risk signals), never as the final decision-maker.

**Possible Follow-up Question:**  
If AI is only advisory and Related Report matching even removed AI scoring, why include AI at all instead of removing it completely?

**Stronger Defense:**  
Advisory AI still helps speed up initial intake by pre-filling or suggesting visual attributes (color, coat pattern, risk indicators) and flagging photo-description mismatches for the Administrator to check. However, we deliberately restricted AI from ever auto-confirming pet ownership or auto-issuing warnings—because a false positive in animal identification can wrongly accuse a resident or misroute an injured animal. That is why we built **Possible Pet Owner Verification** ("Is this your pet?" side-by-side comparison) requiring explicit human confirmation.

---

## 5. QR Code Generation and Scanning

**Panelist's Question:**  
What stops someone from scanning a pet's QR code 50 times in a row to spam the owner with fake "found" notifications, or scraping the public `/t/<token>` page to harvest resident information?

**Suggested Answer:**  
Two protections are built in: first, the public `/t/<token>` page strictly uses an allow-list that **masks the owner's house address and personal email**, exposing only safe pet/vaccination details and the finder submission form. Second, we enforce a **60-minute per-tag scan cooldown** (using `pet_tags.last_scanned_at` with database `FOR UPDATE` row locking) alongside API rate limiting (`slowapi`), preventing repeated notification spam.

**Possible Follow-up Question:**  
What if a finder doesn't have mobile data or internet at the exact moment they find the pet? Doesn't a web-based QR code fail offline?

**Stronger Defense:**  
Yes—that is a documented limitation of our QR recovery design. Because `/t/<token>` must fetch masked pet status and submit finder coordinates to our backend API, the finder needs an active internet connection. We chose a dynamic web token over printing raw phone numbers/addresses directly on the collar because static text permanently exposes personal data under RA 10173, whereas a dynamic QR tag lets the owner update pet status (e.g., Lost vs. Safe) and keep private contact details masked.

---

## 6. Lost Pet Reporting and Sightings

**Panelist's Question:**  
In your Lost Pet and Sightings flow, how do you prevent duplicate reports when five neighbors see the same stray dog on the same street and all five submit separate reports?

**Suggested Answer:**  
Residents can submit **sightings** directly onto an existing active Lost Pet alert in Community instead of creating new standalone reports. If separate reports are still filed, the Administrator's **Related Report Review** module automatically flags candidate duplicates using a mandatory species filter plus six conventional attributes (location, breed, color, description, date, and time), allowing the Admin to link or merge them while keeping analytics deduplicated.

**Possible Follow-up Question:**  
What if two neighbors describe the same dog differently—one says "brown askal" and another says "tan medium dog"? Won't your strict breed matching miss that duplicate?

**Stronger Defense:**  
That is a valid trade-off. In our matching rules, we enforce strict normalized breed matching to avoid false positives, while using **partial color overlap** (set intersection) and **Haversine distance + time proximity** to still surface nearby candidates when breed is unspecified or varies. Ultimately, because the system is human-in-the-loop, the Subdivision Administrator reviews the map pins and side-by-side photos in Related Reports before deciding whether to link or treat them as separate incidents.

---

## 7. Resident and Subdivision Leader Roles

**Panelist's Question:**  
In your earlier documentation, you listed three authenticated roles (Resident, Subdivision Leader, System Admin), yet your live system only has two active UI portals: the Resident App and the Subdivision Admin Portal. Why the inconsistency, and what happens if a Subdivision Leader abuses their power—who audits them?

**Suggested Answer:**  
In the live system, Subdivision Leader and Subdivision Administrator workflows were consolidated into one unified **Subdivision Administrator Portal** (`/`) so frontline leaders don't have to switch portals between triage, warnings, and analytics, while **Residents** use `/resident-app` (or the Android APK). Every sensitive Admin action—assessment changes, warning letters, external referrals, and case closures—is recorded in append-only **`audit_logs`** and case history timelines.

**Possible Follow-up Question:**  
If the Subdivision Leader has full access to the Admin Portal, including `/analytics` and `/settings`, is there a separate Super-Admin role in the UI to inspect `audit_logs` or override a corrupt Leader?

**Stronger Defense:**  
Right now, the active `update` / `vitzupdates` branch focuses on the two-portal subdivision workflow (`role_id = 1` Resident and `role_id = 2` Subdivision Leader), while `audit_logs` are persisted in the database as an append-only accountability trail. A dedicated external Barangay or Super-Admin oversight portal is outside the current subdivision-level scope—cases requiring outside authority are handed over through documented **External Referrals**. We clearly note this single-subdivision governance boundary in our Scope and Delimitation.

---

## 8. Report Verification and Duplicate Detection

**Panelist's Question:**  
You require a photo for every report and pet registration. What if an incident happens quickly—like an aggressive dog chasing a child—and the resident couldn't take a photo in time? Doesn't mandatory photo upload block real emergency reports?

**Suggested Answer:**  
We made photo upload mandatory in the reporting wizard (`ReportWizardPage`) and backend API to prevent prank/empty reports and to give Subdivision Admins visual evidence for triage, matching, and external referrals. However, we recognize that in fast-moving emergencies, a resident may not capture a clear shot—in that situation, they can still upload any available context photo or contact the subdivision/barangay directly for immediate physical response.

**Possible Follow-up Question:**  
What about fake or AI-generated photos, or someone uploading an old photo from last year as a "new" safety threat?

**Stronger Defense:**  
STRAY-SAFE does not blindly trust any uploaded photo: every report enters at the `reported` stage and must pass human **Structured Assessment** (`under_review`) by the Subdivision Administrator, who can mark a report as a false alarm or request more information via 1-to-1 messaging before issuing warnings or external referrals. Advisory AI photo checks also assist by flagging mismatches between the photo and the written description.

---

## 9. System Security and Data Privacy

**Panelist's Question:**  
You cite the Data Privacy Act of 2012 (RA 10173), yet your system stores user names, emails, addresses, GPS coordinates, and pet photos. If someone steals a JWT token or guesses an API endpoint, what actually protects resident data?

**Suggested Answer:**  
Passwords are never stored in plain text—they are hashed with **`bcrypt`**. Authentication uses **`HS256` JWT tokens** with 60-minute expiration (`ACCESS_TOKEN_EXPIRE_MINUTES = 60`) and server-side token revocation via the **`revoked_tokens` (`jti`)** table on logout. Resident registration requires **email OTP verification**, endpoints enforce role-based access (`role_id`) and subdivision scoping, and public QR scans (`/t/<token>`) expose only masked allow-listed fields.

**Possible Follow-up Question:**  
If your backend is exposed over a tunnel or HTTP in development, or if a user stays logged in on a shared device, how do you handle session expiry, rate limiting, and sensitive neighbor complaints?

**Stronger Defense:**  
In production/Android builds, our build guard (`androidApiUrl.ts`) blocks plain-HTTP backend URLs and requires HTTPS. Login and public endpoints are protected by **`slowapi` rate limiting** against brute-force attacks. For sensitive neighbor complaints (`is_sensitive = 1`), the backend redacts private complainant/assessment details from public views and exposes them only to authorized Subdivision Administrators, while `RevokedToken` ensures logged-out tokens cannot be reused.

---

## 10. Technical Architecture and Implementation

**Panelist's Question:**  
Why did you build with FastAPI + MySQL + React + Capacitor Android instead of a simpler stack like Firebase or pure PHP/Laravel, and how did you handle database schema evolution without breaking existing data?

**Suggested Answer:**  
We chose **FastAPI (Python)** for clean, typed REST endpoints and easy integration with Python services (QR generation, matching logic, AI checks), **MySQL** for relational integrity across 70 normalized tables, **React + TypeScript + Vite** for a responsive web UI, and **Capacitor** so the exact same Resident codebase runs natively on Android with camera and FCM push notifications. Schema updates are managed through additive SQL files in `backend/migrations/` plus startup schema verification guards (`require_complaint_schema`).

**Possible Follow-up Question:**  
During your own development, you hit database startup errors when `migrations/*.sql` weren't applied before `uvicorn` started. Doesn't that show fragile deployment coupling between SQLAlchemy `create_all()` and manual SQL migrations?

**Stronger Defense:**  
Yes—that was a real lesson we uncovered. Because certain tables (like `enforcement_steps` and new `reports` columns) are managed by additive SQL migrations in `backend/migrations/` while other tables use `Base.metadata.create_all()`, running an incomplete base dump causes startup `ComplaintSchemaMissing` checks to intentionally fail fast rather than silently run with a broken schema. To resolve this, we synchronized our master initialization script (`Database3.4_subdivision.sql`) with all 70 tables and columns, and documented the exact migration order.

---

## 11. System Limitations and Constraints

**Panelist's Question:**  
What are the three biggest technical or operational limitations of STRAY-SAFE 2.0 right now that you have NOT solved?

**Suggested Answer:**  
First, **internet and third-party dependency**: Leaflet map tiles, Cloudinary image hosting, email OTP/SMTP, and QR scan notifications all require active internet connectivity—there is no full offline queue. Second, **single-subdivision scope**: operational triage is built around Selera Homes Subdivision, and external agencies (Barangay, Veterinarians, Animal Control) receive documented External Referrals rather than logging into a separate live Barangay portal. Third, **initial adoption**: QR recovery depends on residents registering their pets and finders noticing and scanning the collar tag.

**Possible Follow-up Question:**  
If there is no Barangay portal in this version, why do some older files in your repository still mention `Barangay_Staff` pages? Isn't your codebase carrying dead or legacy code?

**Stronger Defense:**  
Those legacy files (`pages/Barangay_Staff/`, `pages/citizen/`) remain in the repository from an earlier prototype architecture before the capstone was refocused and consolidated onto the two live portals (`admin/` and `resident/`). In our live router (`main.tsx`), only the Subdivision Admin Portal (`/`) and Resident App (`/resident-app`) are active, and all external handoffs use the **Multi-Organization External Referral** workflow under Case Actions and Settings → External Coordination.

---

## 12. ISO/IEC 25010:2023 Software Quality Evaluation

**Panelist's Question:**  
You used ISO/IEC 25010:2023 with a 4-point Likert scale and no neutral midpoint. Isn't forcing evaluators to choose Agree or Disagree biasing your results upward? And why evaluate *Maintainability* and *Security* using a survey instead of actual code metrics or penetration tests?

**Suggested Answer:**  
We chose a 4-point forced-choice scale (`4 = Strongly Agree` to `1 = Strongly Disagree`) deliberately so IT Experts commit to an affirmative or negative technical judgment rather than defaulting to "Neutral." Regarding Maintainability and Security, the questionnaire measures **expert perception** after inspecting our architecture, modular service layer, RBAC, bcrypt/JWT controls, and live demonstrations—it is complemented by build checks (`tsc -b && vite build`), Python compilation/unit tests, and integration checks, not used as a substitute for penetration testing.

**Possible Follow-up Question:**  
In ISO/IEC 25010:2023, *Usability* was renamed to *Interaction Capability* and *Portability* was updated to *Flexibility*. Did you actually align your items to the 2023 edition, or did you just copy a 2011 template and change the year?

**Stronger Defense:**  
We explicitly aligned our instrument to the **ISO/IEC 25010:2023** nine-characteristic model: **Interaction Capability** (covering Appropriateness Recognizability, Learnability, Operability, and User Error Protection), **Flexibility** (covering Adaptability across web/Android, 5 report types, and 3 animal types, plus Installability/Scalability), and **Safety** (routing dangerous/injured animal reports to Admins and external partner agencies rather than encouraging direct resident confrontation).

---

## 13. Research Methodology and Testing

**Panelist's Question:**  
In your methodology, if your evaluators only test the system using seeded demo accounts in a controlled session, how can you claim the system works reliably under real subdivision conditions?

**Suggested Answer:**  
Our evaluation combines **functional end-to-end testing** (live Resident Web/Android APK + Admin Portal + Public QR scan) with **IT Expert evaluation** (ISO/IEC 25010:2023 & TAM) and **automated backend/frontend test checks**. We acknowledge that controlled pilot testing does not replicate months of high-volume production traffic, which is why our Scope frames this as a pilot-ready capstone evaluation for Selera Homes Subdivision rather than a city-wide deployment.

**Possible Follow-up Question:**  
What specific failure scenarios did you test—for instance, slow mobile data, duplicate button taps, or invalid GPS coordinates outside Selera Homes?

**Stronger Defense:**  
We explicitly designed and tested for those conditions: (1) **Duplicate submission protection** via `client_request_id` idempotency keys on reports, sightings, messages, and case alerts; (2) **Geofence validation** blocking coordinates outside the configured Selera Homes polygon/radius; (3) **Client-side image resizing** (`media.ts`) shrinking photos over 2.5 MB before upload to reduce mobile data failures; and (4) **Error recovery** states when the backend is unreachable.

---

## 14. System Effectiveness and Practicality

**Panelist's Question:**  
At the end of the day, can a typical subdivision HOA officer—who is not tech-savvy—actually use this system every day without an IT developer beside them?

**Suggested Answer:**  
Yes, for day-to-day operations: the Admin Portal uses plain-language labels, a prioritized **Attention Queue** on the Dashboard, pre-seeded **Warning Letter Templates** with automatic placeholder filling, and guided action dialogs (`ActionsTab`) with mobile-friendly `44px` touch targets. However, initial server hosting, `.env` configuration (MySQL, Cloudinary, SMTP, Firebase), and Android APK builds do require technical setup, which we documented in `setup.md` and `ANDROID_RESIDENT_APP.md`.

**Possible Follow-up Question:**  
If your free Cloudflare Quick Tunnel changes URL every restart and Cloudinary/SMTP depend on external accounts, how sustainable is this for a small HOA with little or no IT budget?

**Stronger Defense:**  
`trycloudflare.com` is strictly for **local capstone testing and demoing**—not production deployment. For real HOA deployment, the backend would be hosted on a single fixed HTTPS domain/VPS (or a named Cloudflare Tunnel with a custom domain), while Cloudinary's free tier and standard SMTP/Gmail app passwords cover small-subdivision traffic at near-zero cost. Separating **Debug builds** (which allow changing the backend URL on-device) from **Production Android builds** (which lock to one HTTPS domain) makes long-term HOA use practical and maintainable.
