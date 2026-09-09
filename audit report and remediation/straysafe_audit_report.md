# StraySafe 2.0 — Product Design & Architecture Audit Report

**Date:** 2026-09-09  
**Auditor:** Senior Product Design + Software Architecture Auditor  
**System:** StraySafe 2.0 — Stray Animal Reporting & Rescue Coordination Platform  
**Stack:** React 19 / TypeScript / Tailwind CSS 4 (Frontend) · FastAPI / Python 3.12 / SQLAlchemy 2.0 / MySQL (Backend)

---

## Executive Summary

StraySafe 2.0 is a functional multi-role application (Resident → Subdivision Leader → Barangay Staff → Admin) with AI integration, real-time mapping, and a rescue workflow. However, it carries **significant architectural debt** and **multiple UI/accessibility violations** that would be blockers in a trust-sensitive production environment. The codebase has grown organically — several single files exceed 100KB+ — and critical security controls (rate limiting, CSRF, input sanitization at scale, migration tooling) are absent.

---

## Part A — UI / Visual Audit (60-30-10 Rule)

**Summary Verdict: ⚠️ NEEDS WORK**

### Screen-by-Screen Analysis

#### 1. Landing Page (`/`)

| Element | Color | Approximate Coverage |
|:---|:---|:---|
| Background | `#FAFAF9` (warm white) | ~65% |
| Text / headings | `#1a1208` (dark brown-black) | ~15% |
| Accent (buttons, badge, highlights) | `#F97316` (orange) + `#FACC15` (yellow underline) | ~20% |

**Assessment:** The background achieves ~65% neutral — acceptable. However the accent orange is overused at ~20%: it appears in the hero badge, CTA button, text highlights, floating paw decorations, the "How It Works" step indicators, and the footer branding. When everything is orange, nothing is orange. The primary CTA ("Report a Stray") does not dominate attention because the accent color is scattered everywhere.

#### 2. Login Pages (`/login`, `/staff/login`, `/admin/login`)

| Element | Color | Approximate Coverage |
|:---|:---|:---|
| Left hero panel | `#F97316` solid orange | ~50% |
| Right form panel | `#F8FAFC` (off-white) | ~45% |
| CTA button | `#F97316` orange | ~5% |

**Assessment: ❌ FAILS 60-30-10.** The accent color (saturated orange) occupies 50% of the viewport as the entire left panel. The CTA "Sign In" button is the same `#F97316` orange, so it blends into the already dominant orange field. The button becomes invisible by association — the opposite of what is needed. A user scanning the page gets orange fatigue before reaching the action.

#### 3. Cross-Screen Observations

- **All three login pages are visually identical** except for text labels. An admin could accidentally enter credentials into the resident portal (or vice versa) with no visual friction to prevent it.
- **No destructive/irreversible action differentiation**: the same orange is used for "Report a Stray" (safe), "Sign In" (neutral), and presumably "Escalate" and "Mark as False Alarm" (destructive). Destructive actions must use red or a distinct warning pattern.
- **Dark mode** is implemented via brute-force `!important` CSS overrides in [`index.css`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/index.css) — over 200 lines of hard-coded selectors. Any new component that uses a Tailwind utility not listed will not theme correctly.

### Contrast & Accessibility (WCAG AA)

| Issue | Measured Ratio | Required | Verdict |
|:---|:---|:---|:---|
| Login subtitle text (slate on white) | ~2.8:1 | 4.5:1 (AA normal text) | ❌ Fail |
| Footer disclaimers (gray on white, ~10px) | ~2.5:1 | 4.5:1 | ❌ Fail |
| Form labels ("EMAIL ADDRESS", "PASSWORD") | ~3.2:1 | 4.5:1 | ❌ Fail |
| Orange CTA on white background | ~3.0:1 | 4.5:1 | ❌ Fail |
| Orange text on `#FAFAF9` background | ~3.1:1 | 4.5:1 | ❌ Fail |

> [!CAUTION]
> **5 out of 5 sampled text elements fail WCAG AA minimum contrast.** This is a systemic problem, not an isolated case.

### Trust & Security Cues

- ❌ No security badges, SSL indicators, or organizational seals on any login page.
- ❌ No MFA prompt or indication of session security.
- ❌ "Keep me logged in" checkbox on Staff/Admin pages with no explanation of session duration or security implications.
- ❌ No visual distinction between administrative and civilian portals.

---

## Part B — Architecture Audit

