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
3. **Wrist relief without trading the palm away.** With the hold
   right-way-up, the wrist reads much calmer primarily because the closed
   fist now carries the bend; `refineGripSpinForWrist` additionally trims
   the last degrees of wrist bend by spending the grip's one free degree of
   freedom (spin about the shaft) on flatness — but only inside a _tight_
   0.3 rad inward-palm cone. An earlier iteration used a 1.35 rad cone,
   which measurably rotated the visible palms toward the chase camera
   ("palms facing outward" from the default view) while buying nothing at
   the worst phase — the reach bend is anatomy-limited and spin-invariant —
   so palms-facing-each-other is enforced as the binding constraint
   (inward-dot ≥ 0.55 asserted at every checked phase) and the anatomically
   unavoidable cocked-over-the-grip reach extension is simply accepted.

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
`app.NOO0KIcP.js` for the final after matrix (the build containing every
fix on this branch, including the SkiErg thumb-up, full-fist closure, and
wrist spin-relief follow-ups). The after manifest's `commit` field can lag
one commit behind because captures run from the built working tree while
the matching commit is being recorded; the bundle hash is the
authoritative identity.

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

## Arm-draw retiming and elbow-path naturalisation (same branch, follow-up commit)

The grip work above fixed _where_ the hands hold the equipment; review of the
whole-cycle recordings showed the rowing arm pull itself was compressed into a
teleport, and the elbow model still forced a bend plane onto near-straight
arms. Both are reworked in `fix(replay): retime rowing arm draw and
naturalize elbow path`.

### Root cause (measured on the grips head `af38c29`, production athlete, 28 spm)

| Defect                              | Measurement                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Visible flexion onset               | 0.88 of the drive                                                                                                 |
| 10→90 % flexion rise                | **0.050 s = 3.0 frames** at 60 fps                                                                                |
| Peak elbow angular velocity         | **2821 °/s ≈ 47 °/frame** — the teleport                                                                          |
| Finish corridor state               | working-plane outboard exactly 0.110 m = the corridor clamp, saturated every cycle (the clamp _was_ the pose)     |
| Near-straight elbow plane authority | full — the down-dominant plane dictated the joint at zero visible bend, twisting the limb about its own long axis |

The timing chain stacked four easings: the `armDraw` channel opened only at
0.78 of the drive, the renderer re-eased it with a `smoothstep(0.12→1)`, a
reach-relaxation smoothstep re-eased the shoulder→grip distance again, and a
staged-yaw/boundary blend re-eased the oar arc on top.

### What changed

- **One velocity profile.** The motion-graph `armDraw` channel is the single
  authored profile: a C2-flat `cruiseRamp` over the widened
  **0.64–0.995 of the drive** (release: quintic over the first 0.30 of the
  recovery). Every renderer-side easing is deleted; `placeArms` consumes the
  channel verbatim.
- **Flexion-scheduled reach.** The channel schedules the elbow's interior
  flexion affinely from a soft 0.32 rad long-arm unlock to the measured
  2.46 rad production finish fold; the law of cosines converts that flexion
  into the requested shoulder→grip reach, and `solveRowerOarYaw` places the
  rigid handle exactly on that shrinking sphere (`achieved == requested` at
  every sampled phase). The soft floor exists because the rig's grip-sphere →
  wrist-sphere mapping carries a ~8 mm contact-offset bias: scheduling below
  ~0.32 rad left the wrist target outside the skeleton's chord — a dead zone
  the arm then rushed to catch up (a measured 1265 °/s onset spike, now gone).
- **Flexion-gated elbow-plane authority.** `solveRowerArm` computes actual
  flexion from the chord and fades plane authority C2-smoothly from zero (at
  ≤0.14 rad) to full (at 0.55 rad); near straight the authored clip owns the
  joint. At authority the elbow's circle station blends to fixed
  **chord-frame weights** (down 0.97, outboard 0.24) — the chord's azimuth
  swings ~30° between mid-draw and finish, so no fixed athlete-frame
  direction can be modestly outboard at both. Outboard displacement now
  scales with the bend radius and the absolute corridor is a dormant safety
  limit.
- **Sampler unification regression test.** The renderer consumes the
  zero-alloc `sampleRowerMotionGraphInto`; the authored windows also live in
  the public `sampleRowerMotionGraph`. During this work a window retime that
  landed in only one of them shipped a 0.78 pull to the renderer while every
  channel test read the new window — a dense 512-sample × 3-rate equality
  test now pins the two samplers together.
- **V4 clip re-key + regenerated assets.** The row-cycle clip's late-drive
  keys (root/hips/spine/chest/neck/head/clavicles/arms/hands) are re-authored
  so the torso opens by 0.80 of the drive (its aft shoulder travel is what
  geometrically releases the rigid handle) and the clip's draw prior tracks
  the widened window; GLB/USDZ/contract regenerated via the documented
  builders (`build:replay-rig-v4*`), never hand-edited.

### Measured after (production athlete through the real renderer, 512 samples/rate)

| Property                                | 24 spm            | 28 spm            | 32 spm            | 36 spm            |
| --------------------------------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| Visible flexion onset (of drive)        | 0.684             | 0.684             | 0.684             | 0.684             |
| Visible span, onset → finish fold       | 0.269 s = 16.1 fr | 0.230 s = 13.8 fr | 0.201 s = 12.1 fr | 0.179 s = 10.7 fr |
| Peak elbow angular velocity             | 589 °/s           | 687 °/s           | 785 °/s           | 884 °/s           |
| Max true adjacent-frame change (60 fps) | 8.5°              | 11.3°             | 13.9°             | 13.9°             |
| Peak angular acceleration               | 61 k°/s²          | 83 k°/s²          | 109 k°/s²         | 139 k°/s²         |

