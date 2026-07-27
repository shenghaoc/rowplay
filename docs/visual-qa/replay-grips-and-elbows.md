# Replay visual QA — anatomical grips and rowing elbow corridor

Scope: the geometry-constrained hand-grip rework and the boat-local rowing
elbow corridor (`codex/replay-grips-and-rowing-elbows`). This note records the
measured before/after state, the capture matrix, and the honest remaining
limitations.

## What was wrong (measured on `main` @ `47c4c60`)

Instrumenting the shipped production V4 athlete through the real renderer
(1140×420 stage, Ultra, 64–256 samples per cycle):

| Defect                                                                    | Measurement on `main`                                                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| RowErg hand orientation vs its oar grip frame                             | 48–79° error (the 8° slerp budget could never close it)                                  |
| BikeErg hand orientation vs its hood frame                                | 100–103° error                                                                           |
| RowErg finger-pad distance from the rubber surface                        | 26–77 mm (fingers curled beside the handle)                                              |
| SkiErg thumb pad from the grip surface                                    | ~38 mm (no opposition)                                                                   |
| RowErg elbow outboard of the shoulder→wrist working plane during the draw | **0.27–0.30 m** with 45–50° humeral abduction — the measured chicken wing                |
| RowErg extraction (cycle 0.40–0.44)                                       | left/right arms selected different branches (left at 0.06 m out while right held 0.28 m) |

Root causes: (1) a fixed `side * 0.12` athlete-local lateral bias added to the
V4 rowing elbow bend hint; (2) a scored two-branch elbow selection whose
corridor and height-band goals conflicted at extraction; (3) grips modelled as
one palm point plus fixed per-sport curl constants, with terminal hand
orientation limited to an 8° slerp for RowErg/BikeErg.

## What changed

- `rowRig.ts`: one continuous, C1 elbow-plane contract (`rowerElbowPlane`)
  with an exact closed-form clamp on the elbow circle
  (`ROWER_ELBOW_CORRIDOR`: ≤0.11 m outboard of the working plane, ≤0.05 m
  inboard, rearward-dominance ratio ≤0.5). The scored branch selection and the
  V4-side lateral bias are deleted.
- `handGrip.ts` (new): grip-channel model derived from the already-pinned
  SkiErg fist measurements (`handChannelCentre(radius)` reproduces the fitted
  fist centre exactly at 0.0169 m); a digit-closure solver that flexes each
  phalanx until it contacts the analytic equipment surface (0.023 m scull
  rubber with a flat thumb stop, 0.0169 m ski channel, 0.016 m hood core) and
  stops there; and the generalised grip-frame orientation (curl axis laid on
  the signed shaft direction, spin resolved explicitly, equipment roll about
  its own axis cancelled — feathering rolls the handle inside the fingers).
- `renderer3dV4Motion.ts`: every hand adopts the full grip-channel frame under
  a per-sport `gripContract`; axial rotation is shared between wrist (≤75°)
  and forearm via swing–twist decomposition with an exactly world-preserving
  counter-rotation; flexion/deviation flip-guards reject the 180° palm-flip
  class of solution; per-hand wrist metrics and digit-contact reports are
  exposed for tests and diagnostics.
- `docs/usage.md` documents the user-visible behaviour.

## Measured after (branch head, same instrumentation)

