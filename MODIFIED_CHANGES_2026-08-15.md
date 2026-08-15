# StraySafe 2.0 — Comprehensive Changelog of Modified Changes
**Date:** August 15, 2026  
**Branch:** `UpdateNewFeatures` (compared against `main` and working tree)

---

## 📋 Summary of Changes

### 1. 🔐 Authentication & Security (JWT & Protected Routes)
- **Backend JWT Implementation ([`backend/app/utils/auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py)):**
  - Integrated JSON Web Tokens (`PyJWT`) with HS256 algorithm and 7-day expiration.
  - Added token generation (`create_access_token`), verification (`decode_access_token`), and dependency injection guards:
    - `get_current_user`: Validates Bearer token from header/query params and loads active user from DB.
    - `get_current_resident`: Restricts access exclusively to Resident/Citizen users (`role_id = 1`).
    - `get_current_staff_or_admin`: Restricts access to Subdivision Leaders (`role_id = 2`), Barangay Staff (`role_id = 3`), or System Admins (`role_id = 4`).
  - Added `pyjwt>=2.8.0` to [`backend/requirements.txt`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/requirements.txt).
- **Backend Auth Routes & Schemas ([`backend/app/routes/auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/auth.py), [`backend/app/schemas/auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/schemas/auth.py)):**
  - Updated `LoginResponse` schema to return `access_token` and `token_type: "bearer"`.
  - Stored access tokens during citizen, staff, subdivision leader, and admin authentication flows.
- **Frontend Axios Client ([`frontend/src/utils/api.ts`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/utils/api.ts)):**
  - Created centralized Axios instance with automatic `Authorization: Bearer <token>` header injection via request interceptor.
  - Added response error interceptor to handle `401 Unauthorized` responses and clear expired sessions.
- **Frontend Route Protection ([`frontend/src/components/ProtectedRoute.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/ProtectedRoute.tsx), [`frontend/src/routes/AppRoutes.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/routes/AppRoutes.tsx)):**
  - Implemented role-based route guards across all routes (`Resident`, `SubdivisionLeader`, `BarangayStaff`, `Admin`).
  - Redirects unauthenticated users to respective login portals with proper state preservation.
- **Login Pages Token Storage:**
  - [`frontend/src/pages/citizen/ResidentsLogin.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResidentsLogin.tsx)
  - [`frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx)
  - [`frontend/src/pages/Admin/AdminLogin.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Admin/AdminLogin.tsx)
  - Updated all login pages to persist `access_token` into `localStorage` / `sessionStorage`.

---

### 2. 🤖 AI Stray Analysis & Priority Matching System
- **AI Schema & Metadata Expansion ([`backend/app/schemas/report.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/schemas/report.py), [`backend/app/models/report.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/report.py)):**
  - Added support for AI-inferred report metadata:
    - `ai_animal_type`
    - `ai_dominant_color`
    - `ai_coat_pattern`
    - `ai_estimated_size`
    - `ai_possible_breed`
    - `ai_suggested_risk_level`
    - `ai_suggested_priority`
    - `ai_suggested_priority_reason`
- **AI Suggestion Panel ([`frontend/src/components/AISuggestionPanel.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/AISuggestionPanel.tsx)):**
  - Enhanced AI analysis display with visual badges for priority (`Emergency`, `High`, `Medium`, `Low`).
  - Added explanations for risk assessment, animal trait detection, and recommended actions.
- **Priority Resolution Logic Across Dashboards:**
  - Implemented `getEffectivePriority` helper across:
    - [`frontend/src/pages/Subd_Leaders/SubdReports.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdReports.tsx)
    - [`frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdViewReport.tsx)
    - [`frontend/src/pages/citizen/ResiViewReport.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResiViewReport.tsx)
    - [`frontend/src/pages/citizen/ResiProfile.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResiProfile.tsx)
  - Prioritizes AI emergency/high risk tags dynamically while falling back to user-reported priority.

---

### 3. 🐾 Pet Claims, Lost Pet Reports & Verification Flow
- **Pet Claim Schema & DB Updates ([`backend/app/models/pet_claim.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/pet_claim.py), [`backend/app/schemas/pet_claim.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/schemas/pet_claim.py), [`Database.txt`](file:///c:/Users/User/Desktop/Straysafe2.0/Database.txt)):**
  - Added `match_score` to pet claims for ranking potential pet-to-report matches.
  - Linked owner details to lost pet reports: `owner_name`, `owner_phone`, `owner_email`, `owner_address`, `is_owner_report`, `pet_qr_code_url`, `pet_qr_code_hash`.
- **Pet Records & Registration ([`frontend/src/pages/citizen/ResidentPet.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResidentPet.tsx), [`frontend/src/components/PetRecords/PetDetailPanel.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/PetRecords/PetDetailPanel.tsx)):**
  - Added pet creation modal with breed, color, photo upload, vaccination history, and microchip/tag tracking.
  - Pet detail drawer with QR code display, download option, and pet editing capabilities.
- **Report Stray & Lost Pet Form ([`frontend/src/pages/citizen/ReportStrayPage.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ReportStrayPage.tsx)):**
  - Integrated Leaflet interactive map picker with reverse geocoding and manual coordinate entry.
  - Added photo preview, image upload handling, and automatic lost pet owner linking.

---

### 4. 🏘️ Subdivision Leader & Barangay Staff Dashboards
- **Subdivision Leader Reports & Workflow ([`frontend/src/pages/Subd_Leaders/SubdReports.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdReports.tsx), [`frontend/src/pages/Subd_Leaders/SubdViewReport.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdViewReport.tsx)):**
  - Redesigned report management interface with priority filters, search, status pills, and fast assignment.
  - Added pet claim review dialogs: Approve, Reject, or Request Additional Evidence.
  - Interactive map integration displaying stray sightings and subdivision boundaries.
- **History & Analytics ([`frontend/src/pages/Subd_Leaders/SubdHistoryReport.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdHistoryReport.tsx), [`frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdViewHistory.tsx)):**
  - Filter historical reports by status (`Resolved`, `Claimed`, `Archived`), date range, and animal type.
- **Barangay Staff Features:**
  - [`frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyRescueRequests.tsx): Added direct emergency rescue dispatch support.
  - [`frontend/src/pages/Barangay_Staff/BrgyHistoryReports.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyHistoryReports.tsx): Barangay-level report history lookup.
  - [`frontend/src/pages/Barangay_Staff/BrgyProfile.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyProfile.tsx): Profile and jurisdiction settings management.

---

### 5. 👤 Resident Citizen Experience & Profile
- **Citizen Home & Feed ([`frontend/src/pages/citizen/ResiHomePage.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResiHomePage.tsx)):**
  - Real-time community stray & lost pet feed with filtering by radius, species, status, and urgency.
  - Embedded map showing active sightings with custom pin markers.
