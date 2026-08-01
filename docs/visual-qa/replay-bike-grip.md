# BikeErg geometry-aware hood-grip acceptance

PR #181 completes the stacked machine-grip work. The authoritative palm
contacts remain fixed on the existing BikeErg hood anchors; after that contact
solve, a Bike-only final-enclosure policy closes the four finger chains onto
the hood's far-side surface and the opposing thumb underneath it. RowErg and
SkiErg retain their previously accepted sequential first-contact policy.

The original branch described floating BikeErg fingertips as an accepted
ceiling. That waiver is removed. The shipped implementation and evidence below
meet the active requirement that individually weighted digits close around the
held surface without visible floating fingers or handle penetration.

## Exact-head in-app evidence

The [capture manifest](bike-grip/in-app/pr181-current/manifest.json) records
source commit `c0fd9dd4e81b20354e74f6c44418b51f6b9d98cc`. Every frame was captured
from the Workers-faithful preview in headed Chromium on the real WebGPU backend
at requested and effective Ultra quality. The 1440×1024 browser viewport
contained the production 1112×420 replay stage, and the browser reported no
errors or warnings.

| Frame                                                                                                   | Acceptance purpose                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Macro hood grip](bike-grip/in-app/pr181-current/poses/grip-bike-pedal-top.jpg)                         | Both palms remain on their hood anchors while four distinct fingers hook onto each far-side body and each thumb opposes below. No digit floats above the hood and no hood crosses the palm silhouette. |
| [Pedal top](bike-grip/in-app/pr181-current/poses/bike-pedal-top.jpg)                                    | The closed bilateral hold remains readable in the complete rider/bicycle fit at the first crank extreme.                                                                                               |
| [Pedal bottom](bike-grip/in-app/pr181-current/poses/bike-pedal-bottom.jpg)                              | The hold and forward riding posture remain continuous at the opposite crank extreme.                                                                                                                   |
| [Saddle support, pedal top](bike-grip/in-app/pr181-current/poses/saddle-bike-pedal-top-light.jpg)       | Light-theme chase view exposes the ischial support silhouette without the former empty-seat or body-through-pad read.                                                                                  |
| [Saddle support, pedal bottom](bike-grip/in-app/pr181-current/poses/saddle-bike-pedal-bottom-light.jpg) | The same support survives the crank phase that most changes hip/thigh overlap.                                                                                                                         |

The close-up review found no remaining floating fingertip, open mitten, hood
penetration, wrist discontinuity, or unsupported-seat defect. The ordinary
close camera intentionally shows the full rider and cockpit; the dedicated
grip camera is the release-detail authority for individual digit enclosure.

## Geometry and contact contract

- `BIKE_RIG.handlebar.hood` is the single contact/rendering authority. Its
  18 mm radius is the half-section of the rendered 36 mm hood body; the former
  16 mm value described only the rounded corner and left the analytic surface
  smaller than the visible equipment.
- BikeErg opts into a deterministic final-pose search over all three bounded
  stages of each finger. Every candidate checks all downstream joint points,
  full phalanx segments, and the fingertip. A selected pose may enter the
  analytic surface by no more than 0.5 mm and must land both the chain and tip
  inside the 4 mm contact band.
- Each hand reports five contacts. Dense whole-cycle rendering asserts every
  report is in contact, every fingertip remains within 4 mm of the rendered
  hood radius, the palm heel stays above and supported by the hood, the thumb
  remains below it, and the fingers reach its opposing face.
- Hood-channel and pedal-sole contacts are both held to the restored 5 mm
  BikeErg budget. The rider lean was corrected in the authored BikeErg clip so
  the larger truthful hood surface remains structurally reachable; no contact
  anchor, crank path, equipment timing, or environment moved.
- The opt-in policy is deterministic across repeated solves. An explicit
  equality regression proves that omitting or disabling it produces the exact
  established RowErg scull solution, protecting both lower stacked layers.

## Three-machine close-up matrix

Task 11 is accepted across the stack, not from Bike evidence alone:

| Machine | Stacked PR | Accepted close-up evidence                                                                                                             |
| ------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------- |
| SkiErg  |       #179 | [WebGPU/Ultra grip manifest](ski-equipment/in-app/pr179-current/manifest.json) and [SkiErg visual acceptance](replay-ski-equipment.md) |
| RowErg  |       #180 | [WebGPU/Ultra grip manifest](row-grip/in-app/pr180-current/manifest.json) and [RowErg visual acceptance](replay-row-grip.md)           |
| BikeErg |       #181 | [WebGPU/Ultra grip manifest](bike-grip/in-app/pr181-current/manifest.json) and the frames above                                        |

All three use the same 51-bone V4 athlete and 32 visual-only grip helpers. The
final GLB is 4,584,320 bytes with SHA-256
`a564a4dbd4922e2ba76ef21a23f5bf0eb1b0180846548f9d7110e55ffd8f760e`;
two consecutive Blender builds reproduced that byte-for-byte. The native USDZ
derivative is 11,565,117 bytes with SHA-256
`cf65202b8360183be57308130226173171ac67d8d900e02f40ba3879569b569a` and
passes semantic contract validation.

## Verification focus

The release gate supplements, rather than substitutes for, the frames above.
Its relevant regressions cover five-contact BikeErg enclosure, complete
phalanx collision bounds, deterministic closure and reset, unchanged RowErg
opt-out behavior, rendered-hood/contact-radius equality, whole-cycle bilateral
hood/pedal contact, every quality tier, saddle-skin clearance, helper hierarchy
and influence, and GLB/USDZ/native-contract integrity.
