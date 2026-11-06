# Subdivision-only Phase 3b: Barangay pages and sign-in retired

- **Date:** 2026-11-05 11:22 (UTC)
- **AI tool:** Claude Code (Claude Opus 5.5)
- **Files changed:** `frontend/src/pages/BarangayExternal.tsx` (new), `frontend/src/routes/AppRoutes.tsx`, `frontend/src/components/ProtectedRoute.tsx`, `frontend/src/components/Auth/SessionGuard.tsx`, `frontend/src/utils/useSignedInUser.ts`, `frontend/src/pages/Subd_Leaders/CommunityStaffLogin.tsx`, `frontend/src/components/Chat/ReportChatDrawer.tsx`, `frontend/src/components/PetRecords/PetDetailPanel.tsx`, `frontend/src/components/Navbars/LandingPageNavbar.tsx`, `frontend/src/pages/citizen/LandingPage.tsx`, `frontend/tests/barangayRetired.browser.mjs` (new), `frontend/tests/historyCaseSummary.browser.mjs`, `docs/06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md`, `docs/05-operations/agents/feature-updates/2026-11-05_1122_subdivision-only-phase3b-barangay-pages-retired.md`
- **Authorization:** The developer's instruction "3b go" on 2026-11-05, within the Phase 3 choices recorded in `2026-11-05_1100_subdivision-only-phase3a-leader-referral-screens.md` (old `/brgy` URLs show an information page).
- **Type:** Feature

## Intent

Part 3b of [SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md](../../../06-future-proposals/SUBDIVISION_ONLY_RESTRUCTURING_PLAN.md): the Barangay no longer has screens or a sign-in in StraySafe.

## Key changes

- **Information page** (`pages/BarangayExternal.tsx`, routes `/brgy` and `/brgy/*`): "The Barangay is handled outside StraySafe", with a Subdivision Leader sign-in link, or "Sign out" when the browser still holds a Barangay session.
- **Routes** (`AppRoutes.tsx`): the role-3 block, the shared role-3/4 adoptions block (including the duplicate `/brgy/adoptions`), `/brgy/pet/:petId/qr`, `/brgy/pet/:petId/scan-history` and `/brgy/adopt/journey*` are removed; `/admin/adoptions` moves into the Admin block (Admin only; made read-only in part 3c). Unused Barangay page imports are removed; `BrgyHoldingFacility` and `BrgyAdoptions` stay for the Admin archive.
- **Sessions:** a stored Barangay session is sent to the information page (`ProtectedRoute.tsx`; home path for role 3 is `/brgy` in `SessionGuard.tsx` and `useSignedInUser.ts`); `/brgy` is no longer treated as a signed-in staff area by the session guard.
- **Staff sign-in** (`CommunityStaffLogin.tsx`): Subdivision Leaders only; Barangay wording removed; the server's refusal message is shown. Landing page links read "Subdivision Leaders" and "Subdivision Leader Portal".
- **Shared links that a leader, resident or Admin could still reach:** the adoption-chat case link opens the Admin archive for the Administrator (`ReportChatDrawer.tsx`); the pet panel's adoption button shows only for the Administrator (`PetDetailPanel.tsx`).
- **Left unchanged (unreachable now; removed with the code deletion):** Barangay-only components (`BrgySidebar`, `BrgyNavbar`, `BrgyBottomNav`, Barangay pages) and `/brgy` path checks in shared utilities (`api.ts`, `inactivity.ts`, `PushBridge.tsx`, `RoleThemeSync.tsx`, `ThemeContext.tsx`, `WarningDetailsModal.tsx`, `MapComponent.tsx`, `ManualMatchingWorkspace.tsx`, `chatLinks.ts`, `petClaimLink.ts`, `MessagesDropdown.tsx`) that only apply on a Barangay page. Landing page role descriptions are Phase 4 wording.

## Validation evidence

- `node frontend/node_modules/typescript/bin/tsc -b frontend`: exit 0.
- `frontend/tests/barangayRetired.browser.mjs` (new; headless Chrome, mocked API): six `/brgy` addresses show the information page at 390 px without horizontal scroll; a stale Barangay session is redirected there and "Sign out" clears it; the staff sign-in refuses a Barangay account with the server message and lets a leader in; `/admin/adoptions` and `/admin/holding-facility` still open for the Administrator; no browser errors. All pass.
- `frontend/tests/historyCaseSummary.browser.mjs`: the retired `/brgy/history/1` case was removed; its "print log fails, page still prints" case now runs as a leader. All pass.
- Still passing: `barangayReferral.browser.mjs`, `notificationNavigation.test.mjs`, `caseStagesObservation.test.mjs`, `locationIntelligence.browser.mjs`, `caseSummary.browser.mjs`, `petRegistrationRules.test.mjs`.
- Known failing, retired feature, for Phase 5: `holdingStayLimit.browser.mjs` (opens `/brgy/holding-facility` and `/brgy/settings`).
