# PACT Phase 4 — UI Polish Completion

**Scope:** Loading experience, preview cleanup, navigation/footer, mobile regression coverage
**Status:** Complete and locally verified.

## P3-01 — Skeleton screens

- [DONE] Added route-level `loading.tsx` fallbacks for the root directory, Portfolio and Pact Detail.
- [DONE] Replaced the Pact Detail text-only loader with a layout-matched skeleton.
- [DONE] Added `role="status"`, `aria-live` and `aria-busy` semantics.
- [DONE] Disabled skeleton motion when `prefers-reduced-motion` is enabled.

Acceptance: navigation responds immediately, loading does not look like an empty state, and assistive technology receives one concise loading announcement.

## P3-02 — Preview mode cleanup

- [DONE] Removed the unused viewport-switcher implementation and its duplicate persisted state.
- [DONE] Removed the possibility that an old localStorage value could trap production UI inside a simulated phone frame.
- [DONE] Preserved the container query boundary used by responsive table/card components.

Acceptance: production always follows the real viewport; no floating preview control overlaps application actions.

## P3-03 — Footer and navigation cleanup

- [DONE] Split project resources into accurate Docs and Source links.
- [DONE] Added the configured protocol contract ArcScan link when available.
- [DONE] Replaced implied audit/formal-verification claims with the honest `Audit: planned` status.
- [DONE] Added a keyboard skip link and explicit footer navigation landmark.
- [DONE] External links use `noopener noreferrer`.
- [DONE] Raised the dim-text token contrast so small operational text meets the 4.5:1 WCAG AA threshold on PACT surfaces.

Acceptance: links have distinct destinations, no unpublished audit is presented as available, and keyboard users can bypass global navigation.

## P3-04 — Mobile experience

- [DONE] Mobile navbar shows the logo without the PACT wordmark to prevent crowding.
- [DONE] Pact Detail sticky action sits above the safe-area-aware bottom navigation.
- [DONE] Sticky CTA and bottom-navigation targets meet the 44px minimum.
- [DONE] Existing Overview/Portfolio mobile card layouts and New Pact step flow were preserved.
- [DONE] Added Playwright coverage for widths 360px, 390px and 412px, including horizontal-overflow and touch-target assertions.

Acceptance: no horizontal clipping at supported widths, navigation remains reachable, and the Pact Detail action bar does not cover bottom navigation.

## Explicitly excluded

- Swipe-only actions and long-press-only actions are not introduced because they hide critical financial operations and are inaccessible without a visible alternative.
- QR scanning is deferred until there is an approved camera-permission and address-verification design.
- Browser-native pull-to-refresh remains unchanged; a custom gesture would risk duplicate RPC refreshes and transaction-state confusion.

## Validation checklist

- [DONE] `npm run lint` — 0 errors, 0 warnings.
- [DONE] `npm run typecheck` — passed.
- [DONE] `npm run test` — 19 files, 145 tests passed.
- [DONE] `npm run e2e` — 55 passed, 5 intentionally skipped by viewport guards.
- [DONE] `npm run build` — Next.js 16.3.1 production build passed.
