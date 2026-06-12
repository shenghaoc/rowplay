# Implementation tasks: 2D replay course — visual upgrade

Spec: `.kiro/specs/2d-replay-upgrade/`
Requirements: Req 1–7 · Design: `renderer.ts` drawing rewrite + 1 optional
`RenderState.sport` field threaded through two call sites.

Keep the class shape, `resize()`, the `render()` preamble (theme select, `w===0`
guard, `reduceMotion` read, phase advance, `clearRect`), and the
`COLORS_LIGHT/DARK` + `renderer.test.ts` palette contract.

## Tasks

- [ ] 1. Palette + helpers (no behaviour change yet)
  - [ ] 1.1 Add `skyTop`, `skyBottom`, `markerCap`, `foam`, `shadow` to
        `CanvasColors` and to **both** `COLORS_LIGHT` and `COLORS_DARK` (values
        per design table). Do not alter existing fields.
  - [ ] 1.2 Add pure `withAlpha(hex, a)` helper (`#rgb`/`#rrggbb` → `rgba()`).
  - [ ] 1.3 Add `streakLen(pace)` helper (faster ⇒ longer, clamp `[6,22]`,
        `NaN`/0-safe).
  - _Requirements: 3.2, 3.3, 5.2_

- [ ] 2. Thread optional `sport`
  - [ ] 2.1 `import type { Sport }`; add optional `sport?: Sport` to `RenderState`.
  - [ ] 2.2 Add `sport: detail.sport` to `buildState()` in
        `src/routes/replay/[id]/+page.svelte`.
  - [ ] 2.3 Add `sport: detail.sport` to `buildState()` in
        `src/routes/r/[token]/+page.svelte`.
  - _Requirements: 2.2, 6.1, 6.2_

- [ ] 3. Background + grid + finish gate
  - [ ] 3.1 `drawBackground()` — rounded strip, `skyTop→skyBottom` vertical
        gradient (replaces flat `courseFill`).
  - [ ] 3.2 `drawGrid()` — 11 guides (minor/major), buoy `markerCap` cap at the
        primary waterline, bottom mono labels (keep current label maths).
  - [ ] 3.3 `drawFinishGate()` — posts + checkered banner (reuse `cell` pattern)
        + faint accent glow; replaces `drawFinishFlag`.
  - _Requirements: 1.1, 1.6_

- [ ] 4. Lane scene — `drawLane(LaneOpts)`
  - [ ] 4.1 Water band (rounded, `withAlpha(accent,0.05→0.20)` vertical gradient).
  - [ ] 4.2 Waterline (`laneLine`, 1px) + 2 animated ripple polylines
        (`phase`, amp 0 under reduced motion).
  - [ ] 4.3 Wake trail: outer glow (`shadowBlur`, reset after) + core sine stroke
        (existing 1.2px amp, phase).
  - [ ] 4.4 Speed streaks behind `avX` (length from `streakLen(pace)`, fading
        alpha; static under reduced motion).
  - [ ] 4.5 Lane name tab (rounded, `accent` fill, `labelBg` text).
  - [ ] 4.6 Ghost lane drawn at `globalAlpha 0.82` and before YOU.
  - _Requirements: 1.2, 1.3, 1.7, 4.1, 4.3, 7.1, 7.2_

- [ ] 5. Avatar — `drawAvatar(AvatarOpts)`
  - [ ] 5.1 Bob (`sin(phase)*BOB_AMP`, 0 under reduced motion); cast shadow on
        waterline (`withAlpha(shadow,0.18)`).
  - [ ] 5.2 Dispatch to the per-sport athlete (or neutral pod fallback).
  - [ ] 5.3 HUD pill anchored to the waterline with caret (YOU/GHOST inversion +
        measure/pad).
  - _Requirements: 1.4, 1.5, 4.1, 7.2_

- [ ] 6. Sport avatars (animated, stroke-driven; replace clip-art glyphs)
  - [ ] 6.1 `drawRower` — racing shell + rower with a sweeping oar/blade splash.
  - [ ] 6.2 `drawSkier` — double-poling skier (high reach → low back-pull).
  - [ ] 6.3 `drawCyclist` — spinning spoked wheels + pedalling rider.
  - [ ] 6.4 `drawNeutralPod` — glossy pod fallback when `sport` is absent.
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 7. Wire `render()` body to the new pipeline
  - [ ] 7.1 Replace post-`clearRect` body with `drawBackground` → `drawGrid` →
        `drawFinishGate` → ghost lane+avatar → YOU lane+avatar. Keep the preamble
        verbatim.
  - [ ] 7.2 Reset `ctx.shadowBlur`/`globalAlpha` between layers; pair every
        `save`/`restore`.
  - _Requirements: 1.1–1.7, 2.1, 5.1–5.3, 7.1_

- [ ] 8. Reduced-motion audit
  - [ ] 8.1 Confirm ripples, bob, bow-wave splash, streak shimmer all collapse to
        static when `reduceMotion`; scene stays legible.
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 9. Tests + gate
  - [ ] 9.1 Keep `renderer.test.ts` green (palette mirror).
  - [ ] 9.2 (Optional) add a render smoke test (stub 2D ctx) covering solo, ghost,
        each sport, reduced-motion — no throw.
  - [ ] 9.3 `pnpm run check` → 0 errors; `pnpm run build` → succeeds;
        `pnpm run test` → green.
  - [ ] 9.4 Manual demo verification (light/dark, play, scrub, ghost, sports,
        reduced-motion, shared `/r/<token>`).
  - _Requirements: 2.3, 3.1, 3.2, 5.1_
```
