# Visual-QA `athlete-front` portrait

`/replay/<id>?qa=athlete-visual&athleteCamera=front` is a capture-only portrait
used to review the athlete's head, shoulder mass and face treatment. It is
query-gated: no stored preference or replay control can reach it, and the
production chase view never uses it.

This note records why its framing rule changed and what it now guarantees.

## The failure

The portrait used to be derived from the **course anchor** — the lane point the
athlete's machine travels along — with a per-sport fraction of the chase
distance (0.22) as the standoff and a fixed height over `CAMERA_RIGS[sport].aimY`.

The athlete is not at the course anchor. `placeAvatar` adds an intra-stroke
surge along the tangent, and `SPORT_PROFILES.skierg.surgeAmp` is **1.45 m** —
larger than the whole 0.69 m portrait standoff. So on SkiErg the camera sat
inside the surge envelope: at the catch it looked over the athlete at the venue,
and by mid-drive the athlete had travelled straight past the lens.

| SkiErg, before       | Frame                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| 0.05 s (high reach)  | [venue plus the crown of the head](front-portrait/in-app/current/poses/before-ski-front-0-05.jpg) |
| 0.5 s (loaded press) | [athlete gone entirely](front-portrait/in-app/current/poses/before-ski-front-0-5.jpg)             |

The seated sports hid the same defect: their surge is 0.48 m (RowErg) and 0 m
(BikeErg), small enough that an anchor-framed portrait stayed roughly on the
athlete — with the shoulders already cropped at the bottom edge.

## The rule now

The portrait is solved against the **visible athlete**, not the course anchor:

- **Focus** — the midpoint of the crown and the deltoid mass, taken from the
  live head joint and both shoulder joints. Framing the mass rather than the
  face matters for SkiErg, where a folded athlete carries the head well ahead of
  the shoulder line.
- **Landmark source** — the skinned V4 hero's own `v4Head` and upper-arm bones
  whenever a hero is installed. The procedural target rig's head sits up to
  ~0.25 m away from the hero's once a clip is driving the skin, so it answers
  only when the procedural body is the one actually on screen.
- **Standoff** — derived from the measured mass and the current lens, each axis
  against its own half-angle, so the head/shoulder mass fills a fixed share of
  whichever stage it is captured on rather than a share of one sport's chase
  distance.
- **Height** — a gentle look-down over the focus, not a fixed rig height.

Allowances beyond the joints are measured, not eyeballed. The skull reserve over
the head joint differs per rig, so it is not one number:

- the **skinned hero** sits 0.1381 m under its rest-pose crown, and a posed skin
  offers nothing cheap to measure per frame, so `QA_PORTRAIT.heroCrownRise`
  tracks the sealed GLB — pinned to it by a test, on the pattern the SkiErg
  standing-height guard already uses;
- the **procedural fallback** is measured live off the rendered head subtree,
  because its headgear is per-sport: BikeErg parents a helmet to the head that
  reaches 0.195 m, 0.045 m above where the bare cranium and hair mass end. A
  single constant fitted to the bare head cropped it.

| After          | Frame                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| SkiErg 0.05 s  | [high reach](front-portrait/in-app/current/poses/ski-front-0-05.jpg)    |
| SkiErg 0.5 s   | [loaded press](front-portrait/in-app/current/poses/ski-front-0-5.jpg)   |
| RowErg 0.8 s   | [finish](front-portrait/in-app/current/poses/row-front-0-8.jpg)         |
| BikeErg 0.72 s | [pedal bottom](front-portrait/in-app/current/poses/bike-front-0-72.jpg) |

## What did not change

`normal`, `close` and `grip` are the accepted capture paths behind the existing
evidence in this directory, so they had to come through untouched. They do,
exactly: dumping `chase`, `lookAt`, `camera.position`, `cameraAim` and
`camera.fov` at 17 significant digits over **1,728 samples** — every non-front
camera (`normal`, `athlete-close`, `athlete-grip`, `athlete-grip-left`,
`athlete-rear`, `athlete-top`) × three sports × desktop and mobile stages ×
solo and ghost lanes × normal and reduced motion × four stroke phases × three
lap positions — is byte-identical before and after.

SkiErg frames for all three are captured alongside the portrait evidence:
[normal](front-portrait/in-app/current/poses/ski-normal-0-5.jpg),
[close](front-portrait/in-app/current/poses/ski-close-0-5.jpg),
[grip](front-portrait/in-app/current/poses/ski-grip-0-5.jpg).

## Regression cover

Three guards in `renderer3d.test.ts`:

- _"holds the front portrait on the athlete's head and shoulders"_ projects the
  crown, head, and both shoulders (with the deltoid allowance) through the live
  camera for all three sports, on the desktop and mobile stages, animated and
  reduced-motion, across four stroke phases and three lap positions. Every
  landmark must stay between the clip planes and inside ±0.9 NDC, and a minimum
  on-screen crown-to-shoulder span stops a "fix" that simply retreats until
  everything trivially fits.
- _"frames the front portrait on the procedural rig when no V4 hero is
  installed"_ covers the fallback branch to the same two standards, projecting
  the true top of the rendered head subtree so BikeErg's helmet counts.
- _"ties the front-portrait crown allowance to the shipped V4 rig"_ measures the
  rest-pose crown over `v4Head` and requires `heroCrownRise` to cover it and
  stay snug, so a rig re-author cannot leave the constant describing an athlete
  that no longer ships.

The first two both fail when reverted against the old camera, on the first
SkiErg frame (shoulder at 1.10 and 1.02 NDC against the 0.9 bound).

## Capture provenance

Frames in [`front-portrait/in-app/current`](front-portrait/in-app/current/manifest.json)
were taken with Playwright headless Chromium against `wrangler dev` serving the
production build, 1440×1024 viewport, 1112×421 stage, dark theme, Ultra
requested. Headless Chromium exposes no WebGPU adapter, so they record effective
High/WebGL; camera framing is solved identically on both backends, and the
Ultra/WebGPU material evidence stays with the athlete-v5 and per-grip notes.
