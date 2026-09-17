# StraySafe 2.0 — Security & Authentication Remediation Action Plan

**Source Audit:** [`SECURITY_AND_AUTH_VULNERABILITY_AUDIT.md`](./SECURITY_AND_AUTH_VULNERABILITY_AUDIT.md)  
**Creation Date:** September 2026  
**Status:** In Progress 🟡  

---

## Progress Overview

| Phase | Focus Area | Status | Criticality |
| :--- | :--- | :---: | :---: |
| **Phase 1** | Immediate Critical Hotfixes (Open Admin Signup, Deletion, Route Guard) | ⏳ Pending | 🔴 Critical |
| **Phase 2** | Comprehensive Route Authentication (Reports, Pets, Claims, Holding, Rescue) | ⏳ Pending | 🔴 Critical |
| **Phase 3** | IDOR Mitigation & Multi-Tenant Boundary Enforcement | ⏳ Pending | 🟠 High |
| **Phase 4** | Session Management, Token Hardening & Upload Security | ⏳ Pending | 🟡 Medium |

---

## Phase 1: Immediate Critical Hotfixes (Sprint 1)

> **Objective:** Block external account takeover, unauthorized privilege escalation, and anonymous record destruction immediately.

- [ ] **Task 1.1: Lock Down Public User Registration (`CRITICAL-02`)**
  - **Target File:** [`backend/app/routes/users.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/users.py#L181-L225)
  - **Action:** In `create_user` (`POST /users/`), explicitly override `role_id = 1` (Citizen/Resident) and `is_head_officer = False` regardless of input payload.
  - **Validation:** Send a POST request with `role_id: 4` and verify the created user record in DB strictly has `role_id = 1`.

- [ ] **Task 1.2: Protect User Status Modification & Deletion (`CRITICAL-03`)**
  - **Target File:** [`backend/app/routes/users.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/users.py#L291-L343)
  - **Action:**
    - Add `current_user: User = Depends(get_current_user)` to `PATCH /users/{user_id}/status`. Only allow System Admin (`role_id == 4`) or Head Barangay Officer (`is_head_officer and role_id == 3`).
    - Add `current_user: User = Depends(get_current_user)` to `DELETE /users/{user_id}`. Only allow System Admin (`role_id == 4`).
    - Prevent self-deactivation of the primary admin account (`user_id == 1`).
  - **Validation:** Unauthenticated `curl -X PATCH /users/1/status` returns `401 Unauthorized`.

- [ ] **Task 1.3: Eliminate Frontend Route Guard Offline Bypass (`CRITICAL-04`)**
  - **Target File:** [`frontend/src/components/ProtectedRoute.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/ProtectedRoute.tsx#L66-L89)
  - **Action:** Remove the fallback block inside `catch (err)` that sets `setStatus('authorized')` when reading unverified `localStorage` data. If `/auth/verify-session` fails or cannot be reached, force redirect to login.
  - **Validation:** Setting forged `admin_user` in browser `localStorage` and cutting network connection does not grant access to `/admin/dashboard`.

- [ ] **Task 1.4: Protect Destructive Report Deletion & Status Updates (`CRITICAL-01`)**
  - **Target File:** [`backend/app/routes/reports.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)
  - **Action:**
    - Secure `DELETE /reports/{report_id}` with `current_user: User = Depends(get_current_staff_or_admin)` and enforce `role_id in [3, 4]`.
    - Secure `PATCH /reports/{report_id}/status` and custody transfer endpoints with `get_current_staff_or_admin`.
  - **Validation:** Anonymous DELETE request to `/reports/1` returns `401 Unauthorized`.

- [ ] **Task 1.5: Protect Permanent Pet Record Purging (`CRITICAL-01`)**
  - **Target File:** [`backend/app/routes/pets.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/pets.py)
  - **Action:**
    - Secure `DELETE /pets/{pet_id}/permanent` with `current_user: User = Depends(get_current_user)` and ensure `role_id == 4` (Admin only).
    - Secure `DELETE /pets/{pet_id}` (soft delete) so only the pet owner (`user_id == pet.user_id`) or staff/admin can delete.
  - **Validation:** Anonymous DELETE to `/pets/1/permanent` returns `401 Unauthorized`.

---

## Phase 2: Comprehensive Route Authentication (Sprint 2)

> **Objective:** Ensure every operational module has strict authentication dependencies and proper role-level access control.

- [ ] **Task 2.1: Secure Pet Ownership Claims Module**
  - **Target File:** [`backend/app/routes/claims.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/claims.py)
  - **Action:**
    - `POST /claims/`: Require `get_current_user` (must be authenticated citizen). Automatically assign `claim.user_id = current_user.user_id`.
    - `PATCH /claims/{claim_id}/status`: Require `get_current_staff_or_admin` (Role 2, 3, 4).
    - `DELETE /claims/{claim_id}`: Require owner or staff/admin.

- [ ] **Task 2.2: Secure Holding Facility Management**
  - **Target File:** [`backend/app/routes/holding.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/holding.py)
  - **Action:**
    - Protect all CRUD endpoints (`POST /holding/`, `PATCH /holding/{id}`, `DELETE /holding/{id}`) with `get_current_staff_or_admin`.
    - Restrict kennel slot management to staff/admin.

- [ ] **Task 2.3: Secure Rescue & Dispatch Operations**
  - **Target File:** [`backend/app/routes/rescue.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/rescue.py)
  - **Action:**
    - `POST /rescue/assign-team`: Require `get_current_staff_or_admin`.
    - `PATCH /rescue/{rescue_id}/status`: Require assigned staff member or admin.

- [ ] **Task 2.4: Secure Notifications & Private Messages**
  - **Target File:** [`backend/app/routes/notifications.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/notifications.py)
  - **Action:**
    - `GET /notifications/user/{user_id}`: Require `current_user = Depends(get_current_user)` and enforce `current_user.user_id == user_id` (or admin).
    - `PATCH /notifications/{notification_id}/read`: Verify notification recipient matches `current_user.user_id`.

- [ ] **Task 2.5: Secure Announcements & Hazard Alerts**
  - **Target File:** [`backend/app/routes/announcements.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/announcements.py)
  - **Action:**
    - `POST /announcements/`: Restrict creation to Role 2 (Subd Leader), Role 3 (Barangay), or Role 4 (Admin).
    - `DELETE /announcements/{id}`: Restrict deletion to author or admin.

- [ ] **Task 2.6: Secure System Audit Logs**
  - **Target File:** [`backend/app/routes/audit_logs.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/audit_logs.py)
  - **Action:**
    - `GET /audit-logs/`: Enforce strict Admin-only check (`current_user.role_id == 4`). Anonymous or non-admin access returns `403 Forbidden`.

- [ ] **Task 2.7: Secure AI Match & QR Code Endpoints**
  - **Target Files:** [`backend/app/routes/matches.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/matches.py), [`backend/app/routes/pet_qr.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/pet_qr.py)
  - **Action:**
    - Allow public read only on `GET /pet-qr/scan/{token}` (required for lost pet collar tags).
    - Require authentication on QR generation, scan logs, and match reviews.

---

## Phase 3: IDOR Mitigation & Multi-Tenant Scoping (Sprint 3)

> **Objective:** Prevent cross-tenant boundary leaks between Subdivisions and ensure users can only access resources they own or supervise.

- [ ] **Task 3.1: Create Multi-Tenant Scoping Helper**
  - **Target File:** [`backend/app/utils/auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py)
  - **Action:** Implement reusable helper `verify_subdivision_scope(current_user: User, resource_subdivision_id: Optional[int])`:
    - Admin (`role_id == 4`): Full access.
    - Barangay Staff (`role_id == 3`): Full access within barangay.
    - Subdivision Leader (`role_id == 2`): Must match `current_user.subdivision_id == resource_subdivision_id`.
    - Citizen (`role_id == 1`): Access denied unless explicit resource owner.

- [ ] **Task 3.2: Scope Stray Incident Management by Jurisdiction**
  - **Target File:** [`backend/app/routes/reports.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py)
  - **Action:** Enforce `verify_subdivision_scope` on report status changes, assignments, and transfers. Subdivision leaders cannot modify reports from outside their subdivision.

- [ ] **Task 3.3: Scope Pet Records by Ownership & Jurisdiction**
  - **Target File:** [`backend/app/routes/pets.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/pets.py)
  - **Action:**
    - Citizens (`role_id == 1`) can only update/view their own registered pets.
    - Subdivision leaders can view pets within their subdivision registry.

---

## Phase 4: Session Hardening & Upload Security (Sprint 4)

> **Objective:** Harden JWT lifecycles, eliminate unsigned upload vulnerabilities, and mask system error leaks.

- [ ] **Task 4.1: Shorten Token Expiration & Implement Refresh Strategy (`HIGH-02`)**
  - **Target File:** [`backend/app/utils/auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py)
  - **Action:**
    - Change `ACCESS_TOKEN_EXPIRE_DAYS = 7` to `ACCESS_TOKEN_EXPIRE_MINUTES = 60`.
    - Add refresh token generator with 7-day validity stored in an `httpOnly`, `SameSite=Lax` cookie.

- [ ] **Task 4.2: Implement Server-Side Logout & Token Blacklist (`HIGH-02`)**
  - **Target Files:** [`backend/app/routes/auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/auth.py), [`backend/app/utils/auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py)
  - **Action:**
    - Create a `revoked_tokens` table or cache with `jti` and `expires_at`.
    - In `POST /auth/logout`, insert token into blacklist.
    - In `get_current_user`, verify token `jti` is not revoked.

- [ ] **Task 4.3: Secure Legacy File Uploads (`MEDIUM-01`)**
  - **Target Files:** [`backend/app/routes/users.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/users.py), [`backend/app/utils/uploads.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/uploads.py)
  - **Action:**
    - Route all file uploads through `read_and_validate_upload()`.
    - Enforce 10MB maximum file size and restrict MIME types to `image/jpeg`, `image/png`, `image/webp`, `video/mp4`.

- [ ] **Task 4.4: CORS & Sensitive Detail Masking (`MEDIUM-02`)**
  - **Target File:** [`backend/app/main.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/main.py)
  - **Action:**
    - Read `CORS_ALLOWED_ORIGINS` from environment variables instead of hardcoded localhost values.
    - Sanitize error responses in exception handlers so raw internal SQL error traces are never sent to clients.

---

## Verification & Automated Test Commands

Run the following commands to verify fixes after each phase:

```bash
# 1. Backend Syntax & Compilation Verification
python -m py_compile backend/app/routes/users.py
python -m py_compile backend/app/routes/reports.py
python -m py_compile backend/app/routes/pets.py
python -m py_compile backend/app/utils/auth.py

# 2. Test User Registration Privilege Escalation Fix
curl -s -X POST "http://localhost:8000/users/" \
  -H "Content-Type: application/json" \
  -d '{"name":"TestCitizen","email":"test_exploit@straysafe.com","password":"Password123!","role_id":4}' \
  | grep -o '"role_id":[0-9]*'
# Expected output: "role_id":1

# 3. Test Unauthenticated Deletion Guard
curl -s -X DELETE "http://localhost:8000/reports/1"
# Expected output: 401 Unauthorized

# 4. Frontend Type Check & Build
cd frontend && npm run build
```