(Before at 28 spm: onset 0.88, 3.0 frames, 2821 °/s, 47 °/frame, 302 k°/s².)

Sequencing and finish, rate-invariant: flexion is monotonic through the draw;
hand–knee clearance at visible onset 0.44 m; baseline flexion through the leg
drive ≈ 18° (softly-long unlocked elbows, never the straight-arm singularity);
finish fold 140.9° with the elbow at (+0.067, −0.380, −0.057) m from the
shoulder — behind it, below it, modestly outboard; working-plane outboard
grows smoothly 0.05 → 0.086 m through the draw against the 0.11 m corridor
(clamp never engages). Hands release over the first 0.30 of the recovery,
then body-over, then slide, and the loop is C2 at both stroke boundaries.

Acceptance lives in `renderer3d.test.ts` ("times the production arm draw
readably at 24–36 spm"): 512 phases × 4 rates of the shipped GLB asserting
soft-long arms, the 0.66–0.74 onset band, knee clearance at onset,
monotonicity, per-rate minimum visible spans, a bounded cycle-domain angular
rate, head-spike ≤ 1.6× cruise, and the dormant corridor. Channel-level
timing, duration, recovery-order, and sampler-equality contracts live in
`motionGraph.test.ts`; the chord-frame station and finish-rejection contracts
(drooped and winged finishes both rejected on observable metrics, production
segment lengths 0.388/0.378 m) live in `rowRig.test.ts`.

### Diagnostics overlay

`?qa=athlete-visual&athleteArmDiag=1` (share the athlete-visual gate; not
reachable from replay controls) renders a live numeric panel measured from
the skinned bones each frame: draw progress + channel velocity, elbow flexion

- angular velocity, plane authority, working-plane outboard vs the corridor
  bound, hand–knee clearance, and drive progress.

### Capture matrix (arm-retime)

`docs/visual-qa/grips-and-elbows/arm-retime/` — same preview/viewport/theme
discipline as above: **15 named phases** (catch, leg-drive-early/mid,
legs-flat, body-opening, draw-onset, draw-early/mid/late, finish, release,
hands-away, body-over, slide-return, late-recovery) × cameras `normal`
(chase), `front`, `rear`, `top`, `close`; skeleton overlays at draw-onset,
draw-mid, and finish (plus the close overlay at leg-drive-mid); cycle
recordings from the chase and rear cameras, a diagnostics-overlay recording,
and **14 s chase recordings (≥6 consecutive strokes at the demo workout's
natural 28–32 spm cadence) at 1×, 0.5×, and 0.25×** via the capture-only
`qaPlaybackRate` query. The exact 24/28/32/36 sweep is owned by the
512-phase acceptance test; the recordings verify the same motion in the real
application at watchable and frame-by-frame speeds.

## SkiErg wrist twist follow-up (same branch, after live review)

Live review after the arm-draw work flagged the SkiErg wrists as
"unnecessarily twisted". Measured on the production athlete
(`getWristMetrics`, 32 spm, both hands):

- The wrist itself carried the full ±75° axial-twist budget through the high
  reach, the pull, and the recovery — the hand is locked to a near-vertical
  pole with the palms facing inward while the forearm sweeps ~100° of
  elevation, so the hand↔forearm relative axial rotation legitimately sweeps
  ~±100° per cycle, and the generic budget let the wrist absorb the first
  75° of it as a visible corkscrew (the forearm only took the overflow).
- Worse, the reach pose's hand↔forearm delta approaches a half-turn, where
  the twist⁄swing decomposition's branch is numerically unstable between
  frames. The two branches land the forearm exactly **2·cap** apart in world
  space: a measured **149° single-sample forearm snap** in the shipped build
  (75° budget), 30° at a 15° cap — and physically coincident at 0.

Fix: `REPLAY_V4_SKI_WRIST_TWIST_KEEP = 0`. The ski wrist keeps no axial
twist; the existing world-preserving counter-rotation carries all pronation
in the forearm — anatomically where the radioulnar joint carries it — and
the zero cap makes the decomposition instability unable to render at all.
The hand's world grip frame is bit-exact unchanged, so the palm-inward
contract, thumb-up stacking, pole contact, and closure reports are untouched
by construction. Measured after: wrist twist 0 at every phase, forearm
world-orientation steps ≤ 29°/sample (the pre-existing pole-plant transient
of the pole-led hand frame itself, unchanged from before), and the unchanged
physical wrist bend re-projects onto the deviation axis (envelope
recalibrated 1.75 → 2.06 in bone terms). Pinned by "carries SkiErg pronation
in the forearm with continuous segments" (dense 256-sample twist-zero +
forearm-continuity sweep) and the tightened ski twist envelope (0.001 rad).

Visible effect: the wrist crease no longer corkscrews at the reach and
through the recovery; the forearm segment rotates instead, which a sleeve
reads as normal pronation. Rowing and BikeErg keep the 75° shared budget
unchanged.

Evidence: `docs/visual-qa/grips-and-elbows/ski-wrist/{before,after}/` —
chase and palm close-ups at reach / pull / recovery, manifested with build
identity (before `app.DxA7wv0I.js` @ `22bf29e`, after the fixed build).
The pull close-up pair shows the change most directly: the ulnar shelf and
pinched crease where the hand twisted against the forearm are replaced by a
continuous forearm-to-hand surface, with the grip itself pixel-identical.

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
