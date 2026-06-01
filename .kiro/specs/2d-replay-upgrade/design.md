# Design: 2D replay course — visual upgrade

## Overview

Rework the drawing internals of `src/lib/replay/renderer.ts` so the default
course strip renders a layered, broadcast-style race scene: a depth background,
per-lane water with ripples, an illuminated wake with speed streaks, a glossy
sport-aware avatar pod with a cast shadow and bow wave, buoy-capped distance
markers, and a checkered finish gate. The class shape, public methods, and the
engine→`RenderState` contract are unchanged. One optional field (`sport`) is
threaded through `RenderState` from the two call sites.

This is a **drawing rewrite, not an architecture change.** Keep the existing
fields (`ctx`, `dpr`, `w`, `h`, `phase`, `ghostPhase`, `colors`, `reduceMotion`),
the `resize()` body, the reduced-motion plumbing, and the
`COLORS_LIGHT/DARK` + `renderer.test.ts` palette contract.

## Public surface (unchanged)

```ts
class CourseRenderer {
  constructor(canvas: HTMLCanvasElement)
  resize(cssWidth: number, cssHeight: number): void          // keep as-is
  render(state: RenderState, playing: boolean,
         themeName?: 'light' | 'dark'): void                 // same signature
}
```

`render()` keeps its current top matter verbatim: theme select into `this.colors`,
early-return when `w === 0`, `this.reduceMotion = prefersReducedMotion()`, the
`playing && !reduceMotion` phase advance (`phase`/`ghostPhase`), and
`clearRect`. Everything below the clear is replaced by the new scene.

## Type additions (additive, optional)

```ts
import type { Sport } from '../types';

export interface RenderState {
  frame: Frame;
  distFrac: number;
  totalDistance: number;
  ghost?: AvatarState;
  sport?: Sport;          // NEW — optional; renderer degrades to neutral marker
}
```

Call-site wiring (one line each):

- `src/routes/replay/[id]/+page.svelte` → `buildState()` returns add
  `sport: detail.sport`.
- `src/routes/r/[token]/+page.svelte` → `buildState()` returns add
  `sport: detail.sport`.

`AvatarState` is unchanged.

## Coordinate model

Same horizontal framing as today:

```
padL = 58, padR = 30
startX = padL, finishX = w - padR, span = finishX - startX
hasGhost ? playerY = h*0.70, ghostY = h*0.34
         : playerY = h*0.56
avX(frac) = startX + span * clamp01(frac)
```

Vertical bands per lane (centred on lane y):

```
WATER_H        = 34         // water band height (top = y - WATER_H*0.30, bottom = y + WATER_H*0.70)
POD_R          = 9          // avatar pod radius
BOB_AMP        = 2.2        // vertical bob amplitude (0 under reduced motion)
```

The lane line `y` is the **waterline**: water is drawn mostly below it, the pod
and wake sit on it, ripples live just below it.

## Scene draw order (per `render`, after `clearRect`)

1. **`drawBackground()`** — rounded-rect clip of the strip; fill a vertical
   gradient `skyTop → skyBottom`; this replaces the flat `courseFill`.
2. **`drawGrid(startX, span, h, state.totalDistance)`** — 11 vertical guides
   (minor `tickMinor`, every-5th `tickMajor`), each capped at the *primary*
   waterline with a small **buoy** dot (`markerCap`); bottom numeric labels in
   `tickText`, 10px mono, as today.
3. **`drawFinishGate(finishX, top, bottom)`** — two slim posts + a checkered
   banner column (reuse the `cell`-stepped `finishDark`/`finishLight` pattern)
   with a faint accent glow line. Replaces `drawFinishFlag`.
4. **Ghost lane** (if `state.ghost`), then **YOU lane** — draw ghost first so YOU
   overlaps on top. Each via `drawLane(opts)` then `drawAvatar(opts)`.
5. (No global foreground needed.)

Lanes are drawn ghost-before-you so the live racer wins any overlap; this matches
today's subordinate-ghost hierarchy.

## Per-lane rendering

### `drawLane(o: LaneOpts)`

```ts
interface LaneOpts {
  startX: number; span: number; y: number;
  frac: number;            // clamp01 already applied by caller or inside
  accent: string;          // C.live or C.ghost
  phase: number;           // this.phase or this.ghostPhase
  pace: number;            // for streak length; ghost uses ghost.pace
  isYou: boolean;          // hierarchy: ghost gets globalAlpha 0.82, no extras
  nameTab: string;         // 'YOU' | 'GHOST'
  padL: number;
}
```

Steps:

1. **Water band.** Fill a rounded region from `startX..startX+span`, vertically
   `y - WATER_H*0.30 .. y + WATER_H*0.70`, with a vertical gradient
   `withAlpha(accent, 0.05) → withAlpha(accent, 0.20)` over the background. Lane
   colour tints the water (violet for YOU, teal for GHOST).
