# Resident Pet Profile History Implementation Plan

**Status:** Proposal (not yet implemented)  
**Date:** 2026-11-17  
**Target UI:** `frontend/src/resident/pages/pets/PetDetailsPage.tsx` (route `/resident-app/pets/:petId` in `frontend/src/resident/ResidentApp.tsx`)  
**Out of Scope:** Legacy pet pages (do not modify legacy portals)

---

## Overview

Add selective, privacy-safe pet history sections to the current Resident Pet Profile page (`PetDetailsPage.tsx`). Instead of exposing every raw complaint or neighbor report linked to a pet (which may include unverified accusations or reporter identities), the resident's pet profile will only display:

1. **Lost-pet history** — Missing-pet reports filed by the owner for that pet (active or resolved).
2. **Official warnings & notices** — Formal warning letters issued to the owner for that pet.
3. **Confirmed incidents** — Cases where a Subdivision Leader has explicitly verified the incident and confirmed the pet's identity, with reporter details and internal notes omitted.

---

## 1. Data Sources & Privacy Rules

| Section on Pet Profile | Data Source | Privacy / Gate Rule |
| :--- | :--- | :--- |
| **Lost-pet history** | Existing `state.reports` (already loaded in `ResidentState`) | Only `kind === 'lost'` reports filed by the owner for this `pet.id` |
| **Official warnings & notices** | Existing `GET /warning-letters/mine` (`residentApi.myWarningLetters()`) | Filtered to `w.pet_id === Number(pet.id)` (issued warnings only) |
| **Confirmed incidents** | New owner-only endpoint `GET /pets/{pet_id}/confirmed-incidents` | Only cases where a Leader **verified the incident** AND **confirmed the pet's identity**; reporter details and internal notes omitted |

---

## 2. Backend Changes

### New Endpoint: `GET /pets/{pet_id}/confirmed-incidents`
* **File:** `backend/app/routes/pets.py` (with query/sanitization helper in `backend/app/services/case_view.py` or `pets.py`)
* **Authorization:** Require authenticated resident and verify `pet.owner_id == current_user.user_id` (`403 Forbidden` otherwise).
* **Filtering Rules (all must hold):**
  1. Exclude deleted, merged, or split-child reports.
  2. Exclude `lost_pet` reports (those are shown in **Lost-pet history**).
  3. **Verified incident:** `incident_verification` must be `verified` (or `partly_verified`).
  4. **Confirmed animal identity:** Identity must be explicitly confirmed by a Leader (via `LeaderIdentityVerification`, confirmed `ReportMatch`, or `identity_status == 'confirmed'`) — **never** merely because a reporter selected the pet when filing.
  5. **Ownership timing guard:** Only include incidents occurring during the resident's ownership (respecting `became_owner_after` where applicable).
* **Sanitized Response Shape (per item):**
  * `report_id`
  * `reference_code`
  * `category` / `incident_type`
  * `incident_date`
  * `status`
  * `summary` (public-safe summary only)
  * `has_warning_letter`
  * **Explicitly omitted:** `reporter_id`, `reporter_name`, `reporter_contact`, witness details, and internal staff assessment notes.

---

## 3. Frontend Changes

### A. Selectors (`frontend/src/resident/data/selectors.ts`)
* Add `petLostReports(state: ResidentState, petId: string): Report[]`:
  * Filters `state.reports` for `r.kind === 'lost' && r.petId === petId`, sorted newest-first.

### B. API Client (`frontend/src/resident/live/api.ts`)
* Add `ApiPetConfirmedIncident` interface and `petConfirmedIncidents(petId: number)` calling `GET /pets/{petId}/confirmed-incidents`.
* Reuse `residentApi.myWarningLetters()` (`GET /warning-letters/mine`) and filter client-side by `String(w.pet_id) === pet.id`.
* In preview/mock mode (non-live data), default warnings and confirmed incidents gracefully to empty arrays.

### C. UI Layout (`frontend/src/resident/pages/pets/PetDetailsPage.tsx`)
Render compact `Section` blocks below the **About** section:

1. **Lost-pet history** (`Section title="Lost-pet history"`)
   * Lists each lost-pet report for this pet (`referenceCode`, date filed, status pill such as *Missing*, *Pet is home*, or *Closed*), linking to `/reports/${r.id}`.
2. **Warnings & notices** (`Section title="Warnings & notices"`)
   * Lists issued warning letters for this pet (`warning_level · warning_reference`, issue date, `New` / `Acknowledged` badge), linking directly to `/warnings/${w.letter_id}`.
3. **Confirmed incidents** (`Section title="Confirmed incidents"`)
   * Lists Leader-verified and identity-confirmed incidents (`reference_code`, category, date, status) with a helper note: *"Only incidents verified and confirmed by subdivision staff appear here."*
   * No reporter identity or internal notes are displayed.

---

## 4. Verification Plan

1. **Backend tests:**
   * Pet owner can fetch `GET /pets/{pet_id}/confirmed-incidents`; other residents receive `403`.
   * Unverified reports and unconfirmed `"Linked by reporter"` reports are excluded.
   * Verified + identity-confirmed incidents appear without `reporter_name`, `reporter_id`, or internal notes.
2. **Frontend checks:**
   * Run `npm run build` and `node --test` in `frontend/`.
   * Verify on `/resident-app/pets/1` that:
     * Filing and closing a lost-pet report appears under **Lost-pet history**.
     * Issuing a warning letter for that pet appears under **Warnings & notices** and opens `/warnings/:letterId`.
     * Only Leader-confirmed incidents appear under **Confirmed incidents**.