**Summary Verdict: ❌ FAIL**

### 1. Structure & Separation of Concerns

| Finding | Severity |
|:---|:---|
| [`main.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/main.py) is **931 lines** and contains **30+ `ensure_*` migration functions** that run DDL statements inline on every server start. | Critical |
| [`reports.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/reports.py) is **3,041 lines (140KB)** — a single route file with 40+ endpoints, business logic, AI calls, and ORM queries all mixed together. | Critical |
| [`ResiHomePage.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResiHomePage.tsx) is **4,003 lines (289KB)**. This is the largest single React component file I have ever audited. | Critical |
| No service/business-logic layer — route handlers directly contain domain logic, ORM queries, external API calls, and response mapping. | High |
| Frontend pages are monolithic: [`SubdViewReport.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdViewReport.tsx) (241KB), [`SubdReports.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Subd_Leaders/SubdReports.tsx) (225KB), [`BrgyReportView.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/Barangay_Staff/BrgyReportView.tsx) (166KB). These are unmaintainable. | High |

### 2. Data Flow & State Management

| Finding | Severity |
|:---|:---|
| Authentication state is split across `localStorage` and `sessionStorage` using three different keys (`resident_user`, `staff_user`, `admin_user`) plus a separate `access_token` key. The entire user object (including `role_id`, `email`, `address`, `phone`, `latitude`, `longitude`) is stored in plaintext in `localStorage`. | Critical |
| No centralized state management — every page independently fetches and manages its own data with local `useState` hooks and raw `axios` calls. | High |
| **108+ hardcoded `http://localhost:8000` URLs** scattered across frontend pages, bypassing the centralized `api.ts` Axios instance. These bypass the auth interceptor. | Critical |
| Token is stored in `localStorage` (persistent, XSS-extractable) with a **7-day expiry** and no refresh-token mechanism. | High |
| [`ProtectedRoute.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/ProtectedRoute.tsx) falls back to granting access from client-side `localStorage` data when the server is unreachable (lines 71-87), completely defeating server-side auth. | Critical |

### 3. Security Posture

| Finding | Severity |
|:---|:---|
| **Secrets committed to repository**: [`.env`](file:///c:/Users/User/Desktop/Straysafe2.0/.env) contains Cloudinary API key/secret, Gemini API key, admin credentials (`admin@straysafe.com` / `password123`), seed passwords, and Dog/Cat API keys — all in plaintext. | Critical |
| **Hardcoded JWT secret**: [`auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py#L13) falls back to `"straysafe_super_secret_jwt_key_2026_safe_hash_897162"` if env var is missing. This string is in source code. | Critical |
| **No rate limiting**: Zero rate-limiting on login, registration, or any API endpoint. Brute-force attacks are trivial. | Critical |
| **No CSRF protection**: JWT-in-localStorage + `allow_credentials=True` CORS with no CSRF token. | High |
| **SQL injection in migration functions**: Multiple `ensure_*` functions in `main.py` use **f-string interpolation** for column names in raw SQL (e.g., `f"AND COLUMN_NAME = '{col_name}'"` at lines 161-163, 279, 298, etc.). While current usage passes hardcoded strings, the pattern is dangerous and sets a precedent. | High |
| **`/auth/me` endpoint** returns the full User ORM object with no schema filter — potentially exposing the hashed password field. | High |
| Password is sent over plaintext HTTP to `http://127.0.0.1:8000` (hardcoded in [`ResidentsLogin.tsx`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/pages/citizen/ResidentsLogin.tsx#L56)). No TLS enforcement. | High |
| Token accepted via query parameter (`?token=...`) in [`auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py#L81-L82) — tokens will appear in server access logs and browser history. | Medium |
| No security headers middleware (`X-Content-Type-Options`, `X-Frame-Options`, `CSP`, `Strict-Transport-Security`). | Medium |

### 4. Scalability & Performance Risks

| Finding | Severity |
|:---|:---|
| **30+ DDL migrations run synchronously on every server start** — including `ALTER TABLE`, `CREATE TABLE IF NOT EXISTS`, and `INSERT … SELECT FROM DUAL`. As data grows, this delays startup significantly. | High |
| No database connection pooling configuration — `create_engine(DATABASE_URL)` with no `pool_size`, `max_overflow`, or `pool_timeout` parameters. | Medium |
| No pagination on list endpoints — `GET /reports/` returns all reports with full eager-loaded relationships. | High |
| Frontend bundles will be enormous: 14 citizen pages (total ~1.2MB source), 11 barangay pages (~1MB), without code-splitting or lazy loading. | Medium |
| `reports.py` route file (140KB) will cause slow IDE performance and merge conflicts. | Medium |

### 5. Compliance-Relevant Gaps

| Finding | Severity |
|:---|:---|
| **PII in localStorage**: Full user profile (name, email, phone, address, GPS coordinates) stored in browser `localStorage` with no encryption. | Critical |
| **No data retention policy**: No TTL on audit logs, chat messages, or personal data. No mechanism for data deletion (GDPR/DPA right-to-erasure). | High |
| **Audit logging gaps**: `log_activity()` commits independently and silently swallows errors (line 52-55 in [`audit.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/audit.py#L48-L55)). Critical actions could occur without audit trails. | High |
| No access-control audit for who accessed what data — the `GET /users/` endpoint returns all users to any authenticated user regardless of role. | High |
| No session invalidation mechanism — no token blacklist, no logout endpoint that revokes tokens. | Medium |

### 6. Maintainability & Tech-Debt Hotspots

| Finding | Severity |
|:---|:---|
| **No migration framework** (Alembic): Schema changes are managed via 30+ ad-hoc `ensure_*` functions. No rollback capability, no migration history, no team coordination. | Critical |
| **No automated tests**: Zero test files found in the entire repository. | Critical |
| **Duplicated logic**: Login response construction is duplicated between `/auth/login` (line 92-116) and `/auth/verify-session` (line 118-136) in [`auth.py`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/routes/auth.py). The barangay-name fallback logic is copy-pasted. | Medium |
| Two database files exist in backend directory: `stray_safe.db` and `straysafe.db` (SQLite artifacts despite MySQL being the declared DB). | Low |
| [`App.css`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/App.css) contains Vite scaffold boilerplate CSS that is unused. | Low |
| Filename typo: `EscelatedMissions.tsx` (should be "Escalated"). | Low |

---

## Findings Table

| # | Severity | Area | Issue | Why It Matters | Fix |
|:---|:---|:---|:---|:---|:---|
| 1 | **Critical** | Security | Secrets (API keys, admin password, JWT fallback) committed in `.env` and source code | Any repo access leaks all credentials | Rotate all keys immediately. Move secrets to a vault or CI secrets manager. Remove `.env` from git history with `git filter-repo`. |
| 2 | **Critical** | Security | No rate limiting on login or any endpoint | Brute-force login attacks are trivially easy | Add `slowapi` middleware with rate limits: 5 attempts/min on `/auth/login`, 60 req/min on general endpoints. |
| 3 | **Critical** | Security | `ProtectedRoute` fallback grants access from client-side `localStorage` when backend is unreachable | Auth is fully client-side on network failure — attacker can forge `localStorage` | Remove the fallback (lines 71-87 in `ProtectedRoute.tsx`). If server is unreachable, deny access. |
| 4 | **Critical** | Architecture | `main.py` contains 30+ inline DDL migration functions (931 lines) | No rollback, no history, races on multi-instance deploy, slows every startup | Adopt Alembic. Extract all `ensure_*` functions into versioned migration scripts. |
| 5 | **Critical** | Architecture | `reports.py` is 3,041 lines (140KB) with 40+ endpoints and mixed business logic | Unmaintainable, untestable, merge-conflict magnet | Extract into service layer + sub-routers: `reports/`, `reports/disputes/`, `reports/transfers/`, `reports/verification/`. |
| 6 | **Critical** | Architecture | `ResiHomePage.tsx` is 4,003 lines (289KB) — single React component | Cannot be maintained, reviewed, or tested | Split into composition: `<ReportMap />`, `<ReportForm />`, `<ReportList />`, `<ReportFilters />`, etc. |
| 7 | **Critical** | Security | 108+ hardcoded `http://localhost:8000` URLs in frontend pages bypass auth interceptor | Requests skip token attachment; breaks in any non-localhost deployment | Replace all with `api.get()` / `api.post()` from the centralized `utils/api.ts` module. |
| 8 | **Critical** | Data | Full user PII (name, email, phone, address, GPS) stored in `localStorage` unencrypted | XSS attack exfiltrates all user data; violates data protection principles | Store only the JWT token in an `httpOnly` cookie. Fetch user profile on-demand from `/auth/me`. |
| 9 | **Critical** | Quality | Zero automated tests in the entire repository | No regression safety net; every change is a roll of the dice | Add pytest for backend (auth, reports CRUD) and Vitest for frontend (ProtectedRoute, API interceptor). |
| 10 | **High** | UI/A11Y | 5/5 sampled text elements fail WCAG AA contrast (ratios 2.5:1 – 3.2:1) | Excludes users with low vision; legal liability under accessibility regulations | Darken text colors: body text → `#374151` (gray-700), labels → `#4B5563` (gray-600), footer → `#6B7280` (gray-500). Use `#EA580C` (orange-600) for CTA buttons. |
| 11 | **High** | UI | Login accent color (orange) occupies 50% of viewport, violating 60-30-10 | CTA button has no visual prominence; user's eye has nowhere to anchor | Reduce left panel to a subtle gradient/illustration. Reserve saturated orange exclusively for the CTA. |
| 12 | **High** | Security | `/auth/me` returns raw User ORM object, potentially including hashed password | Leaks internal data structure and password hash to client | Add a `response_model=UserPublicResponse` Pydantic schema that excludes `password`, `created_at`, internal IDs. |
| 13 | **High** | Security | JWT token stored in `localStorage` with 7-day expiry, no refresh mechanism | Token theft gives 7 days of access with no way to revoke | Implement short-lived access tokens (15 min) + refresh token rotation with server-side revocation. |
| 14 | **High** | Architecture | No pagination on list endpoints (`GET /reports/`, `GET /users/`) | Response time degrades linearly with data; can OOM on large datasets | Add `skip` + `limit` query params with defaults (e.g., `limit=50`). Return total count in headers or response. |
| 15 | **Medium** | Security | Token accepted via URL query parameter (`?token=...`) | Token leaks into server logs, proxy logs, browser history, referer headers | Remove query-param token extraction from `get_current_user()`. Require `Authorization` header only. |
| 16 | **Medium** | Security | No security headers (`X-Frame-Options`, `CSP`, `X-Content-Type-Options`) | Clickjacking, MIME-type confusion, XSS via content injection | Add `starlette-security-headers` or manual middleware to set security headers. |
| 17 | **Medium** | UI | All three login portals are visually identical | Users may enter credentials into the wrong portal with no friction | Differentiate: Resident = orange/warm theme, Staff = blue/teal, Admin = dark/slate. Add role badges. |
| 18 | **Medium** | Architecture | Dark mode CSS is 170 lines of `!important` overrides targeting specific Tailwind classes | Breaks on any new utility class; unmaintainable | Use CSS custom properties (`var(--bg-surface)`) consistently via Tailwind `theme.extend`. Remove all `!important` overrides. |
| 19 | **Medium** | Compliance | No data retention or deletion mechanism | No path to comply with data subject access/erasure requests | Add user data export + deletion endpoints. Implement TTL-based cleanup for audit logs and expired sessions. |
| 20 | **Low** | Quality | Filename typo: `EscelatedMissions.tsx` | Confuses developers, harms codebase searchability | Rename to `EscalatedMissions.tsx` and update all imports. |

---

## Suggestions for Improvement

### 1. Quick Wins (Low effort, High impact — doable now)

| # | What to Change | Why It Helps | Effort | Impact |
|:---|:---|:---|:---|:---|
| QW-1 | **Replace all hardcoded `http://localhost:8000` URLs** with the centralized `api` instance from `utils/api.ts` | Fixes auth bypass, enables deployment to any environment, single config point | S | **High** |
| QW-2 | **Add `slowapi` rate limiting** to `/auth/login` (5/min) and all write endpoints (30/min) | Prevents brute-force attacks, the #1 attack vector for login systems | S | **High** |
| QW-3 | **Add a `UserPublicResponse` Pydantic model** and use it as `response_model` on `/auth/me` and login responses | Prevents leaking hashed password and internal fields to the frontend | S | **High** |
| QW-4 | **Darken text colors** to meet WCAG AA: body text → `#374151`, labels → `#4B5563`, CTA orange → `#EA580C` | Accessibility compliance, readability improvement for all users | S | **Med** |
| QW-5 | **Remove the fallback auth bypass** in `ProtectedRoute.tsx` (lines 71-87) — deny access when server is unreachable | Closes a critical authentication bypass that grants access without server verification | S | **High** |

### 2. Medium-Term Improvements (Needs some rework/planning)

| # | What to Change | Why It Helps | Effort | Impact |
|:---|:---|:---|:---|:---|
| MT-1 | **Adopt Alembic** for database migrations; extract all `ensure_*` functions into versioned migration files | Enables rollbacks, team coordination, CI/CD safety, and eliminates startup delay | M | **High** |
| MT-2 | **Introduce a service layer** in the backend: `app/services/report_service.py`, `app/services/auth_service.py`, etc. | Separates business logic from HTTP concerns; enables unit testing without HTTP | M | **High** |
| MT-3 | **Split monolithic frontend pages** (>100KB) into composable components with custom hooks for data fetching | Improves developer velocity, enables code review, reduces bundle size via lazy loading | M | **High** |
| MT-4 | **Move JWT to `httpOnly` cookies** and implement short-lived access + refresh token rotation | Eliminates XSS token theft; enables server-side session revocation | M | **High** |
| MT-5 | **Add foundational test suites**: pytest for backend auth + report CRUD; Vitest for ProtectedRoute + API interceptor | Catches regressions before they reach users; prerequisite for any refactoring | M | **High** |
| MT-6 | **Add React Query (TanStack Query)** or SWR for server-state management | Eliminates hundreds of duplicated `useEffect` + `useState` patterns; adds caching, deduplication, retry | M | **Med** |

### 3. ![alt text](image.png) (Design-system or architecture-level investment)

| # | What to Change | Why It Helps | Effort | Impact |
|:---|:---|:---|:---|:---|
| LT-1 | **Build a design token system** with semantic color tokens (`--color-surface`, `--color-action-primary`, `--color-action-destructive`) consumed by all components | Eliminates 200+ dark-mode CSS overrides; ensures consistent theming; enables future themes | L | **High** |
| LT-2 | **Implement a shared error boundary + global error handling layer** (React Error Boundaries + Axios global error handler) | Prevents blank screens on uncaught errors; centralized error reporting | M | **Med** |
| LT-3 | **Centralized state management** (Zustand or Context + useReducer) for auth, user profile, and notification state | Eliminates scattered `localStorage` reads; single source of truth; simplifies testing | L | **High** |
| LT-4 | **API versioning and OpenAPI schema contract** (`/api/v1/...`) with auto-generated TypeScript types | Prevents frontend/backend contract drift; enables parallel development; self-documenting API | L | **Med** |
| LT-5 | **Implement row-level security (RLS) or ORM-level query filters** to ensure users can only access data in their jurisdiction | Prevents horizontal privilege escalation (Resident A viewing Resident B's data) | L | **High** |

---

## Prioritized Top 5 Fixes

These are ordered by **risk × blast radius** — addressing the most dangerous issues that affect the most users:

| Priority | Source | Fix | Rationale |
|:---|:---|:---|:---|
| **🔴 1** | Finding #1 | **Rotate all secrets, remove from git history, use a secrets manager** | Active credential exposure. If the repo is or was ever public, all API keys and the admin password are compromised *right now*. |
| **🔴 2** | Finding #3 + QW-5 | **Remove `ProtectedRoute` client-side auth fallback** | Any user can forge `localStorage` and access admin routes when the server is slow or down. Zero effort to exploit. |
| **🔴 3** | Finding #7 + QW-1 | **Replace 108+ hardcoded localhost URLs with centralized API client** | These requests skip authentication headers and will break on any deployment. Search-and-replace is mechanical. |
| **🔴 4** | Finding #2 + QW-2 | **Add rate limiting on login and write endpoints** | Without rate limiting, an attacker can brute-force the admin account (`admin@straysafe.com` / `password123` per `.env`) in seconds. |
| **🟡 5** | Finding #4 + MT-1 | **Adopt Alembic; extract migration functions from `main.py`** | The current approach runs 30+ `ALTER TABLE` statements on every startup. Any failure leaves the schema in an undefined state with no rollback path. |

---

## Login Page Screenshots

![Resident Login Page](C:\Users\User\.gemini\antigravity-ide\brain\f71ad6d9-1f2c-4fab-9c9e-a84913c7db04\resident_login_page_1788914712625.png)

![Staff Login Page](C:\Users\User\.gemini\antigravity-ide\brain\f71ad6d9-1f2c-4fab-9c9e-a84913c7db04\staff_login_page_1788914720605.png)

![Admin Login Page](C:\Users\User\.gemini\antigravity-ide\brain\f71ad6d9-1f2c-4fab-9c9e-a84913c7db04\admin_login_page_1788914726437.png)

---

*End of audit report.*
