# StraySafe 2.0 — Audit Remediation Guide

> **Purpose:** Step-by-step implementation guide to resolve every finding from the System Audit Report.  
> **Approach:** 4 phases, ordered by risk. Each phase is independently deployable.  
> **Original estimated total effort:** ~2–3 days of sessions with Antigravity + your review/verification time  
> **Original Audit Date:** 2026-09-09 | **Last Reviewed:** 2026-09-11
>
> **Time estimates assume agentic coding via Antigravity.** Most mechanical work (search-replace, file splitting, boilerplate generation, code transforms) takes minutes, not hours. Your time is spent on: reviewing changes, rotating keys on external dashboards, and verifying behavior.

---

## Current Progress (as of 2026-09-11)

> [!CAUTION]
> **0 of 20 remediation tasks have been started.** All critical security vulnerabilities remain open. Two findings have worsened since the audit:
> - **Finding #5 (`reports.py`):** Grew from 3,041 → **3,589 lines** (+548 lines) since audit date
> - **Finding #7 (hardcoded localhost URLs):** Grew from 108+ → **200+ matching lines** in frontend

| Phase | Tasks | Status |
|:---|:---|:---|
| Phase 1 — Critical Security | 1.1 – 1.5 | ❌ Not started |
| Phase 2 — Architecture Debt | 2.1 – 2.4 | ❌ Not started |
| Phase 3 — UI & Accessibility | 3.1 – 3.5 | ❌ Not started |
| Phase 4 — Compliance & Testing | 4.1 – 4.7 | ❌ Not started |

---

## How to Use This Guide

1. **Work phase-by-phase** — do not skip ahead. Phase 1 closes active security holes.  
2. **Each task has a checkbox** — check it off as you complete it.  
3. **Verify after each task** — each task includes a "✅ Verify" step.  
4. **Commit after each task** — small, atomic commits make rollback safe.  
5. **Reference column** links each task back to the audit finding it resolves.

---

## Phase 1 — Critical Security (Do First · ~2–3 hours with Antigravity)

> [!CAUTION]
> These are active vulnerabilities. Complete this phase before any feature work.

