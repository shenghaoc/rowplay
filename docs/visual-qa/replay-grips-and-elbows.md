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
- `skiGripReach.ts`: a focused allocation-free per-side closure between the
  sampled V4 shoulder/wrist sphere, oriented fitted fist channel, and rigid
  SkiErg pole; infeasible airborne baskets receive only the minimum correction
  while planted course anchors remain immutable.
- `renderer3d.ts`: RowErg provisionally settles and restores the current arm
  frame before its second rigid-oar solve, correcting only structural reach
  excess so the final contact pass no longer inherits a previous-frame wrist
  offset.
- `docs/usage.md` documents the user-visible behaviour.

## Measured after (branch head, same instrumentation)

| Property                                          | After                                                                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Hand orientation vs grip frame (all three sports) | 0.0° at every sampled phase                                                                                 |
| RowErg draw-phase elbow outboard displacement     | ≤0.109 m marker / ≤0.125 m skinned (corridor bound 0.11 m + 8 mm IK residual)                               |
| RowErg draw-phase humeral abduction               | 11–13° (was 45–50°)                                                                                         |
| Extraction branch behaviour                       | continuous, left/right symmetric (≤0.06 m divergence bound over 256 samples)                                |
| Digit closure residual (solve space)              | ≤4 mm for every digit, all sports; deep penetration structurally impossible (contact is the stop condition) |
| RowErg grip-channel contact residual, full cycle  | <5 mm (drive and feathered recovery; previous recovery peak ~19 mm)                                         |
| SkiErg grip-channel contact residual, full cycle  | <5 mm bilaterally (previous left recovery peak 135 mm at cycle 0.31–0.34)                                   |
| BikeErg grip-channel contact residual             | ≤17 mm across the crank cycle (was budgeted 170 mm)                                                         |
| Wrist clamp engagement in production frames       | never (`clampedSwing == 0` asserted across 256 phases × 3 sports)                                           |

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

## SkiErg wrist follow-ups (same branch, after live review)

Two rounds of live review flagged the SkiErg wrists — first as "unnecessarily
twisted", then (after an intermediate fix) as "twisted, torn apart". The
final root cause, measured on the production athlete:

- **The authored ski clip still holds its poles on the pre-grip-work
  inverted branch.** Against the contract grip frame (palms-inward,
  thumb-up), the clip hand sits a **half-turn of spin about the pole
  (−180° ± 45°) at every phase** of the cycle. The clip is internally
  coherent (its own wrist seam carries 0.6–5.5°, its elbow seam ≤ 55°), but
  the runtime grip contract drags the hand ~150–180° away from that prior,
  and the whole mismatch has to land somewhere on the arm.
- Under the original shared 75° wrist-twist budget, the wrist carried the
  first 75° of it — the visible corkscrew — and, because the residual sat
  near the half-turn where the twist⁄swing decomposition flips branches,
  the forearm snapped **149° in a single sample** at the reach (the two
  branches land the forearm exactly 2·cap apart; measured 149° at cap 75°,
  30° at cap 15°).
- An intermediate zero-keep fix (all twist into the forearm) removed the
  corkscrew and the snaps but pushed the hand↔forearm relative rotation
  into a pure ~130° sideways hinge at the reach/recovery — linear-blend
  skinning tore the wrist ring open (hole plus a detached-looking flap of
  hand skin), which was the second review flag.

The shipped fix distributes the half-turn along the arm the way a real
shoulder + radioulnar joint share it, plus one anatomical grip freedom:

1. **Wrist keeps ≤ 30°** (`REPLAY_V4_SKI_WRIST_TWIST_KEEP`) — natural play,
   visibly untwisted.
2. **Forearm pre-rolls toward the hold** (`alignSkiArmPronation`): before
   the IK passes, the forearm rolls about its own elbow→wrist axis to leave
   the wrist exactly its keep — so the constrain decomposition operates
   ±30° from centre, far from the unstable half-turn, and the snap class
   cannot occur. Computed on the branch centred at the mirrored half-turn
   (the demand stays within ±135° of it all cycle, so the branch is
   continuous).
