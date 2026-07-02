# Implementation Plan: Platform Modernization Audit

Remediation tasks from the June 2026 audit. **Spec + implementation ship together in PR #55.**

Priority key: **P0** = correctness · **P1** = high value · **P2** = polish · **P3** = optional/deferred

---

## P0 — Correctness & future-proofing

- [x] 1. Migrate `$app/stores` → `$app/state`
- [x] 2. Remove unused dependencies (`bits-ui`, `clsx`, `tailwind-merge`)

---

## P1 — User-visible & security

- [x] 3. Share page social previews (`og:image`, `twitter:image` via `shareMeta.image`)
- [x] 4. Web Share API with clipboard fallback in `shareReplay()`
- [x] 4b. CSP report-only baseline in `hooks.server.ts`
- [ ] 6. PWA manifest dark `theme_color` — **deferred** (non-standard; `app.html` media queries cover browser chrome)

---

## P1 — PR #223 CSS pass (rowplay-adapted)

- [x] 7. `light-dark()` on custom design tokens in `app.css`
- [x] 8. Input UX hints (`enterkeyhint`, `inputmode` on search/number inputs)
- [x] 9. `prefers-reduced-motion` on component animations (global + named classes)
- [x] 10. `prefers-contrast` hairline adjustment

---

## P2 — HTML platform primitives

- [x] 11. Mobile nav → `<dialog closedby="any">`
- [x] 12. Filter panel → `<details bind:open>` (expand button retained; hidden summary)
- [x] 13. Annotation delete → `<dialog>` (replaces `window.confirm`)
- [x] 14. Search landmark (`<search>` wrappers)
- [x] 15. PWA meta `mobile-web-app-capable`
- [x] 16. Skip link + `id="main"`

---

## P2 — CSS polish (PR #223 continued)

- [x] 17. `content-visibility: auto` (`.cv-auto` on leaderboard rows, annotation items)
- [x] 18. `text-box-trim` on `.btn`/`.badge`; `text-wrap: balance` on headings
- [x] 19. `@starting-style` for live-mode new rows in `WorkoutList`
- [x] 20. Fix `.sr-only` clip → `clip-path: inset(50%)`
- [x] 21. `contain: layout paint` on uPlot host (+ global `.canvas3d-host` rule)

---

## P3 — Optional / deferred (now completed)

- [x] 22. Lucide subpath imports
- [x] 23. Scoped View Transitions API (`onNavigate` → `startViewTransition`, scoped to `<main>` via `view-transition-name: rp-main`; reduced-motion guarded)
- [x] 24. `@property` registrations
- [x] 25. `interpolate-size: allow-keywords`
- [x] 26. Analytics calendar math → shared `datetime.ts` day helpers (`addDaysToKey`/`dayOfWeekUtc`/`dayOfYearUtc`/`daysBetweenUtc` + `todayKeyUtc`/`dayKeyEpochMillis`)
- [x] 27. Font self-hosting + preload (Source Sans 3 / Source Code Pro via `@fontsource`; `?url` preload of the 400 body weight injected through `%fontPreload%`)
- [x] 28. `wrangler.jsonc` `nodejs_compat` review
- [x] 29. Three.js `outputColorSpace = SRGBColorSpace`
- [x] 30. Remove Temporal polyfill runtime dependency and bootstrap

---

## Historical Verification Snapshot

These checks record the PR #55 landing state for this completed audit. They are
not the current whole-app test counts; use `pnpm run check`, `pnpm run test`,
`pnpm run build`, and `pnpm run validate:locales` for current project health.

- [x] `pnpm run check` — 0 errors
- [x] `pnpm run build` — succeeds
- [x] `pnpm run test` — green at the time this audit landed
- [x] `pnpm run validate:locales` — after `nav.skipToContent` keys
- [x] `pnpm run test:e2e` — WebKit snapshot passed; run with the CI profile `CI=1` / 2 workers locally because `75%` workers + 0 retries flakes on the single `wrangler dev`

---

## Explicit non-tasks

- Replace TanStack Virtual with `content-visibility` on workout list
- Re-add bits-ui / clsx / tailwind-merge without usage
- Rebuild completed feature specs