### Task 1.1 — Rotate All Secrets & Purge Git History
**Audit Ref:** Finding #1 · Priority #1  
**⏱ Est:** ~20 min (mostly you on dashboards — Antigravity handles code/git changes)  
**Current State:** ❌ `.env` still committed. Hardcoded JWT fallback still at [`auth.py:L13`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py#L13): `SECRET_KEY = os.getenv("JWT_SECRET_KEY", "straysafe_super_secret_jwt_key_2026_safe_hash_897162")`

**What's wrong:**  
`.env` contains Cloudinary API key/secret, Gemini API key, admin password (`password123`), and seed credentials — all committed to git.

**Steps:**

- [ ] **1.** Go to each service dashboard and rotate/regenerate keys:
  - Cloudinary: Dashboard → Settings → Security → Regenerate API Secret
  - Gemini: Google AI Studio → API Keys → Create new key, delete old
  - Dog/Cat API: Regenerate on respective dashboards
- [ ] **2.** Change the admin password in the database:
  ```python
  # Run in Python shell with venv activated
  from app.utils.auth import get_password_hash
  new_hash = get_password_hash("YourNewSecurePassword!2026")
  print(new_hash)
  # Then UPDATE users SET password = '<hash>' WHERE email = 'admin@straysafe.com';
  ```
- [ ] **3.** Update `.env` with the new rotated keys (locally only)
- [ ] **4.** Confirm `.env` is in `.gitignore` (it already is — verify)
- [ ] **5.** Create a `.env.example` with placeholder values:
  ```env
  DATABASE_URL=mysql+pymysql://user:password@localhost/straysafe_db
  DB_HOST=localhost
  DB_USER=root
  DB_PASSWORD=CHANGE_ME
  DB_NAME=straysafe_db

  CLOUDINARY_CLOUD_NAME=your_cloud_name
  CLOUDINARY_API_KEY=your_api_key
  CLOUDINARY_API_SECRET=your_api_secret

  JWT_SECRET_KEY=GENERATE_A_RANDOM_64_CHAR_STRING

  GEMINI_API_KEY=your_gemini_key
  VITE_DOG_API_KEY=your_dog_api_key
  VITE_CAT_API_KEY=your_cat_api_key
  ```
- [ ] **6.** Purge `.env` from git history:
  ```bash
  # Install git-filter-repo (pip install git-filter-repo)
  git filter-repo --path .env --invert-paths
  git push --force-with-lease
  ```
- [ ] **7.** Remove the hardcoded JWT fallback secret in `backend/app/utils/auth.py` line 13:
  ```python
  # BEFORE (INSECURE):
  SECRET_KEY = os.getenv("JWT_SECRET_KEY", "straysafe_super_secret_jwt_key_2026_safe_hash_897162")

  # AFTER (SECURE):
  SECRET_KEY = os.getenv("JWT_SECRET_KEY")
  if not SECRET_KEY:
      raise ValueError("JWT_SECRET_KEY environment variable is required")
  ```

✅ **Verify:** Server refuses to start without `JWT_SECRET_KEY` set. Old API keys no longer work.

---

### Task 1.2 — Remove Client-Side Auth Bypass in ProtectedRoute
**Audit Ref:** Finding #3 · Priority #2  
**⏱ Est:** ~2 min (single code edit)  
**Current State:** ❌ Fallback still exists at [`ProtectedRoute.tsx:L71-87`](file:///c:/Users/User/Desktop/Straysafe2.0/frontend/src/components/ProtectedRoute.tsx#L71-L87). When backend returns a non-401/403 error, the code reads `rawUser` from localStorage and grants access.

**What's wrong:**  
`frontend/src/components/ProtectedRoute.tsx` lines 71–87: when the backend returns a network error (not 401/403), the code falls back to reading `localStorage` and granting access. An attacker can forge `localStorage` and access any role's pages.

**Steps:**

- [ ] **1.** Open `frontend/src/components/ProtectedRoute.tsx`
- [ ] **2.** Replace the catch block (lines 66–89) with:
  ```typescript
  } catch (err: any) {
      // ANY failure to verify with the server = deny access
      console.error('ProtectedRoute session verification failed:', err);
      clearAuthStorage();
      if (isMounted) setStatus('unauthorized');
  }
  ```
- [ ] **3.** Remove the inner `try/catch` that reads from `rawUser` on error

✅ **Verify:** Disconnect the backend → try to navigate to `/admin/dashboard` → should redirect to login, not load the page.

---

### Task 1.3 — Replace All Hardcoded Localhost URLs
**Audit Ref:** Finding #7 · Priority #3  
**⏱ Est:** ~15 min (Antigravity batch-replaces all 200+ instances across all files in one pass)  
**Current State:** ❌ Now **200+ matching lines** (was 108+ at audit). Spread across 46 files including components, Barangay, Admin, and Citizen pages.

**What's wrong:**  
108+ instances of `http://localhost:8000` and `http://127.0.0.1:8000` scattered across frontend pages, bypassing the centralized `api` instance (which attaches the JWT `Authorization` header).

**Steps:**

- [ ] **1.** Run the following to identify every file:
  ```bash
  # From project root
  grep -rn "http://localhost:8000\|http://127.0.0.1:8000" frontend/src/ --include="*.tsx" --include="*.ts" | grep -v "node_modules"
  ```
- [ ] **2.** In each file, replace the import and calls:

  **Pattern A — `fetch()` calls (ResidentsLogin.tsx, AdminLogin.tsx):**
  ```typescript
  // BEFORE:
  const res = await fetch('http://127.0.0.1:8000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
  });

  // AFTER:
  import api from '../../utils/api';
  // ...
  const res = await api.post('/auth/login', { email, password });
  const data = res.data;
  ```

  **Pattern B — `axios.get/post()` calls (most pages):**
  ```typescript
  // BEFORE:
  import axios from 'axios';
  const response = await axios.get(`http://localhost:8000/reports/${id}`);

  // AFTER:
  import api from '../../utils/api';  // (or correct relative path)
  const response = await api.get(`/reports/${id}`);
  ```

- [ ] **3.** Files to update (sorted by priority):

  | File | Approx. Instances |
  |:---|:---|
  | `pages/Subd_Leaders/SubdViewReport.tsx` | 15+ |
  | `pages/Subd_Leaders/SubdReports.tsx` | 5+ |
  | `pages/Subd_Leaders/SubdDashboard.tsx` | 5+ |
  | `pages/Subd_Leaders/SubdHazardAlert.tsx` | 8+ |
  | `pages/Subd_Leaders/SubdPetClaims.tsx` | 3+ |
  | `pages/Subd_Leaders/SubdHistoryReport.tsx` | 2+ |
  | `pages/Subd_Leaders/SubdViewHistory.tsx` | 2+ |
  | `pages/Subd_Leaders/EscelatedMissions.tsx` | 2+ |
  | `pages/Subd_Leaders/EndorsementArch.tsx` | 6+ |
  | `pages/citizen/ResiViewReport.tsx` | 6+ |
  | `pages/citizen/ResiHomePage.tsx` | 10+ |
  | `pages/citizen/ResidentsLogin.tsx` | 2 |
  | `pages/Admin/AdminLogin.tsx` | 1 |
  | `utils/avatar.ts` | 2 |
  | *(check remaining files with grep)* | |

- [ ] **4.** After replacing, remove unused `import axios from 'axios'` statements

✅ **Verify:** `grep -rn "http://localhost:8000\|http://127.0.0.1:8000" frontend/src/ --include="*.tsx" --include="*.ts"` returns **zero results**. App still functions correctly.

---

### Task 1.4 — Add Rate Limiting to Backend - Done
**Audit Ref:** Finding #2 · Priority #4  
**⏱ Est:** ~5 min (install + wire middleware)  
**Current State:** ❌ `slowapi` is not in `requirements.txt`. No rate limiting on any endpoint.

**Steps:**

- [ ] **1.** Install slowapi:
  ```bash
  pip install slowapi
  ```
- [ ] **2.** Add rate limiting middleware in `backend/app/main.py`:
  ```python
  from slowapi import Limiter, _rate_limit_exceeded_handler
  from slowapi.util import get_remote_address
  from slowapi.errors import RateLimitExceeded

  limiter = Limiter(key_func=get_remote_address)
  app.state.limiter = limiter
  app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
  ```
- [ ] **3.** Add rate limit to login endpoint in `backend/app/routes/auth.py`:
  ```python
  from slowapi import Limiter
  from slowapi.util import get_remote_address
  from starlette.requests import Request

  limiter = Limiter(key_func=get_remote_address)

  @router.post("/login", response_model=LoginResponse)
  @limiter.limit("5/minute")
  def login(request: Request, login_request: LoginRequest, db: Session = Depends(get_db)):
      # ... existing logic (rename 'request' param to 'login_request')
  ```
- [ ] **4.** Add `slowapi` to `requirements.txt`

✅ **Verify:** Hit `/auth/login` 6 times rapidly → 6th request returns `429 Too Many Requests`.

---

### Task 1.5 — Protect `/auth/me` Endpoint from Leaking Password Hash - DONE
**Audit Ref:** Finding #12  
**⏱ Est:** ~3 min (create schema + apply to endpoint)  
**Current State:** ❌ No `UserPublicResponse` schema exists. The endpoint returns the raw ORM object. Additionally, `?token=` query param acceptance is still present at [`auth.py:L81-82`](file:///c:/Users/User/Desktop/Straysafe2.0/backend/app/utils/auth.py#L81-L82) (Finding #15) — remove it alongside this task.

**Steps:**

- [ ] **1.** Create a safe response schema in `backend/app/schemas/auth.py` (or `user.py`):
  ```python
  class UserPublicResponse(BaseModel):
      user_id: int
      name: str
      email: str
      phone: Optional[str] = None
      role_id: int
      subdivision_id: Optional[int] = None
      barangay_id: Optional[int] = None
      is_head_officer: bool = False
      profile_picture: Optional[str] = None
      status: Optional[str] = None
      is_verified: bool = False

      class Config:
          from_attributes = True
  ```
- [ ] **2.** Update the `/auth/me` endpoint in `backend/app/routes/auth.py`:
  ```python
  @router.get("/me", response_model=UserPublicResponse)
  def get_me(current_user: User = Depends(get_current_user)):
      return current_user
  ```

✅ **Verify:** `GET /auth/me` response JSON does NOT contain a `password` field.

---

## Phase 2 — Architecture Debt (Foundation · ~4–6 hours with Antigravity)

### Task 2.1 — Adopt Alembic for Database Migrations
**Audit Ref:** Finding #4 · Priority #5  
**⏱ Est:** ~30 min (init + extract all 30 ensure_* functions into versioned migrations)

**Steps:**

- [ ] **1.** Install Alembic:
  ```bash
  pip install alembic
  ```
- [ ] **2.** Initialize Alembic in the `backend/` directory:
  ```bash
  cd backend
  alembic init alembic
  ```
- [ ] **3.** Configure `alembic/env.py`:
  ```python
  from app.database import Base, engine
  from app.models import user, report, pet, chat, warning, ...  # import all models
  target_metadata = Base.metadata
  ```
- [ ] **4.** Configure `alembic.ini`:
  ```ini
  sqlalchemy.url = mysql+pymysql://root:password@localhost/straysafe_db
  # Or better: use env variable interpolation
  ```
- [ ] **5.** Generate initial migration from current schema:
  ```bash
  alembic revision --autogenerate -m "initial schema snapshot"
  ```
- [ ] **6.** Extract each `ensure_*` function from `main.py` into a migration file:
  ```bash
  alembic revision -m "add report_verification_columns"
  # Then move the ALTER TABLE logic into the upgrade() function
  ```
- [ ] **7.** Remove all `ensure_*` functions from `main.py` (lines 29–877)
- [ ] **8.** Replace with a single startup check:
  ```python
  # In lifespan or startup
  # Optionally: alembic.command.upgrade(alembic_cfg, "head")
  ```
- [ ] **9.** Add `alembic` to `requirements.txt`

✅ **Verify:** `alembic upgrade head` runs cleanly. `alembic downgrade -1` successfully rolls back. Server starts without running DDL.

---

### Task 2.2 — Split `reports.py` into Sub-Routers + Service Layer
**Audit Ref:** Finding #5  
**⏱ Est:** ~1–2 hours (Antigravity splits 3K-line file, reroutes imports — you review the grouping)

**Target structure:**
```
backend/app/
├── routes/
│   └── reports/
│       ├── __init__.py          # Main router, includes sub-routers
│       ├── crud.py              # GET/POST/PATCH/DELETE report endpoints
│       ├── disputes.py          # Dispute endpoints
│       ├── transfers.py         # Transfer/claim/unclaim endpoints
│       ├── verification.py      # Verification/false-alarm endpoints
│       └── media.py             # Media upload/AI analysis endpoints
├── services/
│   ├── __init__.py
│   ├── report_service.py        # Business logic (status transitions, notifications)
│   ├── ai_service.py            # AI suggestion logic
│   └── notification_service.py  # Notification creation logic
```

**Steps:**

- [ ] **1.** Create `backend/app/services/` directory
- [ ] **2.** Extract business logic from route handlers into service functions
- [ ] **3.** Create `backend/app/routes/reports/` directory
- [ ] **4.** Split endpoints by domain (disputes, transfers, verification, media, CRUD)
- [ ] **5.** Wire sub-routers in `routes/reports/__init__.py`:
  ```python
  from fastapi import APIRouter
  from .crud import router as crud_router
  from .disputes import router as disputes_router
  # ...
  router = APIRouter(prefix="/reports", tags=["reports"])
  router.include_router(crud_router)
  router.include_router(disputes_router)
  ```
- [ ] **6.** Update `main.py` to import from the new package

✅ **Verify:** All existing API calls still return the same responses. Each sub-file is <500 lines.

---

### Task 2.3 — Split Monolithic Frontend Pages
**Audit Ref:** Finding #6  
**⏱ Est:** ~2–3 hours (4 mega-files to decompose — Antigravity extracts components + hooks, you verify rendering)

**Priority targets (by file size):**

| File | Size | Split Into |
|:---|:---|:---|
| `ResiHomePage.tsx` (289KB) | 4,003 lines | `ReportMap.tsx`, `ReportForm.tsx`, `ReportList.tsx`, `ReportFilters.tsx`, `useReports.ts` hook |
| `SubdViewReport.tsx` (241KB) | — | `ReportDetail.tsx`, `ReportActions.tsx`, `ReportComments.tsx`, `ReportTimeline.tsx`, `useReportDetail.ts` hook |
| `SubdReports.tsx` (225KB) | — | `ReportsTable.tsx`, `ReportFilters.tsx`, `ReportBulkActions.tsx`, `useReportsList.ts` hook |
| `BrgyReportView.tsx` (166KB) | — | Similar split to SubdViewReport |

**Steps:**

- [ ] **1.** For each page, extract data fetching into a custom hook:
  ```typescript
  // hooks/useReportDetail.ts
  export function useReportDetail(reportId: string) {
      const [report, setReport] = useState(null);
      const [loading, setLoading] = useState(true);
      // ... fetch logic extracted from the page
      return { report, loading, error, refetch };
  }
  ```
- [ ] **2.** Extract visual sections into standalone components
- [ ] **3.** Keep the page file as a thin layout shell that composes the components
- [ ] **4.** Target: no single `.tsx` file exceeds **500 lines**

✅ **Verify:** Pages render identically. Each file is <500 lines. No broken imports.

---

### Task 2.4 — Add React Query (TanStack Query) for Server State
**Audit Ref:** MT-6  
**⏱ Est:** ~1 hour (install + convert highest-traffic pages first; remaining pages can be done incrementally)

**Steps:**

- [ ] **1.** Install:
  ```bash
  cd frontend
  npm install @tanstack/react-query
  ```
- [ ] **2.** Wrap app in `QueryClientProvider` in `main.tsx`:
  ```typescript
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  const queryClient = new QueryClient();
  // Wrap <App /> with <QueryClientProvider client={queryClient}>
  ```
- [ ] **3.** Convert `useEffect` + `useState` fetch patterns to `useQuery`:
  ```typescript
  // BEFORE:
  const [reports, setReports] = useState([]);
  useEffect(() => {
      api.get('/reports/').then(res => setReports(res.data));
  }, []);

  // AFTER:
  const { data: reports = [], isLoading } = useQuery({
      queryKey: ['reports'],
      queryFn: () => api.get('/reports/').then(r => r.data),
  });
  ```
- [ ] **4.** Convert mutation calls to `useMutation` for auto-invalidation

✅ **Verify:** Data loads correctly. Navigating back to a page shows cached data instantly.

---

## Phase 3 — UI & Accessibility (~2–3 hours with Antigravity)

### Task 3.1 — Fix WCAG AA Contrast Failures
**Audit Ref:** Finding #10  
**⏱ Est:** ~10 min (update CSS variables + Button component)

**Steps:**

- [ ] **1.** Update CSS custom properties in `frontend/src/index.css`:
  ```css
  :root {
      --text-primary: #1F2937;     /* gray-800 — was OK */
      --text-secondary: #4B5563;   /* gray-600 — was #6B7280, too light */
      --text-muted: #6B7280;       /* gray-500 — for non-essential text only */
      --brand-orange: #EA580C;     /* orange-600 — was #F97316, fails contrast */
  }
  ```
- [ ] **2.** Update the Button component (`frontend/src/components/Button.tsx`):
  - Primary buttons: background `#EA580C`, text `#FFFFFF`
  - Ensure minimum 4.5:1 contrast ratio on all text
- [ ] **3.** Update form label colors across all login/form pages
- [ ] **4.** Use a contrast checker tool: https://webaim.org/resources/contrastchecker/

✅ **Verify:** Run axe DevTools or Lighthouse accessibility audit → zero contrast violations.

---

### Task 3.2 — Fix Login Page 60-30-10 Violation
**Audit Ref:** Finding #11  
**⏱ Est:** ~20 min (redesign left panel across 3 login pages — you confirm the aesthetic direction)

**Steps:**

- [ ] **1.** Redesign the left panel of login pages:
  ```
  BEFORE: Solid #F97316 orange (50% of viewport)
  AFTER:  Subtle gradient illustration with the app logo, 
          using a muted warm tone (e.g., #FFF7ED → #FED7AA)
          with a small orange accent on the logo only
  ```
- [ ] **2.** Target distribution:
  - 60%: white/off-white form area + muted left panel background
  - 30%: warm neutral tones (cards, borders, light gradients)
  - 10%: `#EA580C` orange on CTA button ONLY

✅ **Verify:** Screenshot the page → the CTA button is the most visually prominent element.

---

### Task 3.3 — Differentiate Login Portals by Role
**Audit Ref:** Finding #17  
**⏱ Est:** ~15 min (color theming + badges — done alongside Task 3.2)

**Steps:**

- [ ] **1.** Assign a distinct color scheme to each portal:
  | Portal | Primary Color | Left Panel Style |
  |:---|:---|:---|
  | Resident (`/login`) | Orange `#EA580C` | Warm/community illustration |
  | Staff (`/staff/login`) | Teal `#0D9488` | Professional/operational style |
  | Admin (`/admin/login`) | Slate `#1E293B` | Dark/authoritative style |
- [ ] **2.** Add a role badge/label to the login form header:
  ```
  🏠 Resident Portal    |    🛡️ Staff Portal    |    ⚙️ Admin Portal
  ```
- [ ] **3.** Consider adding a "Wrong portal?" link that directs to the correct login

✅ **Verify:** A user can instantly distinguish which login page they're on without reading text.

---

### Task 3.4 — Build a Design Token System (Replace Dark Mode Overrides)
**Audit Ref:** Finding #18 · LT-1  
**⏱ Est:** ~45 min (define tokens, batch-replace utility classes, delete 170 lines of overrides)

**Steps:**

- [ ] **1.** Define semantic tokens in `index.css`:
  ```css
  :root {
      --color-bg-primary: #FAFAF9;
      --color-bg-surface: #FFFFFF;
      --color-bg-sidebar: #FFFFFF;
      --color-text-heading: #111827;
      --color-text-body: #374151;
      --color-text-muted: #6B7280;
      --color-border: #E5E7EB;
      --color-action-primary: #EA580C;
      --color-action-destructive: #DC2626;
      --color-action-success: #16A34A;
  }

  html.dark {
      --color-bg-primary: #0B0F19;
      --color-bg-surface: #151C2C;
      --color-bg-sidebar: #090C15;
      --color-text-heading: #F8FAFC;
      --color-text-body: #CBD5E1;
      --color-text-muted: #94A3B8;
      --color-border: #1E293B;
      --color-action-primary: #F97316;
      --color-action-destructive: #EF4444;
      --color-action-success: #4ADE80;
  }
  ```
- [ ] **2.** Extend Tailwind config to use these tokens:
  ```js
  // tailwind.config.js
  theme: {
      extend: {
          colors: {
              surface: 'var(--color-bg-surface)',
              'text-body': 'var(--color-text-body)',
              action: 'var(--color-action-primary)',
              destructive: 'var(--color-action-destructive)',
          }
      }
  }
  ```
- [ ] **3.** Migrate components from `bg-white` → `bg-surface`, `text-gray-700` → `text-body`, etc.
- [ ] **4.** **Delete the 170 lines of `!important` dark-mode overrides** from `index.css`

✅ **Verify:** Toggle dark mode → all components theme correctly without `!important`.

---

### Task 3.5 — Distinguish Destructive Actions Visually
**Audit Ref:** Part A trust/security cues  
**⏱ Est:** ~15 min (add Button variant + apply across destructive actions)

**Steps:**

- [ ] **1.** Add a `destructive` variant to `Button.tsx`:
  ```typescript
  if (variant === 'destructive') {
      classes += ' bg-red-600 text-white hover:bg-red-700 focus:ring-red-500';
  }
  ```
- [ ] **2.** Apply to destructive actions across the app:
  - "Mark as False Alarm" → `variant="destructive"`
  - "Delete Report" → `variant="destructive"`
  - "Suspend Account" → `variant="destructive"`
  - "Reject Claim" → `variant="destructive"`
- [ ] **3.** Add a confirmation modal for all destructive actions:
  ```
  ⚠️ This action cannot be undone
  Are you sure you want to [action]?
  [Cancel]  [Confirm action_name]  ← red button
  ```

✅ **Verify:** Destructive buttons are visually red and require confirmation.

---

## Phase 4 — Compliance, Testing & Polish (~3–4 hours with Antigravity)

### Task 4.1 — Move Auth to httpOnly Cookies + Add Token Refresh
**Audit Ref:** Finding #8, #13 · MT-4  
**⏱ Est:** ~45 min (most complex single task — touches backend auth + frontend storage + interceptor)

**Steps:**

- [ ] **1.** Backend: Set JWT as `httpOnly`, `Secure`, `SameSite=Lax` cookie on login:
  ```python
  from fastapi.responses import JSONResponse

  response = JSONResponse(content={...user data without token...})
  response.set_cookie(
      key="access_token",
      value=token,
      httponly=True,
      secure=True,  # HTTPS only in production
      samesite="lax",
      max_age=900,  # 15 minutes
  )
  ```
- [ ] **2.** Add a `/auth/refresh` endpoint that issues new access tokens from a refresh token
- [ ] **3.** Backend: Extract token from cookie in `get_current_user()`:
  ```python
  token = request.cookies.get("access_token")
  ```
- [ ] **4.** Frontend: Remove all `localStorage.setItem('access_token', ...)` calls
- [ ] **5.** Frontend: Update `api.ts` to use `withCredentials: true` (already set with `allow_credentials`)
- [ ] **6.** Store only non-sensitive UI state (user name, role_id) — not PII like phone/address

✅ **Verify:** Browser DevTools → Application → Cookies shows `httpOnly` flag. `localStorage` has no tokens or PII.

---

### Task 4.2 — Add Security Headers Middleware
**Audit Ref:** Finding #16  
**⏱ Est:** ~3 min (copy-paste middleware class)

**Steps:**

- [ ] **1.** Add middleware in `backend/app/main.py`:
  ```python
  from starlette.middleware.base import BaseHTTPMiddleware

  class SecurityHeadersMiddleware(BaseHTTPMiddleware):
      async def dispatch(self, request, call_next):
          response = await call_next(request)
          response.headers["X-Content-Type-Options"] = "nosniff"
          response.headers["X-Frame-Options"] = "DENY"
          response.headers["X-XSS-Protection"] = "1; mode=block"
          response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
          response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
          return response

  app.add_middleware(SecurityHeadersMiddleware)
  ```

✅ **Verify:** `curl -I http://localhost:8000/` shows all security headers.

---

### Task 4.3 — Add Pagination to List Endpoints
**Audit Ref:** Finding #14  
**⏱ Est:** ~20 min (5 endpoints × ~4 min each — mechanical pattern)

**Steps:**

- [ ] **1.** Add pagination params to all list endpoints:
  ```python
  @router.get("/")
  def get_reports(
      skip: int = 0,
      limit: int = 50,
      db: Session = Depends(get_db)
  ):
      total = db.query(func.count(Report.report_id)).scalar()
      reports = db.query(Report).offset(skip).limit(limit).all()
      return {"items": reports, "total": total, "skip": skip, "limit": limit}
  ```
- [ ] **2.** Update frontend to pass `?skip=0&limit=50` and implement pagination controls
- [ ] **3.** Apply to: `/reports/`, `/users/`, `/pets/`, `/claims/`, `/rescue-requests/`

✅ **Verify:** `GET /reports/?limit=5` returns exactly 5 records with a `total` count.

---

### Task 4.4 — Add Foundational Test Suites
**Audit Ref:** Finding #9 · MT-5  
**⏱ Est:** ~1 hour (Antigravity generates test scaffolding + core test cases — you verify they pass)

**Steps:**

- [ ] **1.** Install test dependencies:
  ```bash
  # Backend
  pip install pytest pytest-asyncio httpx

  # Frontend
  cd frontend && npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
  ```
- [ ] **2.** Create backend test structure:
  ```
  backend/tests/
  ├── conftest.py            # Test DB setup, fixtures
  ├── test_auth.py           # Login, token validation, rate limiting
  ├── test_reports_crud.py   # Report create/read/update
  └── test_permissions.py    # Role-based access control
  ```
- [ ] **3.** Create frontend test structure:
  ```
  frontend/src/__tests__/
  ├── ProtectedRoute.test.tsx  # Auth bypass is actually blocked
  ├── api.test.ts              # Interceptor attaches token
  └── Button.test.tsx          # Renders variants correctly
  ```
- [ ] **4.** Add test scripts to `package.json` / `pyproject.toml`:
  ```json
  "scripts": {
      "test": "vitest run",
      "test:watch": "vitest"
  }
  ```
- [ ] **5.** Minimum coverage targets:
  - Auth flow: login success, login failure, token expiry, inactive account
  - RBAC: resident can't access admin routes, admin can't access resident-only
  - ProtectedRoute: denies on server error (the bug we fixed in Task 1.2)

✅ **Verify:** `pytest` and `npm run test` both pass with >80% coverage on auth flows.

---

### Task 4.5 — Add Data Retention & Deletion Capabilities
**Audit Ref:** Finding #19 · MT-5  
**⏱ Est:** ~20 min (export + anonymization endpoints)

**Steps:**

- [ ] **1.** Add a user data export endpoint:
  ```python
  @router.get("/users/{user_id}/export")
  def export_user_data(user_id: int, current_user: User = Depends(get_current_user)):
      # Return all data associated with this user as JSON
  ```
- [ ] **2.** Add a user data deletion endpoint:
  ```python
  @router.delete("/users/{user_id}/data")
  def delete_user_data(user_id: int, current_user: User = Depends(get_current_user)):
      # Anonymize or delete all personal data for this user
  ```
- [ ] **3.** Add TTL-based cleanup for:
  - Audit logs older than 1 year
  - Expired/revoked sessions
  - Orphaned media files

✅ **Verify:** Deleting a test user removes/anonymizes all their personal data.

---

### Task 4.6 — Remove Query-Parameter Token Acceptance
**Audit Ref:** Finding #15  
**⏱ Est:** ~2 min (delete 2 lines)

**Steps:**

- [ ] **1.** In `backend/app/utils/auth.py`, remove lines 81–82:
  ```python
  # DELETE THESE LINES:
  elif "token" in request.query_params:
      token = request.query_params.get("token")
  ```
- [ ] **2.** Update any frontend code that passes tokens via URL query params

✅ **Verify:** `GET /auth/me?token=valid_token` returns `401 Unauthorized`.

---

### Task 4.7 — Minor Cleanup
**Audit Ref:** Finding #20 + misc  
**⏱ Est:** ~5 min (batch renames + deletes)

- [ ] Rename `EscelatedMissions.tsx` → `EscalatedMissions.tsx` (update all imports)
- [ ] Delete unused `App.css` Vite boilerplate
- [ ] Delete stale SQLite files (`stray_safe.db`, `straysafe.db`) from backend directory
- [ ] Add `*.db` to `.gitignore` (already present, verify)
- [ ] Delete `SubdSettings.tsx.bak` backup file
- [ ] Remove `selectedClaim.sighting_location` file from project root

---

## Verification Checklist

After completing all phases, run through this final checklist:

- [ ] `grep -rn "http://localhost:8000\|http://127.0.0.1:8000" frontend/src/` → **0 results**
- [ ] `grep -rn "password123\|super_secret" backend/` → **0 results**
- [ ] `curl -I http://localhost:8000/` → security headers present
- [ ] Rapid login attempts → rate limited at 5/min
- [ ] Backend down + navigate to protected route → redirect to login (no fallback access)
- [ ] `GET /auth/me` → no `password` field in response
- [ ] `pytest` → all tests pass
- [ ] `npm run test` → all tests pass
- [ ] Lighthouse accessibility score → ≥90
- [ ] All files < 500 lines (verify with: `find frontend/src -name "*.tsx" -size +50k`)

---

## Progress Tracker

| Phase | Tasks | Est. (Antigravity + You) | Your Time | Status |
|:---|:---|:---|:---|:---|
| **Phase 1** — Critical Security | 1.1 – 1.5 | ~45 min coding | ~20 min (rotate keys on dashboards, review) | ❌ Not started |
| **Phase 2** — Architecture Debt | 2.1 – 2.4 | ~4–6 hours coding | ~1 hour (review splits, verify rendering) | ❌ Not started |
| **Phase 3** — UI & Accessibility | 3.1 – 3.5 | ~1.5–2 hours coding | ~30 min (confirm visual direction, check contrast) | ❌ Not started |
| **Phase 4** — Compliance & Testing | 4.1 – 4.7 | ~2.5–3 hours coding | ~30 min (run tests, verify cookies in DevTools) | ❌ Not started |
| | **TOTAL** | **~9–12 hours** | **~2.5 hours** | |

> [!TIP]
> **Realistic calendar time:** 2–3 focused sessions across 2–3 days. Phase 1 can be knocked out in a single sitting. Phases 2–4 are best done one per session so you can verify between rounds.

---

*Generated from the StraySafe 2.0 System Audit Report (2026-09-09)*