3. **Shoulder internal rotation absorbs half the elbow-seam excess**
   (`distributeSkiElbowTwist`): post-solve, the forearm's local twist
   beyond the clip's own elbow seam is measured exactly and half of it is
   rolled into the humerus about its long axis, with the forearm (and so
   the solved hand) world orientation restored — joint positions and the
   grip frame bit-exact.
4. **Comfort-gated diagonal grip** (`refineGripTiltForWrist`): a real pole
   is never held square across the fist at a high reach — it rides
   diagonally from index base toward pinky heel. When the hand's long axis
   is misaligned from the forearm by more than 1.15 rad about the palm
   normal, the hold tilts by the excess (≤ 0.6 rad) about the **palm
   normal** — the palms-inward contract is unchanged by construction
   because its own axis is the rotation axis. Calm phases (the pull) stay
   exactly on the authored square channel with the fully closed fist; only
   the overload phases trade a bounded finger-to-shaft divergence for a
   connected wrist.

Measured after: wrist twist ≤ 30° everywhere; no decomposition flips; the
wrist ring is connected at every phase (the reach/recovery holes are gone);
forearm world-orientation steps ≤ ~62°/sample only inside the pole-plant
flick, where the pole-led hand frame itself reorients ~34°/sample
(pre-existing). Palms-inward (≥ 0.55), thumb-up stacking, and the digit
closure reports are unchanged. Pinned by the "distributes SkiErg pronation
along the arm with continuous segments" 256-sample sweep (wrist keep bound

- forearm continuity), the tightened ski twist envelope (0.53 rad), and the
  diagonal-aware enclosure bound (cos(SKI_PALM_TILT) parallelism with the
  fingertip-on-cylinder and wrist-proximity assertions unchanged).

Evidence: `docs/visual-qa/grips-and-elbows/ski-wrist/{before,after}/` —
chase and palm close-ups at reach / pull / recovery with build identity.
`before` is the original 75°-budget corkscrew; `after` is the shipped
distribution (the intermediate torn state is described above and
reproducible at `9e225b0`). The pull close-up pair shows the wrist-shelf
fix; the recovery pair shows the reconnected wrist ring.

## Final contact closure

- **RowErg:** the first rigid-oar solve now receives one reversible arm-only
  settle, measures the final oriented wrist target against the structural reach
  sphere, restores the prepared clip pose, and subtracts only the unreachable
  excess in the second solve. Dense full-cycle production-V4 sampling replaces
  the former 25 mm exception with a 5 mm budget.
- **SkiErg:** the former shared scalar reach estimate is replaced by a
  per-side oriented fist-channel/pole-sphere solve. The solver minimally moves
  only infeasible airborne baskets, never planted anchors, and holds extension
  through release before returning to the authored recovery. Dense sampling
  replaces the former 140 mm exception with a 5 mm bilateral budget.

## SkiErg clip re-authored onto the pole-grip branch (partial fix — read the limits)

A third review of the SkiErg hand ("still torn apart") was correct. Staged
diagnostics through every solve stage (authored clip → grip frame → spin/tilt
reliefs → V4 two-bone passes → wrist constrain → pronation distribution),
recording joint frames, axis angles and skinned wrist-ring triangle metrics,
located the source:

- **The authored ski clip held its poles on the wrong branch at every phase.**
  Measured as the clip-forearm⁻¹ × grip-target rotation at each key time, the
  runtime had to drag the hand **65–113°** away from the clip prior at _every_
  sampled phase. Every previous ski fix in this branch was a runtime patch
  redistributing that error rather than removing it.

**What this commit changes:** the clip's `v4LeftHand` / `v4RightHand` tracks
are re-authored onto the pole-grip branch — each key measured from the runtime
grip-channel target frame (thumb to grip top, palm inward, spin/tilt resolved)
at that key's own cycle, mirrored for the right hand. The half-turn runtime
pre-alignment (`alignSkiArmPronation`) is deleted; the small residual
pronation distribution (`distributeSkiElbowTwist`) remains.