2. **Waterline.** 1px `laneLine` stroke at `y` across the full span (the calm
   reference line, as today).
3. **Ripples.** 2 faint horizontal sine polylines just below `y`
   (offsets ~`+5`, `+11`), `withAlpha(accent,0.25)`, amplitude `reduceMotion ? 0
   : 1.5`, scrolled by `phase`. Skip when `reduceMotion` AND not needed — but a
   flat ripple line at amp 0 is fine to keep structure.
4. **Wake / progress trail.** From `startX` to `avX`:
   - Outer glow: same path stroked wide (`lineWidth 7`) in `accent` with
     `ctx.shadowColor = accent`, `ctx.shadowBlur = 8`; reset shadow after.
   - Core: `lineWidth 3` accent, the existing low sine displacement
     (`amp = reduceMotion ? 0 : 1.2`, `phase`).
5. **Speed streaks.** 3–4 short horizontal dashes trailing *behind* `avX`
   (decreasing length/opacity), length `≈ clamp(streakLen(pace), 6, 22)` where
   faster pace ⇒ longer; `withAlpha(accent, 0.35)`. Static positions under
   reduced motion (no shimmer offset).
6. **Lane name tab.** Left gutter rounded tab (`6, y-9, padL-16, 18`, radius 4)
   filled `accent`; text `nameTab` in `labelBg`, 700 10px mono, centred.

Ghost lane wraps steps in `ctx.save(); ctx.globalAlpha = 0.82; … ctx.restore()`.

### Sport avatars (revised)

The avatar is **not** a generic pod with a tiny clip-art glyph (that read as
unfinished). Instead each sport draws a **side-profile athlete animated by the
stroke phase**, so the marker both identifies the machine and conveys cadence:

- **rower** → a racing shell on the water with a rower whose torso and **oar
  sweep** through the catch→drive→recovery cycle (`sin(phase)`); the blade dips
  and throws a small foam splash on the drive.
- **skierg** → a skier **double-poling**: arms/poles swing from a high reach to a
  low back-pull each stroke, with a slight crouch on the pull.
- **bike** → a cyclist whose **wheels spin** (rotating spokes) and **legs pedal**
  with the phase.
- **default / `sport` absent** → the glossy neutral pod (graceful fallback).