| Property                                          | After                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Hand orientation vs grip frame (all three sports) | 0.0° at every sampled phase                                                                                                           |
| RowErg draw-phase elbow outboard displacement     | ≤0.109 m marker / ≤0.125 m skinned (corridor bound 0.11 m + 8 mm IK residual)                                                         |
| RowErg draw-phase humeral abduction               | 11–13° (was 45–50°)                                                                                                                   |
| Extraction branch behaviour                       | continuous, left/right symmetric (≤0.06 m divergence bound over 256 samples)                                                          |
| Digit closure residual (solve space)              | ≤4 mm for every digit, all sports; deep penetration structurally impossible (contact is the stop condition)                           |
| RowErg loaded-draw grip-channel contact residual  | 0.0 mm (recovery worst case ~19 mm, from the rigid-oar-arc refine using the previous frame's wrist frame; budgeted at 25 mm in tests) |
| BikeErg grip-channel contact residual             | ≤17 mm across the crank cycle (was budgeted 170 mm)                                                                                   |
| Wrist clamp engagement in production frames       | never (`clampedSwing == 0` asserted across 256 phases × 3 sports)                                                                     |

Three follow-up fixes in the same branch corrected the SkiErg hold after
close review of the captures:

1. **Thumb-up orientation.** The pole frame's former nearest-arc curl
   alignment silently selected the inverted branch at every phase — thumb
   pointing down the shaft, pinky above index — an upside-down hold that
   read as palms flipped 180° (it predates this branch; the old open-mitten
   fingers merely hid it, and the geometry-closed wrap made it legible). The
   alignment is now a deterministic contract (`handCurlAxisThumbward` toward
   the grip top), measured after as thumb above index above pinky at every
   sampled phase on both hands, and pinned by a stacking-order regression in
   the fist-enclosure test.
2. **Full-fist closure limits.** The corrected view exposed that the ring
   and pinky never reached the thin 17 mm channel — they stopped at
   conservative stage limits and hung open. The closure limits are now
   full-fist anatomical maxima (MCP ~90°, PIP ~110°, DIP ~80°); contact
   remains the stop condition, so thicker grips still produce the relaxed
   hook while a thin pole gets a genuinely closed fist.
3. **Wrist spin-relief.** With the hold right-way-up, the pole frame's
   pinned "palm exactly inward" spin demanded up to ~114° of bone-term wrist
   bend at the high reach, which linear-blend skinning concentrated at the
   wrist ring — the hand read as severed from the forearm. The grip's one
   free degree of freedom (spin about the shaft) now flattens the wrist —
   the hand's long axis follows the solved forearm — inside a 1.35 rad
   inward-palm cone (`refineGripSpinForWrist`). Press-phase bend dropped to
   6–26°, recovery to ~79°, and the reach keeps only the anatomically
   unavoidable cocked-over-the-grip extension; the wrist skin now reads as
   one continuous limb in the close-ups.

Geometry acceptance now runs in `renderer3d.test.ts` against the shipped GLB:
handle-inside-enclosure with opposing thumb contact for both sculls, thumb on
the flat handle ends, hood palm support with fingertips wrapped past the
inboard face and the thumb hooked under the core, per-sport wrist envelopes
with continuity, 256-sample corridor + rearward-dominance sweeps, shuffled
random-seek determinism, and closure identity across all four quality tiers
and the live/ghost lanes. A deliberately winged synthetic elbow (rearward but
0.28 m outboard — the pose the old "rearward" checks accepted) is rejected by
the corridor metric in `rowRig.test.ts`.

## Capture matrix

Captured from the Workers-faithful `wrangler dev` preview, 1440×1024
viewport, dark theme, demo workouts 1001/1003/1004. Ultra was requested;
headless Chromium ran WebGL at effective quality **high** (recorded honestly
per frame in each manifest — grip and elbow geometry is identical at every
tier, which the tier-identity test asserts, so the evidence is
quality-independent for this work). Each manifest also records the served
`appBundle` hash as build identity: `app.BeEeKEQ9.js` for before,
`app.BxBtCa4E.js` for after. The after manifest's `commit` field shows the
base commit because the captures were taken from the built working tree of
this branch before its commit existed; the bundle hash is the authoritative
identity.

- `docs/visual-qa/grips-and-elbows/before/` — `main` @ `47c4c60`, cameras
  `normal`, `front`, `close`, `grip` (the rear/top/port-palm QA cameras did
  not exist on main), 5 row + 5 ski + 4 bike phases, plus skeleton overlays
  and 4.5 s cycle recordings (`manifest.json` records commit, backend, bundle
  identity, and effective quality per frame).
- `docs/visual-qa/grips-and-elbows/after/` — branch head, full matrix:
  `normal`, `front`, `rear`, `top`, `close`, `grip` (starboard palm),
  `grip-left` (port palm) per phase, skeleton overlays, and cycle recordings
  from the chase and both palm close-ups.

Representative pairs to review side by side:

| Claim                                                | Before                                                          | After                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Scull handle inside a finger hook, thumb on the stop | `before/poses/row-finish-draw-grip.jpg` (fist beside the shaft) | `after/poses/row-finish-draw-grip.jpg`, `after/poses/row-catch-grip-left.jpg`    |
| Elbows draw aft, no wing                             | `before/poses/row-finish-draw-front.jpg`                        | `after/poses/row-finish-draw-front.jpg`, `after/poses/row-extraction-top.jpg`    |
| Pole enclosed, thumb opposing                        | `before/poses/ski-loaded-pull-grip.jpg`                         | `after/poses/ski-loaded-pull-grip.jpg`                                           |
| Hood supported and hooked                            | `before/poses/bike-left-power-grip.jpg` (flat splayed fingers)  | `after/poses/bike-left-power-grip.jpg`, `after/poses/bike-opposed-grip-left.jpg` |
| Whole-cycle behaviour                                | `before/cycles/*.webm`                                          | `after/cycles/*.webm`                                                            |

## Remaining limitations (stated honestly)

- The RowErg grip-channel contact carries up to ~19 mm of residual during the
  feathered recovery and ~11 mm at the catch: the rigid oar-arc refine solves
  against the previous frame's wrist frame before the final orientation lands.
  The loaded drive closes to zero. Visible as a hair of handle/palm float in
  the recovery close-ups only.
- BikeErg fingertips wrap the inboard hood face with the thumb hooked under
  the core — a three-sided cage that reads as a hold, but the authored hood
  body still has no brake lever, so there is deliberately no extended lever
  finger.
- The SkiErg left-hand recovery reach defect from the equipment work (up to
  0.135 m at cycle 0.31–0.34, `SKI_V4_CONTACT_TOLERANCE`) predates this work
  and remains pinned at its measured peak.
- The SkiErg high-reach wrist keeps a strong cocked-over-the-grip extension
  (~109° in bone terms ≈ 50–70° visually): with the thumb pinned up the
  shaft and the forearm reaching up the near-vertical pole, that extension
  is the anatomical minimum for this hand, and a real pre-plant wrist does
  extend hard over the grip. Only dedicated wrist/twist helper bones could
  soften the remaining skin crease further.
- Wrist metrics are reported in the hand bone's own axis conventions, which
  sit ~40–60° from the visual flat-hand impression (the bone origin and
  metacarpal arch carry a built-in offset); the per-sport envelopes in the
  tests are therefore rig-calibrated numbers, not literal anatomical degrees.
- The forearm remains a single bone: axial twist shared into it rotates the
  whole segment rather than distributing gradually along dedicated twist
  helpers. Within the measured budgets this stays visually plausible; adding
  Blender forearm-twist helpers remains possible follow-up work that would
  require regenerating the GLB/USDZ/contract.
