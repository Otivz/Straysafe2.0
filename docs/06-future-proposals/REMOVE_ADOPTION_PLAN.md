# Remove the adoption feature

- **Status:** in progress (started 2026-10-28). Save point: commit `9be16cc` ("phase 2"), clean working tree.
- **Why:** the capstone panel did not approve adoption (developer, 2026-10-28). Only the Barangay runs adoption, so removing it from the Barangay removes it from the whole system.
- **Decisions (developer, 2026-10-28):** remove it from the whole system (residents can no longer browse or apply; nobody takes it over); **delete the code**, done in verified batches; the local data was already cleared by a database reset (change record `2026-10-28_0921_local-database-reset`; the old data is kept in the backup database `straysafe_backup_20261028`); after the 7-day claim period an unclaimed animal can only be **impounded**, and the hold may be **extended whenever** the Barangay wants (section 4, built separately).

## 1. Inventory (2026-10-28)

- **Backend, adoption only (delete):** routes `adoptions.py` (48 endpoints), `adoption_chat.py`, `adoption_tasks.py`, `adoption_certificates.py`; schemas `adoption.py`, `adoption_tasks.py`; helpers `adoption_assignments.py`, `adoption_authority.py`, `id_security.py` (watermarked ID photos, used only by adoption); 9 models in `models/report.py` (`Adoption`, `AdoptionVerification`, `AdoptionInterview`, `AdoptionHomeVisit`, `AdoptionCertificate`, `AdoptionMonitoringLog`, `AdoptionTimelineLog`, `AdoptionAssignment`, `AdoptionOwnershipHistory`); startup migrations for them in `main.py`; `scripts/migrate_adoption_9_stages.py`.
- **Backend, shared (edit):** `main.py`, `models/report.py` (`HoldingAnimal.adoptions`), `routes/admin.py`, `routes/reports.py`, `routes/pets.py`, `routes/chat.py` (adoption thread branches), `routes/sidebar.py`, `routes/holding.py` ("For Adoption" status), `services/analytics_service.py`, `tasks/unassigned_checker.py` (post-adoption monitoring job), `utils/pet_adoption.py`, `utils/pet_record_access.py`, `utils/push_categories.py`, `schemas/chat.py`, `schemas/pet.py`.
- **Frontend:** about 20 adoption-only files (pages `BrgyAdoptions`, `BrgyAdoptionTasks`, `MyAdoptionApplications`, `AdoptionCatalog`, `AdoptionApplyForm`, `AnimalJourneyMap`, `VerifyAdoptionCertificate`; `components/Adoption/*`, the adoption modals, `AdoptionStageStepper`, `utils/adoptionStatus.ts`, `utils/useAdoptionChatUnread.ts`) and about 40 shared files (routes, sidebars, navbars, landing page, dashboards, holding pages, messages, chat drawer, pet record panel, analytics, settings).
- **Tests:** about 22 backend and 5 frontend test files mention adoption: adoption-only ones are deleted, the others adjusted.
- **Database:** 9 adoption tables (empty after the reset), `holding_animals.adoption_catalog_notes`, `user_notification_preferences.push_adoptions`, chat thread type `Adoption`, holding statuses 6 "For Adoption" and 7 "Adopted/Released".

## 2. Rules for every batch

After each batch: `npx tsc --noEmit -p tsconfig.app.json` clean, the full isolated backend suite green (86 test files before this work, minus deleted adoption tests), and a search for leftover references. If anything that passed before is red, fix it before the next batch. A change record per batch.

## 3. Checklist

### Batch 1: backend

- [x] Unregister the 4 adoption routers in `main.py`; remove the adoption startup migrations and the `migrate_adoption_9_stages` call.
- [x] Delete the 4 route files, 2 schemas, `adoption_assignments.py`, `adoption_authority.py`, `id_security.py`.
- [x] Remove the 9 adoption models and `HoldingAnimal.adoptions`.
- [x] Shared files: drop adoption counts (admin, reports counts, sidebar badge, analytics), the monitoring job, adoption push category and links, adoption chat branches, `pet_adoption` (pets, chat, reports), adoption checks in `pet_record_access`, the "For Adoption" status in holding.
- [x] Delete adoption-only tests; adjust tests that only mention it.

### Batch 2: frontend

- [x] Remove adoption routes, menu entries (sidebars, navbars), the landing-page section and the public catalog.
- [x] Delete the adoption-only pages, components and utilities.
- [x] Shared pages: holding ("For Adoption", "Promote to adoption"), dashboards, messages and chat drawer, pet record panel, analytics, notification settings.
- [x] Delete adoption browser tests and fixtures; adjust the others.

### Batch 3: database and seed

- [x] Remove the 9 adoption tables from `Database3.3.txt` (done 2026-10-28).
- [ ] Drop the 9 adoption tables in the local database (empty). Waiting for the developer's approval.
- [x] Decide what stays harmlessly (status rows 6 and 7 in `facility_status`, `push_adoptions`, the `Adoption` chat thread type) and record it.

### Batch 4: documents

- [x] `docs/01-system/overview.md`, `docs/README.md`, the defense plan, the presentation flow and the analytics specification no longer describe adoption. Adoption-only ERDs and the adoption chat audit moved to `docs/archive/removed-adoption/`.
- [ ] ERD/DFD set (`12_COMPLETE_SYSTEM_ERD.md`, the `00_ERD_MODULE_OVERVIEW.md` body, `MANUSCRIPT_DATABASE_DESIGN.md`, the DFD documents) still describe adoption; update with the manuscript.
- [ ] Manuscript wording to check (outside the repository).

## 4. Seven-day claim rule (separate, after this removal)

When an animal with a known owner is held at the Barangay holding place, the owner is told to claim it within 7 days, with a reminder; after 7 days the Barangay may **impound** it (the only outcome) or **extend the hold**, as often as it wants. To be planned in detail once the removal is done.
