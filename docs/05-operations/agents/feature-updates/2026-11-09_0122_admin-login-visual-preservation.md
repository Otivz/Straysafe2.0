# Admin sign-in screen: the original Subdivision Leader look on the new design system

- **Date:** 2026-11-09 01:22 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/admin/components/AuthShell.tsx`, `frontend/src/admin/pages/auth/LoginPage.tsx`, `frontend/src/admin/styles/pages.css`, `docs/README.md`, `docs/05-operations/agents/feature-updates/2026-11-09_0122_admin-login-visual-preservation.md`
- **Authorization:** Developer request in Claude Code: "StraySafe 2.0 — Subdivision Leader Login Visual Preservation". A stakeholder asked for the original Subdivision Leader login's appearance to be preserved in the new Admin interface, and the developer likes the new Admin login, so the two are blended. FREEZE was OFF.
- **Type:** Polish

## Intent

Keep the new Admin sign-in recognisable to anyone who knows the legacy Subdivision Leader sign-in, while keeping the new design system's labels, states, spacing and accessibility. Presentation only: the gateway, validation, routes and sessions are untouched.

## The original, as inspected

The Subdivision Leader (role 2) signs in at `/staff/login`, which is `frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx`. The system administrator has a separate page (`pages/Admin/AdminLogin.tsx`) that was not used as the reference. Its identity:

- **From 1024px, a 50/50 split.** The left half is solid orange (`#F97316`) with a deep edge shadow. On it: the logo knocked out to white (up to 280px), a very heavy uppercase headline "OPERATIONS PORTAL" on two lines, a short translucent rule, and "SUBDIVISION LEADERS" in small tracked capitals. The same logo is repeated as a 10%-opacity, 150%-scaled, 12°-rotated watermark, which gives the large soft cat and dog shapes.
- **The right half** is off-white with a centred column: the colour logo, a heavy uppercase title, a short orange bar, a grey tagline, rounded inputs with a soft shadow and placeholder-only labels, "Keep me logged in", "Forgot password? Reset now", a full-width uppercase orange "LOGIN TO PORTAL" button, and a notice that the portal is restricted to authorized Subdivision Leaders.
- **Below 1024px the orange half disappears completely.**
- **Accessibility problems:** white on that orange measures 2.80:1 (the 80%-white subtitle 2.28:1), the grey tagline and notice 2.41:1, the fields have no visible labels, and the control text is 11–14px.

## Kept from the original

- The split screen and its 1024px breakpoint, with the orange half on the left and a light form half on the right.
- The orange half's contents: the watermark (same image, same scale and rotation), the white knocked-out logo with its soft shadow, the two-line uppercase headline, the rule, and "Subdivision Leaders".
- The colour logo above a centred heading with the short orange bar, the roomy rounded inputs, the full-width uppercase orange button, and the restricted-access notice with its original wording.
- Existing assets only: `/SSLOGO.png` for the watermark and the white logo, `/SSLOGO-128.png` for the colour mark. Nothing was added to `public/`.

## Improved with the new design system

- **Colour.** The palette's brand orange `#C65A17` replaces `#F97316`. Text on it is only ever large text (4.31:1, 3:1 needed): the 56px headline and the 19px bold label. The button label is 4.86:1, using a 7% deeper shade of the same orange computed in the stylesheet (`--auth-fill`), so no new global token.
- **Forms.** Visible labels, the system's field, validation, error and loading states, the 4px focus ring, 16px input text (no zoom on iPhones), 48px fields and button, a 40px password toggle and a 40px-high "Forgot password?" target. Notice, tagline and flow strip text measure 5.6–7.5:1.
- **Type and surfaces.** Plus Jakarta Sans 800 for the headline and titles, and the palette's warm off-white page.
- **Small screens.** The orange half becomes a compact band across the top (logo and "Operations Portal", plus "Subdivision Leaders" from 640px) instead of vanishing.
- **Short windows.** On windows at least 700px tall, the orange half stays in view while the form column scrolls.
- **Kept from the new login:** the sample-account note and the "How a case moves" strip.

## Not carried over

- "Keep me logged in": nothing in the preview sits behind it, and new authentication features were out of scope.
- The "LOGIN TO PORTAL" wording and the hover lift: the button keeps "Sign in" (set in uppercase letters), with no animation.
- The installed-app server-address control and the original's cool-grey page tint.

## Shared shell

The forgot-password and reset-password screens use the same shell, so they get the same frame and centred titles. Their forms, copy, validation and navigation are unchanged.

## Not changed

The authentication gateway, validation, error and loading states, routes and sessions; the content of the sample-account note; `tokens.css`; the rest of the Admin preview; the Resident preview; every legacy page (the legacy leader and administrator sign-ins render byte-identical screenshots before and after). No dependency, backend or database change. No commit or push.

## Worth knowing

After sign-in the sidebar still reads "StraySafe Subdivision Admin", while the sign-in screen now says "Operations Portal" and "Subdivision Leaders", as the original did. Align the two later if wanted.

## How to preview

```
cd frontend
npm run dev          # then open http://localhost:5173/admin-preview/login
```

For comparison, the original is at `/staff/login`. Use "Sign in with the sample account" (or the credentials shown on the page), "Forgot password?" for the reset flow, and the browser's device toolbar for 390px and 768px.

## Validation evidence

- `npx tsc -p tsconfig.app.json --noEmit` and `npx tsc -b`: no errors. `npx eslint src/admin src/preview src/resident src/main.tsx`: clean.
- Headless Chrome against the dev server, no backend, 96 checks on this page, all passing:
  - Layout at 1440, 1280×720, 1024, 768, 390 and 360 px: no horizontal overflow; the split from 1024px and a band below it; the orange half stays in view while the form scrolls.
  - Semantics: one `h1`, one `main`, the logo named "StraySafe", decorative images with empty alt text, and a tab order that follows the visual order.
  - States: validation messages, wrong credentials, the password toggle, the focus ring, the forgot, sent, reset and back-to-sign-in round trip, an invalid reset link, and the sample and typed sign-in.
- Measured contrast, from computed styles: the headline and "Subdivision Leaders" on the orange 4.31:1 (large text), the button label 4.86:1, field labels 14.5:1, tagline 7.5:1, notice and flow strip 5.6:1, "Forgot password?" 6.1:1.
- Existing suites unchanged, run one at a time: Admin flows 102 (45 and 57), the "Analytics" rename check 30, Resident sign-in 40 and 31 Resident screens with no overflow at 390 px, legacy routes with no page errors, and all 42 design tokens still resolving in both UIs.
- `npx tsc -b && npx vite build` (output to a scratch folder): succeeds, 214 files as before; none of 46 isolation markers (five are new, for the sign-in shell), no preview chunk and no sign-in CSS. The development-mode build trips the new markers, so the check can fail.
- `npx @ghostbyte/agent-docs-kit@latest audit documentation --strict`: the same 12 failures as before this change (8 broken links to ERD, DFD and audit documents that do not exist, 4 missing agent-pointer files). None comes from this change.