- **Citizen Profile & Reports ([`frontend/src/pages/citizen/ResiProfile.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResiProfile.tsx)):**
  - Fixed unused imports (`axios` removed).
  - Added profile picture upload with default avatar fallbacks (`DEFAULT_AVATAR`, `getProfilePicture`).
  - Personal submitted reports management with quick view and status tracker.
- **Resident Settings ([`frontend/src/pages/citizen/ResidentSettings.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResidentSettings.tsx)):**
  - Updated user details, contact info, notification toggle settings, and home address with interactive map coordinate picker.
- **Navigation Bars ([`frontend/src/components/Navbars/ResiNavbar.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/Navbars/ResiNavbar.tsx), [`frontend/src/components/Navbars/ResiMobileNav.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/Navbars/ResiMobileNav.tsx)):**
  - Synchronized notifications badge, user avatar, and mobile responsive menu navigation.

---

### 6. 🔔 Notifications & User API Updates
- **Notifications Archiving & Filtering ([`backend/app/routes/notifications.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/notifications.py), [`backend/app/models/notification.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/models/notification.py), [`backend/app/schemas/notification.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/schemas/notification.py)):**
  - Added `is_archived` attribute to `Notification` model and schema.
  - Implemented archive/unarchive endpoints and filtered out archived items from active alerts.
- **Users Route & Avatar Support ([`backend/app/routes/users.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/users.py)):**
  - Enhanced user profile retrieval and update endpoints to accept GPS coordinates (`latitude`, `longitude`) and profile photo URLs.