Measured after (same harness): clip→target hand correction falls from 65–113°
to **0.1–24°** across the cycle, with most keys under 5°. GLB/USDZ/contract
regenerated from source (GLB sha256 `66aebaf3…`, 5,069,244 B).

### Honest status: the reported defect is improved, not eliminated

The pole is enclosed by fingers and thumb at every phase and the hold reads
right-way-up with palms inward, but **a visible crease/notch remains at the
wrist on several phases** (most legible around the high reach and late
recovery in the `grip` close-up). Two things this commit does _not_ do:

1. **No coupled elbow/grip solve.** I prototyped one (choose the elbow station
   on its circle so the forearm meets the pole near the hand's neutral-wrist
   cone, ≈70.6° from the grip-channel axis, with a palm-floored closed-form
   spin choice). It measurably improved the worst phases but its branch
   selection could flip between adjacent samples, producing 0.09 m/sample
   elbow and 1.68 rad/sample forearm steps — a new snap. Shipping a snap to
   remove a crease is not a trade worth making, so it was reverted. A
   continuous (hysteresis-free, deterministic) station selection is the
   correct next step.
2. **No deformation helper bones.** The forearm is still a single skinned
   segment into the hand. Distributing residual pronation across
   proximal/distal twist helpers plus a wrist corrective — and reweighting the
   wrist ring across them — remains the structural fix for the crease itself,
   and requires the Blender armature/weights, loader, USDZ, contract,
   validators and docs to move together.

## Remaining limitations (stated honestly)

- BikeErg fingertips wrap the inboard hood face with the thumb hooked under
  the core — a three-sided cage that reads as a hold, but the authored hood
  body still has no brake lever, so there is deliberately no extended lever
  finger.
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

## SkiErg arm path rebuilt to Concept2 technique (flat wrists via the arm, not the hand)

The recurring "torn / twisted ski wrist" had one remaining structural cause
after the roll fixes: the arm path itself. Measured wrist bend tracks
`|forearm-vs-pole − 109.4°|` almost exactly (the fist's channel axis is
pinned 109.4° from the hand's long axis), and the old motion placed the
forearm 4–6° off the pole line at the plant — no hand orientation can hold
that with a wrist. Per the Concept2 SkiErg technique reference ("Your wrists
should not bend. Your arms should not fully extend"):

- **High-elbow plant.** The elbow hint arc starts up-forward (elbows above
  the shoulder line, slightly wide of the grips) so the forearm meets the
  near-vertical pole inside the neutral-wrist cone. Measured plant bend
  **85° → 3°**.
- **Press without lockout.** The authored radial reach is capped below
  structural maximum; pole-off holds a soft 133° elbow instead of the former
  near-lockout, and the elbows collapse down-back past the ribs (the wide
  collapse is also what keeps the two-bone bend plane defined).
- **Neutral-wrist pole carry.** In flight the carried pole direction is
  derived from the fist itself — hand's long axis on the provisional
  forearm, palm toward the midline, thumb up the grip — instead of an
  authored shaft angle, with the tip clamped below the hand (a real pole
  trails on the strap; a tip above the hand would demand a fist inversion).
- **Release/approach in direction space.** The flight blend rotates the
  carried shaft toward the hand→plant direction rather than lerping tip
  positions (which passed under the hand and snapped the grip 955 mm in one
  sample), and the dead basket fades out over ~7% of the cycle after
  pole-off instead of dragging the arm straight against a receding point.
- **Clip keys re-derived.** The baked hand keys are sampled from the new
  runtime frames so the wrist-twist redistribution never wraps at ±π.

Measured across 96 phases, both hands: wrist bend ≤ 45° at 96% of samples
(was 84–86° sustained at reach), worst transient 76° at the pre-plant
hand-off, max wrist travel 89 mm/sample (was 955), palms inward, V4 hero
enabled at every phase. Known remaining aesthetic: mid-recovery the carried
poles read slightly forward-splayed from the chase camera; the wrists and
elbows are the contract, the carry attitude can be refined separately.
