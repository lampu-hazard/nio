# Dashboard acceptance

Local fixture checks are not live Discord/API acceptance. No provider or Discord actions are authorized by this checklist.

## Shell checks

1. At 360px and 768px, open Menu with the keyboard. Expect a named modal navigation dialog, background inert, focus inside, and body scroll locked.
2. Tab through links; Escape or Close navigation restores focus to Menu and original body overflow.
3. Click outside the drawer to close. Resize to 1440px while open: dialog closes and desktop navigation is usable.
4. Follow a navigation link. Active route and header follow the shared navigation; Panels remains the guild root; Leaderboard stays inside the dashboard.
5. At 1440px and height 600px, all navigation links remain reachable by scrolling the sidebar.
6. Explicit light/dark themes override OS preference; with no explicit theme use OS preference. Public/owner routes retain their existing styling.

2026-11-01 local browser fixture (API deliberately 503): PASS at 360/768/1440px × 600px: modal showModal, initial Close navigation focus, Escape → Menu focus, original overflow restored, backdrop close, desktop resize close, no page horizontal overflow, short sidebar final link reachable, workspace leaderboard href. Thirty Tab presses did not focus background controls; native Chromium temporarily gives body focus at the browser-chrome boundary (not a background control). Explicit light on dark OS = #f5f6f2; system dark = #141719. Route-change/unmount and public comparison pending full acceptance. Bun/Turbopack dev exited 9 on compile; Node + webpack dev works. Console has expected fixture API 503 errors.

## Route matrix

Rows below retain the original full-acceptance status; targeted checks actually performed are recorded separately below. They do not imply every state/action was verified.

| Route | Status |
| --- | --- |
| /dashboard | NOT RUN |
| /dashboard/:guild/overview | NOT RUN |
| /dashboard/:guild (Panels) | NOT RUN |
| /dashboard/:guild/ai-agent | NOT RUN |
| /dashboard/:guild/voice-xp | NOT RUN |
| /dashboard/:guild/voice-notifications | NOT RUN |
| /dashboard/:guild/hall-of-fame | NOT RUN |
| /dashboard/:guild/stickers | NOT RUN |
| /dashboard/:guild/booster-roles | NOT RUN |
| /dashboard/:guild/tako | NOT RUN |
| /dashboard/:guild/moderation | NOT RUN |
| /dashboard/:guild/slowmode | NOT RUN |
| /dashboard/:guild/security | NOT RUN |
| /dashboard/:guild/logging | NOT RUN |
| /dashboard/:guild/embed-templates | NOT RUN |
| /dashboard/:guild/plugins | NOT RUN |
| /dashboard/:guild/analytics | NOT RUN |
| /dashboard/:guild/leaderboard | NOT RUN |
| /dashboard/:guild/audit-logs | NOT RUN |
| /dashboard/:guild/settings | NOT RUN |
| /dashboard/:guild/panels/new | NOT RUN |
| /dashboard/:guild/panels/:panel | NOT RUN |

## Feature form scenarios

2026-11-01 targeted local fixture evidence (not live Discord):
- Opened every workspace route in the matrix; one h1 and no page overflow at 360/768/1440 × 600 after fixing Moderation header wrapping and Analytics table sizing. Selector full matrix remains NOT RUN.
- Inspected dark Voice XP and Analytics screenshots. Chart crosshair returned fixture dates/values; accessible data tables opened. Role distribution fits its container.
- Observed exact PATCH bodies for all seven owned features; false/null/0 ownership also checked by runnable assertions. Notifications fetched no roles. Double submit produced one PATCH in the earlier notification check.
- Dirty navigation cancel/accept and in-memory draft recovery checked with stubbed confirm return values (not native confirm UI). A native beforeunload prompt was observed during Moderation navigation.
- Reproduced and fixed failed-load defaults/error-as-empty on Moderation, AI Agent, Tako, Booster Roles, Plugins and Embed Studio. Verified Retry and no editable failed-load defaults for configuration pages.
- Reproduced and fixed AI usage/Moderation warning filters discarding unsaved configuration; observed retained model/expiry values. Template rejected save now releases controls and retains draft.
- NOT RUN: complete A→B→A race matrix, all reward/missing-option interactions, full public/owner screenshot comparison and every legacy action.
- User explicitly stopped further Playwright testing and requested immediate push. Final accent changed from blue to purple #5145ee to match their supplied button; no browser retest after that request. Chart blue remains a separate data token. Final independent review was not completed.
- Fresh client assertion checks, typecheck and production build passed. Backend 48 suites / 363 tests passed; Jest reported open handles and was stopped, so no clean suite process exit. Separate backend build passed. No production migration or deployment performed.
