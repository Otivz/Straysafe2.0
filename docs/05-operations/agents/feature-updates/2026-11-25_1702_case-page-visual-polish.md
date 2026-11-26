# Case page: visual polish, brand consistency and motion

- **Date:** 2026-11-25 17:02 (UTC)
- **AI tool:** Claude Code (Claude Sonnet 5.5)
- **Files changed:** `frontend/src/admin/styles/case.css`, `frontend/src/admin/AdminApp.tsx`, `frontend/src/admin/pages/case/CaseDetailPage.tsx`, `frontend/src/admin/pages/case/AiInsightsCard.tsx`, `frontend/src/admin/pages/case/AssessmentTab.tsx`, `frontend/src/admin/pages/case/OverviewTab.tsx`, `frontend/src/admin/pages/case/ActionsTab.tsx`, `frontend/src/admin/dialogs/CoordinationDialogs.tsx`
- **Authorization:** Developer's request in the Claude Code session (with screenshots of a case's Assessment tab) to make the case page more professional, polished, organised and consistent with StraySafe's branding, with animation where possible.
- **Type:** Polish

## Intent

The standard case page mixed hard-coded colours and one-off Tailwind classes with the brand tokens, and its entrance animation was copy-pasted into several components. It now uses the brand tokens throughout and one shared set of styles and motion.

## Key changes

- New `styles/case.css`, scoped under `.sa-casepage` so no other admin page changes; every colour, radius and font comes from the brand tokens (burnt orange, warm orange, soft amber, warm neutrals, Plus Jakarta Sans headings).
- Header: a card with a brand colour stripe (orange to amber) along the top that sweeps in once, a reference chip, a balanced title, and a meta row (status, priority, reported date, assignee) with a divider. The back link nudges on hover.
- Alert bars: the Urgent response bar and the duplicate-report bar are now `.sa-alertbar` with red and amber tone tokens instead of hard-coded hex colours; the Urgent icon pulses softly.
- Tabs: the underline slides in on the selected tab, the selected tab and its count take the brand colour, and each tab's content fades in when it is chosen (the panel is keyed by tab).
- Panels: one radius, border and soft shadow from the tokens (the hard-coded border and shadow classes on the case tabs' panels were removed); a light lift on hover; cards fade up in a short stagger.
- AI Insights card, same content and behaviour: a brand-tinted card with a gradient icon tile and an "AI" badge, a smooth open and close (the body is animated and inert while closed), consistent small-caps section labels, the next steps as numbered cards with an arrow button that lift on hover, bulleted missing information, a quoted draft question with Copy, and a clear footer with Refresh. The decision gets a brand-colour rule.
- One shared `.sa-fade-up` in `case.css` replaces the inline `<style>` copies in the Assessment, Overview and Actions tabs and the coordination dialogs. The other pages that carry their own copy (Dashboard, Cases, Complaints, Community) are untouched.
- Motion is CSS only (no new dependency), under 350 ms, and the global reduced-motion rule in `preview/styles/tokens.css` already collapses it for people who ask for that.
- No behaviour, data or backend change.

## Validation evidence

- `npx tsc -b`: no errors. `npx eslint` on the changed files: 0 problems. The `case` folder also reports 5 errors in `PossibleOwnersBlock.tsx` and `RelatedReportsBlock.tsx`, files this change does not touch.
- `npx vite build` (to a temporary folder): builds; the new CSS and keyframes are in the admin bundle.
- Not checked: how it looks in a running app (spacing, the stripe, the open/close animation, narrow screens) and the other kinds of case page (complaint, lost/found), which only gain the AI card styling.
