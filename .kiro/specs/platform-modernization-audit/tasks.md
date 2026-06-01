# Implementation Plan: Platform Modernization Audit

Remediation tasks derived from the June 2026 audit. **Design/spec only until explicitly scheduled for implementation.**

Priority key: **P0** = do first / prevents future breakage · **P1** = high value · **P2** = polish · **P3** = optional

---

## P0 — Correctness & future-proofing

- [ ] 1. Migrate `$app/stores` → `$app/state`
  - `src/routes/+layout.svelte` — nav active paths
  - `src/routes/replay/[id]/+page.svelte` — ghost URL params
  - `src/routes/leaderboard/+page.svelte` — sport/distance filters
  - Replace `$page` with `page` (no `$` prefix)
  - _Refs: design.md §2.2_

- [ ] 2. Remove unused dependencies
  - Remove from `package.json`: `bits-ui`, `clsx`, `tailwind-merge`
  - Run `npm install` and verify build/tests
  - Update `.kiro/steering/tech.md` stack list (already corrected)
  - _Refs: design.md §1.1_

---

## P1 — User-visible & security

- [ ] 3. Share page social previews
  - Add `og:image` and `twitter:image` to `/r/[token]` (`+page.svelte` or server meta)
  - Use race-card PNG endpoint or static preview asset
  - _Refs: design.md §6.4_

- [ ] 4. Web Share API with clipboard fallback
  - Update `shareReplay()` in `replay/[id]/+page.svelte`
  - `navigator.share({ url, title })` → fallback `clipboard.writeText`
  - _Refs: design.md §3.2_

- [ ] 5. Content-Security-Policy (report-only first)
  - Add baseline CSP in `hooks.server.ts` or `_headers`
  - Start `Content-Security-Policy-Report-Only`; tighten after font/script audit
  - _Refs: design.md §6.1_

- [ ] 6. PWA manifest dark theme
  - Reconcile `theme_color` / `background_color` with dark mode or use neutral launch color
  - _Refs: design.md §6.2_

---

## P1 — PR #223 CSS pass (rowplay-adapted)

- [ ] 7. `light-dark()` on custom design tokens
  - Consolidate `:root` + `:root[data-theme='dark']` blocks in `app.css`
  - Keep daisyUI `@plugin "daisyui/theme"` unchanged
  - Use shadow token pattern for multi-value shadows (not wrapped in `light-dark()`)
  - _Refs: design.md §4.2, PR #223_

- [ ] 8. Input UX hints
  - `enterkeyhint="done"` on 3 numeric inputs (`EngagementPanel`, `CriticalPowerPanel`)
  - `inputmode="search"` + `enterkeyhint="search"` on 2 search inputs
  - _Refs: design.md §3.3_

- [ ] 9. `prefers-reduced-motion` on component animations
  - Move animations to CSS classes (not inline)
  - Suppress: `.row.new-entry`, `.vrow.new-entry`, `.vspin`, `.spin`
  - _Refs: design.md §4.2, PR #223 review lesson_

- [ ] 10. `prefers-contrast` adjustments
  - Increase border contrast for `--hairline` when `(prefers-contrast: more)`
  - _Refs: design.md §4.2_

---

## P2 — HTML platform primitives

- [ ] 11. Mobile nav → `<dialog closedby="any">`
  - Replace custom scrim/Escape logic in `+layout.svelte`
  - _Refs: design.md §3.2_

- [ ] 12. Filter panel → `<details>` / `<summary>`
  - `WorkoutListFilters.svelte` expand/collapse
  - _Refs: design.md §3.2_

- [ ] 13. Annotation delete → `<dialog>`
  - Replace `window.confirm()` in `AnnotationPanel.svelte`
  - _Refs: design.md §3.2_

- [ ] 14. Search landmark
  - Wrap search forms in `<search>` (`WorkoutListFilters`, replay session search)
  - _Refs: design.md §3.2_

- [ ] 15. PWA meta
  - Add `<meta name="mobile-web-app-capable" content="yes">` to `app.html`
  - _Refs: design.md §3.2_

- [ ] 16. Skip link
  - Add skip link + `id="main"` on `<main>` in `+layout.svelte`
  - _Refs: design.md §7_

---

## P2 — CSS polish (PR #223 continued)

- [ ] 17. `content-visibility: auto` on non-virtualized lists
  - Leaderboard table rows, annotation list, compare table
  - Set `--cv-intrinsic-height` per row type (~64px workouts, ~72px transactions-style)
  - **Do not** add to TanStack-virtualized `WorkoutList`
  - _Refs: design.md §4.2_

- [ ] 18. `text-box-trim` + `text-wrap: balance`
  - Controls: `.btn`, `.badge`, `.chip`, `.sbtn`
  - Headings: `h1`, `h2`, `h3`
  - _Refs: design.md §4.2_

- [ ] 19. `@starting-style` for live-mode new rows
  - Replace `@keyframes fade-in` in `WorkoutList.svelte`
  - Include reduced-motion override
  - _Refs: design.md §4.2_

- [ ] 20. Fix `.sr-only` deprecated clip
  - `UPlotChart.svelte`: `clip-path: inset(50%)` pattern
  - _Refs: design.md §4.3_

- [ ] 21. `contain: layout paint` on isolated widgets
  - Replay canvas host, uPlot containers
  - _Refs: design.md §4.2_

---

## P3 — Optional / when touching related code

- [ ] 22. Lucide subpath imports
  - `@lucide/svelte/icons/name` for maximum tree-shaking
  - _Refs: design.md §1.1_

- [ ] 23. Scoped View Transitions API
  - Dashboard → replay navigation; element-scoped, not root
  - _Refs: design.md §4.2, PR #223 review_

- [ ] 24. `@property` registrations
  - Animatable custom properties if drawer/filter transitions added
  - _Refs: design.md §4.2_

- [ ] 25. `interpolate-size: allow-keywords` on `:root`
  - Only if implementing height animations on dialog/details
  - Document global behavioral change in CSS comment (PR #223 lesson)
  - _Refs: design.md §4.2_

- [ ] 26. Unify analytics calendar math on Temporal
  - `analytics.ts` heatmap/date bucketing → `Temporal.PlainDate`
  - _Refs: design.md §5.1_

- [ ] 27. Font self-hosting + preload
  - Remove Google Fonts third-party dependency; improve CSP
  - _Refs: design.md §6.3_

- [ ] 28. `wrangler.jsonc` compatibility flag review
  - Evaluate `nodejs_compat` vs `nodejs_als` if Node API errors appear
  - _Refs: design.md §1.2_

- [ ] 29. Three.js `outputColorSpace`
  - Set `renderer.outputColorSpace = THREE.SRGBColorSpace` if color accuracy issues observed
  - _Refs: prior audit_

---

## Verification (run when implementing any task above)

- [ ] `npm run check` — 0 errors
- [ ] `npm run build` — succeeds
- [ ] `npm run test` — green
- [ ] `npm run test:e2e` — WebKit + webkit-mobile (especially after CSS/HTML changes)
- [ ] Demo mode smoke: `/dashboard` → `/replay/1001` → Play
- [ ] If auth touched: verify on `npm run preview` (Workers runtime)

---

## Explicit non-tasks (do not implement as part of this plan)

- Remove Temporal polyfill — required for WebKit + Workers SSR
- Replace TanStack Virtual with `content-visibility` on workout list
- Add bits-ui / clsx / tailwind-merge without concrete usage
- Rebuild completed specs (leaderboards, live mode, HR import, 3D replay, detail cache TTL)
