# RowErg geometry-aware grip acceptance

PR #180 replaces RowErg's fixed visual finger curl with the shared
geometry-aware closure introduced by the stacked grip work. The rigid scull
circle remains equipment authority; V4 places the hand's scull channel on that
grip, settles the arm, refines the oar arc from the resulting wrist frame, and
only then closes the helper-driven digits.

## Current application evidence

The [capture manifest](row-grip/in-app/pr180-current/manifest.json) records
source commit `8c07591b8f267a867deaae63649bd45b216b3c9f`. All four frames came from the
Workers-faithful preview in headed Chromium on the real WebGPU backend at the
requested and effective Ultra tier. The browser reported no console errors or
warnings.

| Frame                                                                      | Acceptance purpose                                                                                                         |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Catch grip](row-grip/in-app/pr180-current/poses/row-grip-catch.jpg)       | The rubber passes through the fitted hand channel; four fingers wrap below it and the opposed thumb retains the end stop.  |
| [Finish grip](row-grip/in-app/pr180-current/poses/row-grip-finish.jpg)     | The same enclosure survives the deepest draw without the palm, forearm, or grip entering the torso.                        |
| [Front finish](row-grip/in-app/pr180-current/poses/row-finish-front.jpg)   | Both hands remain on separate grips and both elbows stay down beside the ribs rather than flaring horizontally.            |
| [Mobile finish](row-grip/in-app/pr180-current/poses/mobile-row-finish.jpg) | The complete shell, crossed scull geometry, athlete, and finish silhouette remain readable in the 390×844 mobile viewport. |

## Deterministic and geometric acceptance

- Each hand publishes five geometry-closure contact reports; every digit is in
  contact and has absolute surface distance below 4 mm.
- The effective hand channel remains within the 5 mm RowErg contact budget on
  live and ghost lanes through dense drive/recovery sampling.
- Dense tests retain the rigid oarlock/grip relationship, keep palms and
  forearms out of the torso, preserve the contact-safe elbow branch, and reject
  visible arm draw before the handle clears the knee envelope.
- Repeating and shuffling seeks reproduces the same V4 pose within the strict
  `1e-9` snapshot tolerance; reduced motion holds one calm contact-safe pose.

The BikeErg hood still uses its bounded fixed-curl fallback in this layer. Its
geometry-aware closure and the final three-sport close-up matrix belong to
stacked PR #181, so those active-spec tasks remain unchecked here.
