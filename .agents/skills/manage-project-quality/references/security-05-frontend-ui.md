# Frontend & UI

## Phase 5: Frontend / UI Layer

**When to run this:** While building/reviewing client-side code — components, routing, state, build config.

**Goal of this pass:** Confirm the UI never becomes the actual security boundary, and that framework-specific escape hatches don't reopen XSS.

## How to use this reference

Use each stable control ID in a generated security worksheet. Record observed evidence before assigning a status; leave a control Unverified when evidence is unavailable. Preserve each dated worksheet as audit history.

## Sign-off criteria

- All Critical/High severity items must Pass or have an approved exception
  before this phase is considered complete.
- Total items in this phase: 10

---

## What to Check — Phase 5: Frontend / UI Layer

Use the applicable controls below to populate the worksheet findings table.

| Control ID | Source | Control | Severity | Evidence question |
|---|---|---|---|---|
| SEC-05-01 | `04_UI_Framework_Security/01_framework_xss_sinks.md` | Framework-Specific XSS Sinks | High | grep -r 'dangerouslySetInnerHTML\\|v-html\\|innerHTML' across the frontend source and confirm every hit sanitizes input (e.g. via DOMPurify) first. |
| SEC-05-02 | `04_UI_Framework_Security/02_client_side_routing_auth.md` | Client-Side Routing & Route Guards | High | Call the data-fetching API endpoint behind a guarded route directly via curl/Postman without going through the SPA route guard, and confirm it's still blocked server-side. |
| SEC-05-03 | `04_UI_Framework_Security/03_state_management_leaks.md` | State Management Data Leaks | Medium | Open Redux/Vuex devtools against the production build and search global state for tokens, secrets, or full user PII objects. |
| SEC-05-04 | `04_UI_Framework_Security/04_build_config_exposure.md` | Build Config & Source Map Exposure | Medium | Fetch every .map file path from the production bundle directly and confirm 404s; grep the deployed JS bundle for API key-shaped strings. |
| SEC-05-05 | `04_UI_Framework_Security/05_csp_framework_compatibility.md` | CSP Compatibility with UI Frameworks | Medium | Check the deployed CSP header for 'unsafe-inline'; if present, test whether nonces/hashes can replace it without breaking the framework's inline scripts. |
| SEC-05-06 | `02_Web_Vulnerabilities/02_xss.md` | Cross-Site Scripting (XSS) | Critical | Submit <script>alert(document.domain)</script> and common encoded variants into every reflected, stored, and DOM-rendered field. |
| SEC-05-07 | `02_Web_Vulnerabilities/03_csrf.md` | Cross-Site Request Forgery (CSRF) | High | Build an auto-submitting HTML form on a separate origin targeting a state-changing endpoint using the victim's real session cookie, and confirm it is rejected. |
| SEC-05-08 | `02_Web_Vulnerabilities/06_clickjacking.md` | Clickjacking | Medium | Embed the target page in an <iframe> on a test page and confirm the browser refuses to render it (frame-ancestors/X-Frame-Options enforced). |
| SEC-05-09 | `02_Web_Vulnerabilities/07_open_redirect.md` | Open Redirect | Medium | Set the redirect parameter to an external domain (and bypass tricks like //evil.com or trusted.com.evil.com) and confirm the app refuses or rewrites it. |
| SEC-05-10 | `03_Access_Control_Session_Auth/01_ui_ux_access_control.md` | UI/UX-Level Access Control | Medium | Call the underlying API directly with a lower-privilege token, bypassing the UI that hides the button, and confirm the server still denies it. |
