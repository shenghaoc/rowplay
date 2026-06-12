# Design Document: Sport-Aware 3D Replay

## Overview

`CourseRenderer3D` was written for rowing: a capsule-hull scull with a seated
rower and two oars, floating on a translucent, wave-displaced water plane with a
foam wake. This follow-up generalises the avatar and ground to the workout's
`sport` (`rower` / `skierg` / `bike`) while leaving the rest of the renderer —
lap circle, lane ring, marker posts, finish checker, chase camera, sprite
labels, theming, reduced-motion handling, quality tiers, and disposal —
untouched.

The change is contained almost entirely in `renderer3d.ts`. The only other edit
is passing `detail.sport` into the constructor on the replay page.

## Key seam

The renderer already separates **placement** (where an avatar sits on the lap
circle, its heading, bob and roll) from the **avatar mesh** (the boat). We
formalise the avatar as a small interface and introduce a per-sport profile that
supplies the avatar builder plus a handful of scene/animation knobs.

```ts
interface Avatar {
	group: THREE.Group;                       // placed on the lap circle; gets bob/roll
	animate(phase: number, reduceMotion: boolean): void; // sport-specific motion
}

interface SportProfile {
	waves: boolean;            // displace the ground into rolling water
	roll: boolean;             // side-to-side hull roll (water only)
	bobAmp: number;            // vertical bob amplitude (0 = planted)
	metersPerCycle: number;    // distance per full stroke/pedal cycle
	groundOpacity: number;     // water translucent; snow/asphalt solid
	trailColor: number | null; // spray colour, or null for no wake
	groundColor(theme: 'light' | 'dark'): number;
	make(accent: number, castShadow: boolean, opacity: number): Avatar;
}
```

`SPORT_PROFILES: Record<Sport, SportProfile>` maps each sport to its tuning.

## Avatars

All avatars travel along local **+Z**, carry `userData.accent` on the parts that
should re-theme to `--live` / `--ghost`, and expose `animate(phase, reduce)`
driven by the shared, distance-advanced `strokePhase`.

- **Rower** (`makeRowerAvatar`) — the original scull, refactored verbatim into
  the new shape: hull/deck/oar-blades are accent; the rower slides and leans and
  the oars sweep/feather per stroke.
- **Skier** (`makeSkierAvatar`) — skis + vest + pole baskets are accent; planted
  legs, an upper body that crunches forward, and two poles that swing fore/aft
  together (double-poling).
- **Cyclist** (`makeBikeAvatar`) — frame, wheel cross-spoke, and jersey are
  accent; two wheels roll about the X axis, cranks turn, and the thighs pedal in
  opposition. Wheels spin faster than the crank for legibility.

A shared `applyOpacity(group, opacity)` helper makes the ghost lane translucent.

## Per-sport tuning

| Sport | ground | waves | roll | bobAmp | m/cycle | trail |
|---|---|---|---|---|---|---|
| rower | water (laneLine palette, 0.4α) | yes | yes | 0.06 | 11 | foam (white) |
| skierg | snow (opaque) | no | no | 0.03 | 8 | spray (white) |
| bike | asphalt (opaque) | no | no | 0.02 | 5 | none |

Rowing values reproduce the previous behaviour exactly, so existing rowing
replays look identical.

## Renderer wiring

- Constructor gains `sport: Sport = 'rower'` and stores `this.profile`. Live and
  ghost avatars are built via `this.profile.make(...)`.
- The water mesh becomes a generic **ground** mesh (`name: 'ground'`); its
  segment count, opacity, transparency, and colour come from the profile. Wave
  displacement in `render()` is additionally gated on `this.profile.waves`.
- `placeBoat` → `placeAvatar`: bob uses `profile.bobAmp`, roll is applied only
  when `profile.roll`, and the per-frame animation delegates to `avatar.animate`.
- The stroke phase advances by `dLive / profile.metersPerCycle`.
- Wake trails are created only when `profile.trailColor !== null`, tinted with
  that colour; `WakeTrail` takes an optional `color`.
- `applyTheme` recolours the ground via `profile.groundColor(theme)` and the
  accents on both avatars (unchanged traversal).

## Replay page

`renderer = new Ctor3D!(canvas3dHost, quality, detail.sport)`. The default
parameter keeps the constructor backward compatible. The existing workout-change
`$effect` already destroys and rebuilds the renderer, so switching between a
rowing and a bike workout rebuilds with the correct sport for free.

## Non-goals

- No bespoke physics, terrain, or scenery per sport beyond ground colour/finish.
- No new course layout — the 1 km lap circle, posts, and finish line are shared.
- No data, engine, server, 2D-renderer, or i18n changes.

## Testing

- **Type:** `pnpm run check` verifies the `Avatar` / `SportProfile` shapes and the
  new constructor signature.
- **Unit:** existing Vitest suites stay green (loader/preference tests don't
  import `three`).
- **E2E (WebKit):** `tests/e2e/replay-3d.spec.ts` adds SkiErg (`/replay/1003`)
  and BikeErg (`/replay/1004`) cases that toggle to 3D and assert the WebGL
  canvas mounts — a sport-specific init throw (which would revert to 2D) fails
  the test instead of passing silently. Where CI WebKit lacks WebGL, the 3D
  option is asserted disabled (existing fallback path).
- **Build:** `pnpm run build` confirms `three` stays in its own lazy chunk.

## File Manifest

| File | Change |
|---|---|
| `src/lib/replay/renderer3d.ts` | `Avatar` + `SportProfile`; rower/skier/cyclist builders; ground/wake/cadence driven by profile; sport constructor arg |
| `src/routes/replay/[id]/+page.svelte` | Pass `detail.sport` to `CourseRenderer3D` |
| `tests/e2e/replay-3d.spec.ts` | SkiErg + BikeErg 3D-toggle cases |
| `.kiro/specs/3d-replay-sports/*` | This spec |