Shared chrome around every avatar: a cast shadow on the waterline, the bob
(`sin(phase)`, 0 under reduced motion), and the HUD pill (anchored to the
waterline so it doesn't bob with the figure). Under reduced motion the phase is
frozen to a representative static pose. Figures are drawn in the lane `accent`
with a contrast `rim`; the ghost lane keeps `globalAlpha 0.82`.

### `drawNeutralPod` / legacy pod (fallback only)

```ts
interface AvatarOpts {
  x: number; y: number;    // x = avX, y = lane waterline
  accent: string;
  phase: number;
  spm: number;
  isYou: boolean;
  sport?: Sport;
  label: string;           // pace·% (YOU) or "<label> · NN%" (GHOST)
}
```

Steps:

1. **Bob.** `by = y + (reduceMotion ? 0 : Math.sin(phase) * BOB_AMP)`; the pod,
   shadow, bow wave and HUD pill all reference `by`.
2. **Cast shadow.** Flattened ellipse on the water at `(x, y + 6)`, width ~`POD_R*1.8`,
   height ~`POD_R*0.5`, `withAlpha('#000', 0.18)` (use a `shadow` palette field so
   dark theme uses a lighter cast). Anchored to the waterline `y`, not `by`, so
   the pod appears to lift off it.
3. **Bow wave.** A small foam crescent just ahead of the pod (`x + POD_R`), an arc
   in `foam` colour, amplitude scaled by `spm`; omit the splash motion under
   reduced motion (draw a minimal static crescent).
4. **Pod.** Filled circle radius `POD_R` in `accent`; a top highlight (smaller
   off-centre arc in `withAlpha(foam, 0.5)`) for gloss; a 1.5px rim in
   `accent` (YOU) or `labelText` (GHOST).
5. **Sport glyph.** `drawSportGlyph(ctx, x, by, sport, glyphColor)` where
   `glyphColor = labelBg`. Glyph fits within `~POD_R*1.2`. When `sport` is
   undefined, draw the existing small inner dot (YOU: `bibDot`, GHOST: `labelBg`).
6. **HUD pill.** Rounded label above the pod (`pillY = by - 24`), `accent`-tinted
   per today's YOU/GHOST inversion, text in 600 10px mono, with a tiny downward
   caret pointing at the pod. Reuse the current measure/pad logic.

## Sport glyphs — `drawSportGlyph(ctx, cx, cy, sport, color)`

Vector-only, ≤ `2*POD_R` wide, drawn in `color`. Keep simple and recognisable
(these mirror the lucide icons used elsewhere: Sailboat / Snowflake / Bike):

- **rower** → a sailboat: a shallow hull arc (chord under `cy`) + an upright mast
  and a right-leaning triangular sail.
- **skierg** → a snowflake: three lines through `cx,cy` at 0°/60°/120° with tiny
  end barbs.
- **bike** → a bike: two small wheel circles with a connecting frame stroke.

Each is a handful of `moveTo/lineTo/arc` calls; stroke width ~1.2, `lineCap
round`. Provide a `default` branch = a single filled dot (neutral marker).

## New palette fields

Extend `CanvasColors` and **both** `COLORS_LIGHT`/`COLORS_DARK`. Do **not** touch
existing fields (the test locks `live`/`ghost`). Suggested values:

| Field      | Purpose                         | Light     | Dark      |
|------------|---------------------------------|-----------|-----------|
| `skyTop`   | strip background top            | `#f2f7f9` | `#0e1d26` |
| `skyBottom`| strip background bottom         | `#e3edf1` | `#0a151c` |
| `markerCap`| buoy dot at tick × waterline    | `#9fb8c2` | `#3d505a` |
| `foam`     | bow wave / pod highlight        | `#ffffff` | `#bcd3dd` |
| `shadow`   | pod cast shadow base (rgba mix) | `#0f2a36` | `#000000` |

`shadow` is used via `withAlpha(shadow, 0.18)`. All other tints derive from the
lane `accent` via `withAlpha`, so no per-sport colour constants are needed.

## Helpers

- Keep `clamp01` and `roundRect`.
- Add `withAlpha(hex: string, a: number): string` — parse `#rgb`/`#rrggbb` to
  `rgba(r,g,b,a)`. Pure, no allocation concerns. (Used for water tint, glow,
  streaks, shadow, highlight.)
- Optional `streakLen(pace: number): number` — map pace seconds/500m to a streak
  length; faster (smaller pace) ⇒ longer. Clamp to `[6, 22]`. A guarded linear
  map is fine; never `NaN` for `pace === 0`.

## Animation & phase model

- Reuse `this.phase` / `this.ghostPhase`; advance only when
  `playing && !reduceMotion` (already in `render`). Used for ripples, wake sine,
  bob (`sin(phase)`), bow-wave splash, and streak shimmer.
- No new timers/listeners/rAF — the engine drives frames. `reduceMotion` is read
  per-frame from the existing `MediaQueryList`.

## Reduced motion

When `this.reduceMotion`:
- ripple amplitude → 0, wake sine amp → 0, bob → 0, bow wave → minimal static
  crescent, streaks → fixed positions (no phase offset), no stroke-pulse.
- All static geometry (water band, trail, pod, glyph, labels, markers, gate)
  still draws — the scene is legible at rest.

## Performance notes

- Gradients (`createLinearGradient`) are created per frame but bounded:
  1 background + ≤2 lane water bands. This is acceptable at 60fps; do **not**
  retain gradient objects across frames in a way that risks staleness on
  resize/theme change. (Caching keyed by `w|h|theme` is an allowed optimisation
  but **not required** — correctness first.)
- Always pair `ctx.save()`/`ctx.restore()` around shadow/alpha/clip changes and
  reset `shadowBlur = 0` after glow strokes so it doesn't bleed into later draws.
- DPR cap (≤2) and the single `clearRect` redraw are unchanged.

## Testing strategy

| Layer  | What |
|--------|------|
| Unit   | `renderer.test.ts` stays green (palette mirror). Optionally add a smoke test that constructs `CourseRenderer` against a stubbed 2D context and calls `resize`+`render` for solo, ghost, each `sport`, and reduced-motion without throwing. |
| Type   | `npm run check` → 0 errors. New `sport?` field type-checks at both call sites. |
| Build  | `npm run build` succeeds (renderer is client-only; no SSR `window` access outside the existing guard). |
| Manual | Demo: `/replay/1001` light+dark, play/pause, scrub, ghost on/off, each sport; `prefers-reduced-motion` shows static scene; shared `/r/<token>` still renders. |

If a smoke test is added, the stubbed context must implement the methods the
renderer calls (`createLinearGradient` returning an object with `addColorStop`,
plus the path/draw no-ops) — or guard with a tiny fake. Keep it lightweight; the
palette test is the contract that must not regress.

## Correctness properties

1. Public API (`constructor`/`resize`/`render`) and canvas heights unchanged →
   both consumers render without edits beyond the one optional `sport` field.
2. `COLORS_*.live/ghost` unchanged → `renderer.test.ts` green.
3. New colours exist in both palettes → no theme-specific crash or unreadable
   element.
4. `sport` absent → neutral marker, no throw (`/r/[token]` path).
5. Reduced motion → zero decorative animation, full legibility.
6. No new timers/listeners/rAF/deps; bounded ops per frame.
