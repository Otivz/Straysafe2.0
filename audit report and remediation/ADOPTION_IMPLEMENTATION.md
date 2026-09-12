# StraySafe 2.0 — Adoption Feature Implementation Guide

> **Purpose:** Step-by-step implementation guide for the Holding Facility to Public Adoption Portal pipeline (Feature #2 from RECOMMENDED_FEATURES.md).
> **Approach:** 4 phases, ordered by dependency. Each phase is independently deployable.
> **Estimated total effort:** ~3-5 hours of sessions with Antigravity + your review time
> **Last Updated:** 2026-09-12

---

## Business Rules (Decided — Do Not Change Without Review)

> [!IMPORTANT]
> These rules are finalized. All implementation must conform to them exactly.

### Time Periods

| Period | Duration | What Happens |
|:---|:---|:---|
| **Impound / Grace Period** | 7 days from `intake_date` | Animal is held. Owner can claim anytime. No adoption listing allowed yet. |
| **For Adoption window** | No hard deadline | Once promoted, stays listed until adopted, transferred, or staff removes it. |
| **Staff reminder alert** | After 21 days in status=6 with no applications | System (or nightly job) flags the animal so staff can re-evaluate. |
| **Post-approval pickup window** | No hard system deadline | Staff manually coordinate pickup. No auto-cancellation. |

---

### Owner Claim Rules

**While animal is in status 1–2 (Impound Period — 7 days):**
- ✅ Owner can claim at any time. No proof required (staff discretion).
- Setting `facility_status=3` (Claimed) discharges the animal.

**While animal is listed "For Adoption" (status=6):**
- ✅ Owner CAN still come forward and claim the animal.
- **Proof required:** Owner must provide vet records, registration documents, or photos as evidence.
- Staff reviews the claim on a case-by-case basis.
- If verified: `facility_status` reverts to `3` (Claimed), all Pending adoption applications are cancelled with a notification ("Animal has been claimed by its owner."), and the animal is removed from the catalog.
- This action is logged in the HoldingTimeline as `event_type='owner_claim_reversal'`.

**Once animal is fully adopted (status=7 — physically handed over):**
- ❌ The adoption is **legally final**. The system cannot reverse it.
- The system **actively maintains a Custody Trail** for every animal — staff can look up exactly where any animal went at any time (see Custody Trail section below).
- If an original owner comes forward, staff use the **"Late Owner Claim"** action in the system (not a manual process):
  1. Staff opens the animal's Custody Trail page
  2. Staff clicks **"Log Late Owner Claim"** → a modal opens
  3. Staff records: owner's name, contact number, date of claim, and any proof provided
  4. The system logs this in HoldingTimeline as `event_type='late_owner_claim'`
  5. The system reveals the **adopter's name and contact number only** (never home address) on screen — staff reads this out to the owner or prints a slip
  6. Admin receives an in-app notification of the late claim event for records
- The system **never exposes the adopter's home address** to any third party — contact number only.
- No reversal of the adoption. The owner contacts the adopter privately if they wish.

> [!CAUTION]
> The adopter's home address (from the adoption application) must **NEVER** be shown on the Late Owner Claim screen. Only name + contact number. This is enforced at the API response level — the `GET /adoptions/late-claim-info/{holding_id}` endpoint returns only `adopter_name` and `adopter_contact_no`.

---

### Custody Trail — System Requirement (Core Feature)

> [!IMPORTANT]
> The Custody Trail is **not optional**. Every animal that passes through the system must have a complete, searchable record of everywhere it has been and who currently has it.

The system must track and display the following for every animal:

| Stage | What is Recorded | Stored In |
|:---|:---|:---|
| Original sighting | GPS coordinates, landmark, date, reporting citizen | `reports` table |
| Subdivision facility intake | Facility name, intake date, staff name | `holding_timeline` (event_type='intake') |
| Barangay facility transfer | Facility name, transfer date, staff name | `holding_timeline` (event_type='transfer') |
| Medical treatments | Treatment description, date, staff | `holding_timeline` (event_type='medical') |
| Listed for adoption | Date promoted, staff who promoted | `holding_animals.promoted_at` + `holding_animals.promoted_by` |
| Owner claim (if occurred) | Claim date, owner name (manual entry by staff) | `holding_timeline` (event_type='owner_claim_reversal') |
| Adoption approved | Date, approving authority name and role | `adoptions.reviewed_at` + `adoptions.reviewer_role` |
| Late owner claim attempt | Owner name, contact, date, proof description | `holding_timeline` (event_type='late_owner_claim') |

**Who can see the full Custody Trail:**
- Subdivision Leader (own subdivision animals)
- Barangay Head Officer (all animals in their barangay)
- Admin (all animals)

**What the public sees at `/adopt/journey/:id`:**
- Location pins on a Leaflet map (sighting → facilities → adopted)
- Dates and facility names only
- Adopter shown as first name + last initial only (e.g. "Juan D.")
- No personal contact info, no home address

**New endpoint required for late claim info:**
```
GET /adoptions/late-claim-info/{holding_id}
Auth: Staff / Admin only
Returns: { adopter_name, adopter_contact_no }
NEVER returns: address, living_space, reason, or any other application field
```

---

### Application Rules

| Rule | Decision |
|:---|:---|
| Duplicate application (same resident, same animal, status=Pending) | ❌ Blocked — 400 error |
| Resident applies for multiple **different** animals simultaneously | ✅ Allowed — no limit |
| Application auto-expiry | None — applications stay Pending until staff acts |
| When one application is Approved | All other Pending applications for the **same animal** are auto-Rejected with message "Another applicant was approved." |
| When owner claims a For Adoption animal | All Pending applications for that animal are auto-Cancelled with message "Animal has been claimed by its owner." |

---

### Adoption Reversal / Edge Cases

| Scenario | System Behavior | Custody Trail Entry |
|:---|:---|:---|
| Adopter approved but never picks up | Staff cancels approval via UI, re-lists animal (`facility_status` → 6). No auto-cancellation. | `event_type='adoption_cancelled'` in holding_timeline |
| Animal dies while listed For Adoption | Staff sets `facility_status=4` (Deceased). All Pending apps auto-cancelled with notification. | `event_type='outcome'` logged |
| Animal transferred while For Adoption | Staff sets `facility_status=5` (Transferred). All Pending apps auto-cancelled with notification. | `event_type='transfer'` logged with destination facility |
| Admin removes from catalog (no reason) | `facility_status` reverts to `2` (Healthy). All Pending apps cancelled. | `event_type='status_change'` logged |
| Original owner claims while For Adoption | `facility_status` → 3 (Claimed). All Pending apps cancelled. Removed from catalog. | `event_type='owner_claim_reversal'` logged with proof description |
| Original owner shows up post-adoption | Adoption legally final. Staff logs Late Owner Claim. System shows adopter contact number only. | `event_type='late_owner_claim'` logged with owner details |

---

### Transfer Behavior — What Already Exists vs. What Needs Attention

> [!NOTE]
> Transfers between facilities are **already partially implemented** in [`holding.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/holding.py). The adoption feature must work correctly with this existing logic.

**What is already built:**

| Feature | Location in Code |
|:---|:---|
| `facility_status=5` ("Transferred") exists in the DB | `facility_status` table |
| Setting status→5 auto-sets `discharge_date` and logs `event_type='outcome'` | `holding.py` PATCH endpoint, lines 470–493 |
| System detects transfer events from `HoldingTimeline` entries with "transfer" or "barangay" in the title/notes | `holding.py` `_populate()`, lines 141–148 |
| Calculates how long an animal was at Subdivision vs Barangay facility separately | `holding.py` `_populate()`, lines 112–214 |
| Subdivision Leaders are **blocked from editing** animals once they are in a Barangay facility | `holding.py` PATCH + timeline endpoints, lines 444–460 |

**Critical conflict the adoption feature must resolve:**

> [!CAUTION]
> `RESOLVED_STATUSES = {3, 4, 5}` in `holding.py` line 28 treats `facility_status=5` (Transferred) as a **discharged/closed case**. This means if an animal is transferred to a Barangay facility (status=5) and the Barangay staff later wants to promote it to adoption, the adoption feature must handle this transition explicitly.

**The post-transfer adoption path (must be implemented):**

```
Animal transferred to Barangay facility
  → facility_status = 5 (Transferred — currently treated as RESOLVED)
  → Barangay Head Officer updates status back to 2 (Healthy) after receiving the animal
  → Barangay Head Officer then promotes to adoption → facility_status = 6
```

- The adoption `_can_manage_adoption()` helper must NOT be blocked by the animal's current `facility_status` — it checks `report.subdivision_id` and the current user's jurisdiction, not the status
- The promote endpoint must accept animals with `facility_status=2` regardless of transfer history

**How the custody trail handles transfers:**

The journey map reads `holding_timeline` entries for location data. For the transfer pin to have GPS coordinates on the map, staff **must** select the destination facility (a `Landmark`) when logging the transfer — not just write a text note. The implementation must:

- [ ] Remind staff to select a `facility_id` on the timeline entry when logging a transfer
- [ ] The `POST /holding/{id}/timeline` endpoint already accepts a `facility_id` indirectly via `StatusHistory`, but the adoption journey endpoint must explicitly read `HoldingTimeline` entries where `event_type='transfer'` **and** a linked `Landmark` with valid `latitude/longitude` exists
- [ ] If no `facility_id` is linked on the transfer event, the journey map shows a text-only pin with no map coordinates (graceful fallback — no crash)

## Key Design Decisions (Read First)

> [!IMPORTANT]
> These three decisions define the core behavior of the adoption feature. Read before implementing.

### 1. Approval Authority is Role + Jurisdiction Based

Adoption approval follows the same jurisdiction model used throughout StraySafe — it is NOT exclusively Barangay Staff.

| Scenario | Who Can Approve |
|:---|:---|
| Original report is under a **Subdivision** | **Subdivision Leader** (role_id=2) of that subdivision |
| Report is escalated to **Barangay level** or held at a Barangay facility | **Barangay Head Officer** only (role_id=3 AND is_head_officer=True) |
| Any case | **Admin** (role_id=4) always has full access |
| Regular Barangay Staff (is_head_officer=False) | View-only — cannot approve or promote |

**Backend jurisdiction check helper:**
```python
def _can_manage_adoption(current_user: User, animal: HoldingAnimal, db: Session) -> bool:
    if current_user.role_id == 4:
        return True  # Admin
    report = db.query(Report).filter(Report.report_id == animal.report_id).first()
    if not report:
        return False
    if current_user.role_id == 3 and current_user.is_head_officer:
        return report.subdivision.barangay_id == current_user.barangay_id
    if current_user.role_id == 2:
        return report.subdivision_id == current_user.subdivision_id
    return False  # Regular Barangay Staff — denied
```

**Frontend routes (separate pages per role):**
- /subd/adoptions — Subdivision Leader adoption management (NEW)
- /brgy/adoptions — Barangay Head Officer adoption management (NEW); regular staff see read-only view

---

### 2. Catalog Listing Must Show Contact Information

Each card on the public /adopt catalog page displays:

| Field | Source |
|:---|:---|
| Intake Staff Name | users.name via holding_animals.intake_staff_id |
| Intake Staff Phone | users.phone via holding_animals.intake_staff_id |
| Facility Name | landmarks.name via report.facility_id or HoldingTimeline |
| Facility Contact | barangays.contact_no |
| Managing Unit | subdivision_name or barangay_name |

This lets residents call the facility or intake staff before submitting an application.

---

### 3. Animal Journey Map — Full Trail with New Owner Info

After adoption (facility_status=7), a Leaflet map page at /adopt/journey/:holding_id shows every location in the animal's life:

| Pin Color | Location | Detail Shown |
|:---|:---|:---|
| Red | Original sighting | Address/landmark, date reported |
| Orange | Subdivision holding facility | Facility name, intake date |
| Blue | Barangay holding facility (if transferred) | Facility name, transfer date |
| Green | Adopted | "Adopted by Juan D. on Sep 10" (public) / Full name + address (staff only) |

**Privacy rule for the green pin:** Public view shows first name + last initial only. Staff/Leader view shows full adopter name and address. No GPS coordinates for the adopter's home.

**New endpoint required:** GET /adoptions/journey/{holding_id}

---

## Feature Overview

Animals in the holding facility unclaimed after 7 days are promoted to a public Adoption Catalog. Residents browse and apply. Approval authority depends on jurisdiction.

`mermaid
graph TD
    A[Stray Picked Up] --> B[Holding Facility - status 1 or 2]
    B --> C{Claimed in 7 days?}
    C -- Yes --> D[Claimed - status 3]
    C -- No --> E[Grace Period Expires]
    E --> F{Jurisdiction?}
    F -- Subdivision report --> G1[Subd Leader promotes - status 6]
    F -- Barangay level --> G2[Brgy Head Officer promotes - status 6]
    G1 --> H[Public Catalog /adopt - shows contact info]
    G2 --> H
    H --> I[Resident applies - POST /adoptions/apply]
    I --> J{Who reviews?}
    J -- Subdivision --> K1[Subd Leader - /subd/adoptions]
    J -- Barangay --> K2[Brgy Head Officer - /brgy/adoptions]
    K1 --> L{Decision}
    K2 --> L
    L -- Approve --> M[Adopted - status 7 + Journey Map updated]
    L -- Reject --> N[Stays in catalog]
    M --> O[Notification to Adopter]
    M --> P[Journey Map at /adopt/journey/:id]
`

---

## Current State

| Component | Status | Notes |
|:---|:---|:---|
| holding_animals table | EXISTS | Has facility_status FK, intake_staff_id, report relation |
| facility_status table | EXISTS | 1=Need Treatment 2=Healthy 3=Claimed 4=Deceased 5=Transferred |
| adoptions table | MISSING | Must be created |
| facility_status 6 For Adoption | MISSING | Append as status_id=6 |
| facility_status 7 Adopted/Released | MISSING | Append as status_id=7 |
| Backend route adoptions.py | MISSING | Must be created |
| Jurisdiction-based approval logic | MISSING | Subd Leader OR Brgy Head Officer |
| Contact info in catalog response | MISSING | intake_staff phone, facility name, managing unit |
| Animal Journey Map endpoint | MISSING | GET /adoptions/journey/:id |
| Frontend /adopt catalog page | MISSING | Must include contact info display |
| Frontend /adopt/journey/:id map | MISSING | Leaflet map with journey pins |
| Frontend /subd/adoptions page | MISSING | Subdivision Leader management |
| Frontend /brgy/adoptions page | MISSING | Head Officer only for actions |
| Promote to Adoption button | MISSING | In holding facility UI, jurisdiction-gated |

> [!IMPORTANT]
> /brgy/adoptions is restricted to is_head_officer=True. Regular Barangay Staff (is_head_officer=False) see a read-only view with a notice banner.

---

## Progress Tracker

| Phase | Tasks | Status |
|:---|:---|:---|
| Phase 1 - Database | DB-1, DB-2 | Not started |
| Phase 2 - Backend API | API-1 thru API-5 | Not started |
| Phase 3 - Frontend | FE-1 thru FE-7 | Not started |
| Phase 4 - Automation | AUTO-1 thru AUTO-3 | Not started |

---

## Phase 1 - Database Schema (~15 min)

### Task DB-1 - Add New Facility Statuses and Adoptions Table

**Est:** ~10 min

- [ ] **1.** Add two new facility_status rows in MySQL:
  ```sql
  INSERT INTO facility_status (status_id, status_name) VALUES
      (6, 'For Adoption'),
      (7, 'Adopted/Released');
  ```

- [ ] **2.** Create the adoptions table:
  ```sql
  CREATE TABLE adoptions (
    adoption_id     INT NOT NULL AUTO_INCREMENT,
    holding_id      INT NOT NULL,
    applicant_id    INT NOT NULL,
    status          ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    full_name       VARCHAR(150) NOT NULL,
    address         TEXT NOT NULL,
    contact_no      VARCHAR(20) NOT NULL,
    has_other_pets  TINYINT(1) NOT NULL DEFAULT 0,
    living_space    ENUM('House with yard','Apartment','Condo','Other') NOT NULL DEFAULT 'House with yard',
    reason          TEXT NOT NULL,
    reviewed_by     INT DEFAULT NULL,
    reviewer_role   ENUM('Subdivision Leader','Barangay Head Officer','Admin') DEFAULT NULL,
    review_notes    TEXT DEFAULT NULL,
    reviewed_at     DATETIME DEFAULT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (adoption_id),
    CONSTRAINT fk_adoption_holding   FOREIGN KEY (holding_id)   REFERENCES holding_animals (holding_id) ON DELETE CASCADE,
    CONSTRAINT fk_adoption_applicant FOREIGN KEY (applicant_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_adoption_reviewer  FOREIGN KEY (reviewed_by)  REFERENCES users (user_id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  ```
  Note: reviewer_role records which authority level approved — used in the journey map display and audit log.

- [ ] **3.** Add columns to holding_animals for catalog and journey tracking:
  ```sql
  ALTER TABLE holding_animals
    ADD COLUMN adoption_catalog_notes TEXT DEFAULT NULL AFTER medical_notes,
    ADD COLUMN promoted_at            DATETIME DEFAULT NULL AFTER adoption_catalog_notes,
    ADD COLUMN promoted_by            INT DEFAULT NULL AFTER promoted_at,
    ADD CONSTRAINT fk_ha_promoted_by FOREIGN KEY (promoted_by) REFERENCES users (user_id) ON DELETE SET NULL;
  ```

Verify: SHOW TABLES shows adoptions. SELECT from facility_status shows 7 rows. DESCRIBE holding_animals shows new columns.

---

### Task DB-2 - Add SQLAlchemy Models

**Est:** ~5 min
**File:** backend/app/models/report.py - append after HoldingTimeline class

- [ ] **1.** Add Adoption model to backend/app/models/report.py
- [ ] **2.** Update HoldingAnimal model - add adoption_catalog_notes, promoted_at, promoted_by fields
- [ ] **3.** Add reviewer_role field to the Adoption model (Enum: Subdivision Leader / Barangay Head Officer / Admin)

Verify: from app.models.report import Adoption prints adoptions as the tablename.

---

## Phase 2 - Backend API (~1 hour)

### Task API-1 - Create Pydantic Schemas

**Est:** ~10 min
**File:** Create backend/app/schemas/adoption.py [NEW]

Key schemas to create:

**AdoptionApplyRequest** - holding_id, full_name, address, contact_no, has_other_pets, living_space, reason

**AdoptionReviewRequest** - decision (Approved/Rejected), review_notes

**AdoptionResponse** - full adoption record including reviewer_role

**CatalogAnimalResponse** - public-safe animal profile including:
- intake_staff_name, intake_staff_contact (staff phone)
- facility_name, facility_contact (barangay contact_no)
- managing_unit (subdivision or barangay name)
- sighting_lat, sighting_lng (for initial journey map pin)

**JourneyPin** - label, description, latitude, longitude, date, pin_color

**AnimalJourneyResponse** - full journey including:
- pins list (ordered chronologically)
- is_adopted flag
- adopter_name_public (first name + last initial only for public)
- adopter_date, adopter_area (general area only - no exact address for public)

**PromoteToAdoptionRequest** - adoption_catalog_notes

Verify: from app.schemas.adoption import CatalogAnimalResponse resolves without error.

---

### Task API-2 - Create the Adoptions Router

**Est:** ~25 min
**File:** Create backend/app/routes/adoptions.py [NEW]

**Endpoint Summary:**

| Method | Path | Auth | Who Can Call |
|:---|:---|:---|:---|
| GET | /adoptions/catalog | Public | Anyone |
| GET | /adoptions/catalog/{holding_id} | Public | Anyone |
| GET | /adoptions/journey/{holding_id} | Optional | Public (partial data); Staff (full adopter info) |
| POST | /adoptions/promote/{holding_id} | Required | Subd Leader (own subd) / Brgy Head Officer / Admin |
| POST | /adoptions/apply | Required | Resident (role_id=1) |
| GET | /adoptions/my-applications | Required | Resident (own only) |
| GET | /adoptions/applications | Required | Subd Leader (own subd) / Brgy Head Officer / Admin |
| PUT | /adoptions/review/{adoption_id} | Required | Subd Leader (own subd) / Brgy Head Officer / Admin |

**Key business rules:**

- [ ] **1.** All promote and review actions must call _can_manage_adoption() - returns False for regular Barangay Staff (is_head_officer=False)

- [ ] **2.** GET /adoptions/catalog must populate contact info fields on each animal:
  - intake_staff_name and intake_staff_contact from animal.intake_staff.name and .phone
  - facility_name from Landmark via report.facility_id or HoldingTimeline
  - facility_contact from barangay.contact_no
  - managing_unit: subdivision_name if subdivision-managed, else barangay_name
  - sighting_lat and sighting_lng from report.latitude and .longitude

- [ ] **3.** GET /adoptions/journey/{holding_id} builds ordered pins:
  - Pin 1 (red) - Original sighting: report.latitude/longitude, report.landmark, report.created_at
  - Pins 2+ (orange/blue) - Facility moves from HoldingTimeline intake/transfer events with facility coords from Landmark
  - Final pin (green) - Adoption: no GPS coords (privacy), adopter name redacted for public, full for staff

- [ ] **4.** Public vs staff data for journey endpoint:
  - No token or Resident token: adopter shown as "Juan D." (first name + last initial), area shown as last part of address only
  - Subdivision Leader / Barangay Staff / Admin token: full adopter name and full address shown

- [ ] **5.** PUT /adoptions/review - on Approved:
  - Set facility_status=7 and discharge_date=now() on HoldingAnimal
  - Auto-reject all other Pending applications for same holding_id
  - Record reviewer_role (Subdivision Leader / Barangay Head Officer / Admin)

- [ ] **6.** GET /adoptions/applications - filter by jurisdiction:
  - Subdivision Leader: only applications for animals where report.subdivision_id == user.subdivision_id
  - Barangay Head Officer: only applications for animals in their barangay
  - Admin: all applications

Verify: GET /adoptions/catalog returns 200 with contact info fields. GET /adoptions/journey/999 returns 404.

---

### Task API-3 - Register the Router in main.py

**Est:** ~2 min
**File:** backend/app/main.py

- [ ] Add import: from app.routes import adoptions
- [ ] Register after the holding router: app.include_router(adoptions.router)

Verify: GET /docs shows /adoptions/* endpoints in Swagger UI.

---

### Task API-4 - Add Optional Auth Helper

**Est:** ~5 min
**File:** backend/app/utils/auth.py

The journey endpoint needs optional auth - public access returns redacted data; staff token returns full adopter details.

- [ ] **1.** Add get_optional_user dependency if not already present:
  ```python
  def get_optional_user(request: Request, db: Session = Depends(get_db)) -> Optional[User]:
      try:
          token = request.headers.get("Authorization", "").replace("Bearer ", "")
          if not token:
              return None
          return get_current_user_from_token(token, db)
      except Exception:
          return None
  ```

Verify: GET /adoptions/journey/{id} works without auth token (partial data) and with staff token (full adopter name).

---

### Task API-5 - Verify Holding List Shows For Adoption Animals

**Est:** ~3 min
**File:** backend/app/routes/holding.py

- [ ] Confirm RESOLVED_STATUSES = {3, 4, 5} (line 28) - status 6 is not in this set so For Adoption animals already appear in staff list. No filter change needed.
- [ ] Add status labels: 6: "For Adoption" and 7: "Adopted/Released" to any label mapping used in response serialization.

Verify: After promoting, animal appears in staff holding list with For Adoption label.

---

## Phase 3 - Frontend (~2.5-3 hours)

### Task FE-1 - Public Adoption Catalog Page (/adopt)

**Est:** ~35 min
**File:** Create frontend/src/pages/citizen/AdoptionCatalog.tsx [NEW]

- [ ] **1.** Page layout: Hero banner + filter bar (All / Dogs / Cats) + responsive card grid

- [ ] **2.** Each card shows:
  - Photo (first report_media item or default paw avatar)
  - Animal name, type, breed, color, size
  - Staff public description (adoption_catalog_notes)
  - **Contact info section (required):**
    - Facility name and contact number
    - Intake staff name and phone
    - Managing unit (e.g. "Selera Homes Subdivision" or "San Vicente Barangay")
  - Two buttons: "View Journey Map" and "Apply to Adopt"

- [ ] **3.** "View Journey Map" navigates to /adopt/journey/:holding_id (public, no login needed)
- [ ] **4.** "Apply to Adopt" navigates to /adopt/apply/:holding_id if logged in; else to /login with return path
- [ ] **5.** Use api.get('/adoptions/catalog') - NOT raw axios
- [ ] **6.** Add route: Route path="/adopt" element={AdoptionCatalog}

Verify: /adopt loads. Each card shows facility name, staff contact info, and both action buttons.

---

### Task FE-2 - Animal Journey Map Page (/adopt/journey/:id)

**Est:** ~40 min
**File:** Create frontend/src/pages/citizen/AnimalJourneyMap.tsx [NEW]

This page is accessible to anyone (no login required) and shows the full location trail of the animal.

- [ ] **1.** Fetch GET /adoptions/journey/:holding_id on mount

- [ ] **2.** Render a Leaflet map with colored pins:
  - Red pin - Original sighting location (with lat/lng from API)
  - Orange pin - Subdivision holding facility (with lat/lng from Landmark)
  - Blue pin - Barangay holding facility if transferred (with lat/lng from Landmark)
  - Green pin - Adopted (no exact GPS - show text popup only: "Adopted by Juan D.")
  - Connect pins with a dashed polyline showing the journey path in order

- [ ] **3.** Below the map show an animal profile + timeline card:
  - Photo, name, type, breed, color
  - Timeline list: each pin as a dated event row
  - Example: "Sep 1 - Spotted at Selera Homes Gate / Sep 2 - Admitted to Subd Facility / Sep 10 - Adopted by Juan D."

- [ ] **4.** Adopted state - show (public version): "Adopted by [First Name L.] on [Date]" and "[General Area]"
- [ ] **5.** Not yet adopted state - show "Looking for a forever home" + "Apply to Adopt" CTA button
- [ ] **6.** Add route: Route path="/adopt/journey/:id" element={AnimalJourneyMap}

Verify: Sighting pin appears at correct coordinates. Pins connect in chronological order. Green pin shows redacted name only for public users.

---

### Task FE-3 - Adoption Application Form (/adopt/apply/:id)

**Est:** ~25 min
**File:** Create frontend/src/pages/citizen/AdoptionApplyForm.tsx [NEW]

- [ ] **1.** Show animal summary at top (fetch GET /adoptions/catalog/:id)
- [ ] **2.** Form fields: Full Name, Home Address, Contact Number, Has other pets (Yes/No radio), Living Space (select), Reason (textarea min 20 chars)
- [ ] **3.** On submit: POST /adoptions/apply - success toast - redirect to /adopt/applications
- [ ] **4.** Add route (Citizen only): Route path="/adopt/apply/:id" - ProtectedRoute allowedRoles=[1]

Verify: Submit form - 201 Created - application visible in my-applications with Pending status.

---

### Task FE-4 - My Adoption Applications (/adopt/applications)

**Est:** ~20 min
**File:** Create frontend/src/pages/citizen/MyAdoptionApplications.tsx [NEW]

- [ ] **1.** Fetch GET /adoptions/my-applications - display list with:
  - Status badge: Pending (amber) / Approved (green) / Rejected (red)
  - Animal name + thumbnail
  - Date submitted
  - Staff review notes (shown when not Pending)
  - "View Journey Map" link for Approved applications

- [ ] **2.** Add route (Citizen only): Route path="/adopt/applications" - ProtectedRoute allowedRoles=[1]
- [ ] **3.** Add "My Adoption Applications" to Resident navigation sidebar

Verify: Application appears after submitting. Status updates after review. Approved shows journey map link.

---

### Task FE-5 - Subdivision Leader Adoption Management (/subd/adoptions)

**Est:** ~40 min
**File:** Create frontend/src/pages/Subd_Leaders/SubdAdoptions.tsx [NEW]

> [!IMPORTANT]
> This is the PRIMARY adoption approval page for most animals. The Subdivision Leader approves/rejects for any animal whose original report was under their subdivision.

- [ ] **1.** Two-tab layout: Applications (filterable Pending/Approved/Rejected) + Catalog (For Adoption animals in their subd)

- [ ] **2.** Applications table columns:
  Animal (name + thumbnail + View Journey link) | Applicant (name, contact_no) | Living Space | Has Other Pets | Reason (truncated) | Date Submitted | Status Badge | Actions (Approve/Reject for Pending)

- [ ] **3.** Approve modal: animal summary + optional review notes textarea + Approve button
- [ ] **4.** Reject modal: optional reason textarea + Reject button (destructive style)
- [ ] **5.** On approval show toast: "Adoption approved. Journey map updated with new owner."

- [ ] **6.** Add route: Route path="/subd/adoptions" - ProtectedRoute allowedRoles=[2]
- [ ] **7.** Add "Adoptions" link to Subdivision Leader sidebar

Verify: Approving sets facility_status=7. Journey map green pin appears. Other Pending apps auto-rejected.

---

### Task FE-6 - Barangay Head Officer Adoption Management (/brgy/adoptions)

**Est:** ~30 min
**File:** Create frontend/src/pages/Barangay_Staff/BrgyAdoptions.tsx [NEW]

> [!IMPORTANT]
> Approve/Reject buttons are ONLY shown to users with is_head_officer=True. Regular Barangay Staff see the list but cannot act.

- [ ] **1.** Same two-tab layout as SubdAdoptions

- [ ] **2.** Gate action buttons on is_head_officer:
  ```typescript
  const canApprove = currentUser.role_id === 3 && currentUser.is_head_officer;
  // Only render Approve/Reject buttons if canApprove is true
  ```

- [ ] **3.** Show a notice banner for non-head-officer staff:
  "You can view adoption applications but only the Head Officer can approve or reject them."

- [ ] **4.** Add route: Route path="/brgy/adoptions" - ProtectedRoute allowedRoles=[3]
- [ ] **5.** Add "Adoptions" to Barangay Staff sidebar (visible to all brgy staff, actions restricted)

Verify: Non-head staff see read-only list with notice banner. Head Officer sees action buttons. 403 from backend if non-head tries to call review endpoint.

---

### Task FE-7 - Promote to Adoption Button in Holding Facility UI

**Est:** ~20 min
**File:** Modify existing Barangay Staff holding facility page

- [ ] **1.** Show button only when all conditions are true:
  ```typescript
  import { differenceInDays } from 'date-fns';
  const daysSinceIntake = differenceInDays(new Date(), new Date(animal.intake_date));
  const canPromote =
    animal.facility_status === 2 &&
    daysSinceIntake >= 7 &&
    (currentUser.role_id === 2 || (currentUser.role_id === 3 && currentUser.is_head_officer) || currentUser.role_id === 4);
  ```

- [ ] **2.** Clicking opens confirmation modal with: animal summary + optional Public Description textarea (adoption_catalog_notes) + Confirm button

- [ ] **3.** On success: animal card shows For Adoption badge. Call POST /adoptions/promote/:holding_id.

Verify: Button only shows for eligible jurisdiction users on eligible animals. After promoting, facility_status = 6.

---

## Phase 4 - Automation and Polish (~30 min)

### Task AUTO-1 - Nightly Auto-Promotion Job (Optional)

**Est:** ~15 min
**File:** Create backend/app/tasks/adoption_auto_promote.py [NEW]

> [!NOTE]
> Manual promotion (FE-7) is sufficient for v1. This optional task auto-promotes Healthy animals at 2AM daily.

- [ ] Install APScheduler: pip install apscheduler
- [ ] Create auto_promote_unclaimed() function that queries HoldingAnimal where facility_status=2 AND intake_date <= 7 days ago, sets facility_status=6 and promoted_at=now()
- [ ] Register with APScheduler at hour=2 minute=0 in main.py lifespan startup

Verify: Set intake_date to 8 days ago with facility_status=2, call function manually - facility_status changes to 6.

---

### Task AUTO-2 - In-App Notification on Approval/Rejection

**Est:** ~10 min
**File:** backend/app/routes/adoptions.py - update review_application endpoint

- [ ] After approving: create Notification for applicant - title "Adoption Approved!" with animal name and pickup instructions
- [ ] After rejecting: create Notification for applicant - title "Adoption Application Update" with review_notes if provided

Verify: Approving an application creates an in-app notification for the resident.

---

### Task AUTO-3 - Add Navigation Links

**Est:** ~5 min

- [ ] Add "Adopt a Pet" to public landing page hero and nav bar
- [ ] Add "Adoptions" to Subdivision Leader sidebar (link: /subd/adoptions)
- [ ] Add "Adoptions" to Barangay Staff sidebar (link: /brgy/adoptions - all brgy staff can view)
- [ ] Add "My Applications" to Resident navigation menu (link: /adopt/applications)

---

## Verification Checklist

- [ ] SELECT from facility_status shows 7 rows including For Adoption (6) and Adopted/Released (7)
- [ ] adoptions table exists with reviewer_role column
- [ ] DESCRIBE holding_animals shows adoption_catalog_notes, promoted_at, promoted_by columns
- [ ] GET /adoptions/catalog (no auth) returns 200 with intake_staff_name, facility_name, managing_unit populated
- [ ] GET /adoptions/journey/{id} (no auth) returns pins; adopter shown as "Juan D." only
- [ ] GET /adoptions/journey/{id} (staff token) returns full adopter name and address
- [ ] Subdivision Leader promotes own-subdivision animal - 200 OK, facility_status=6
- [ ] Regular Barangay Staff (is_head_officer=False) attempts promote - 403 error
- [ ] Animal appears in staff holding facility list after promotion with For Adoption label
- [ ] Resident submits application - 201 Created
- [ ] Duplicate Pending application from same user - 400 error
- [ ] Subdivision Leader approves own-subdivision application - facility_status=7, other Pending apps auto-rejected
- [ ] Non-head Barangay Staff calls review endpoint - 403 error
- [ ] Barangay Head Officer approves escalated animal - facility_status=7
- [ ] Journey map green pin appears after approval
- [ ] Resident receives in-app notification on approval and rejection
- [ ] /adopt catalog shows contact info (staff name, phone, facility, managing unit) on each card
- [ ] /adopt/journey/:id Leaflet map renders with correct colored pins connected by dashed polyline
- [ ] /brgy/adoptions: non-head staff see read-only list with notice banner; head officer sees action buttons
- [ ] /subd/adoptions: Subdivision Leader can approve/reject for their subdivision only

---

## File Change Summary

| Action | File |
|:---|:---|
| MODIFY | Database3.3.txt - Add adoptions DDL (with reviewer_role), 2 new facility_status rows, 3 new holding_animals columns |
| MODIFY | backend/app/models/report.py - Add Adoption model with reviewer_role, update HoldingAnimal |
| NEW | backend/app/schemas/adoption.py - CatalogAnimalResponse with contact info, AnimalJourneyResponse, JourneyPin |
| NEW | backend/app/routes/adoptions.py - Jurisdiction check helper, journey endpoint, optional auth usage |
| MODIFY | backend/app/main.py - Register adoptions router |
| MODIFY | backend/app/utils/auth.py - Add get_optional_user dependency |
| MODIFY | backend/app/routes/holding.py - Add status labels for 6 and 7 |
| NEW | frontend/src/pages/citizen/AdoptionCatalog.tsx - With contact info on each card |
| NEW | frontend/src/pages/citizen/AnimalJourneyMap.tsx - Leaflet map with journey pins |
| NEW | frontend/src/pages/citizen/AdoptionApplyForm.tsx |
| NEW | frontend/src/pages/citizen/MyAdoptionApplications.tsx |
| NEW | frontend/src/pages/Subd_Leaders/SubdAdoptions.tsx - Primary adoption approval page |
| NEW | frontend/src/pages/Barangay_Staff/BrgyAdoptions.tsx - Head Officer only for actions |
| MODIFY | Holding facility staff page - Add Promote to Adoption button (jurisdiction-gated) |
| MODIFY | frontend/src/App.tsx - Add 5 new routes |
| MODIFY | Subdivision Leader sidebar - Add Adoptions link |
| MODIFY | Barangay Staff sidebar - Add Adoptions link |
| MODIFY | Resident navigation - Add My Applications link |
| NEW | backend/app/tasks/adoption_auto_promote.py (optional) |

---

*Based on RECOMMENDED_FEATURES.md Feature #2 - Holding Facility to Public Adoption Portal Pipeline*
*Last Updated: 2026-09-12*
