# Design Document: Replay Motion-System Rebuild

## Decision

Three.js remains the renderer. Replacing it would discard established WebGPU,
WebGL, lazy-loading, and contact-safe fallback work without providing an
authored character rig or better choreography. The replacement is a hybrid
motion architecture:

```text
logged cadence / time / distance / pace / power
                 ↓
            StrokePose timeline
                 ↓
        shared ReplayMotionGraph
                 ↓
  authored V4 clip (base human performance)
                 ↓
  deterministic contact / IK correction pass
                 ↓
         3D skin + shared 2D pose frame
```

The motion graph owns canonical technique timing and expressive phase curves.
It is deterministic and pure, so a scrub selects the same pose as playback.
The data owns cadence, stroke boundaries, pace, distance, and restrained effort
weighting. It does not own, and is never presented as owning, measured force,
joint, handle-path, pressure, or body-shape data.

## Playback modes

The replay starts at 1× because that is the only default at which a normal
stroke rate visibly reads as human technique. Existing faster transport speeds
remain race-navigation controls. Their displayed progress is still data-exact;
visual acceptance evaluates 1×, 2×, and 8× separately instead of judging a
high-speed review as a claim of natural biomechanics.

## Motion graph

`motionGraph.ts` converts `StrokePose` into a sport-specific `ReplayMotionFrame`.
It uses phase-native, C2-continuous curves and explicit contact-state windows
rather than a sequence of independently settled scalar stages. The frame
contains a common pelvis/spine/head/shoulder rhythm plus sport-specific body,
limb, equipment, plant, and velocity cues. It is a shared input to both
renderers; Canvas retains its own art direction but not a separate technique
interpretation.

RowErg runs through catch compression, leg-led acceleration, delayed body open,
late arm draw after drive-side hand/knee clearance, hands-away, body-over, and
slide. SkiErg uses a classic Nordic
double-pole sequence: high reach, steep plant, early elbow load, core-led press,
near-straight arms at pole-off, lifted recovery, and velocity-matched approach
to the next plant. BikeErg
runs continuous opposed pedal loading with coordinated pelvis shift, shoulder
counter-rotation, head stabilization, and ankle articulation.

### Rowing sequence and elbow-branch reference contract

The shared RowErg graph follows the public coaching sequence rather than an
aesthetic arm loop. [Concept2's rowing-technique guidance](https://www.concept2.com/training/rowing-technique)
defines a long-arm catch, a leg-led drive, body swing before the arm draw, a
finish with the handle just below the ribs, and recovery in the reverse order
with hands away before the knees rise. [British Rowing's indoor technique](https://www.britishrowing.org/indoor-rowing/go-row-indoor/how-to-indoor-row/british-rowing-technique/)
likewise delays the arm draw until the legs are extended and requires the
elbows to follow the handle line with aligned wrists and forearms. In the
animation, the hand passing the drive-side knee envelope is the observable
geometric cue for that sequencing; it does not replace the legs → body → arms
coaching rule. A published
[3D kinematic comparison of skilled and unskilled ergometer rowing](https://www.mdpi.com/2076-3417/14/19/9055)
reports only about 7–13° of elbow flexion through the first half of the drive,
followed by the substantial late flexion needed at the finish.

Those constraints own both renderers. The shared graph keeps the arm draw at
zero until the late drive, while dense pose tests verify the stronger spatial
invariant: the arms remain softly long until the hands have actually cleared
the knees and the legs are essentially extended. Canvas solves each fixed-length
upper-arm/forearm chain analytically and always selects the rearward elbow
intersection. The 3D fallback solves a full inboard scull circle for the
long-arm reach, closes the last part of the handle path from the graph's late
`armDraw`, and publishes a restrained-outward but strongly rearward elbow
marker. V4 first samples its authored clip and hand orientation, then the
renderer re-solves each fixed oar circle from the visible skinned shoulder,
structural shoulder-to-wrist reach, and sampled wrist-to-palm offset before the
final contact pass chooses the shared anatomical elbow branch. The rigid grip
remains terminal authority without asking IK to compensate for a hidden-rig
shoulder mismatch. Dense-cycle tests reject elbow flexion before hand/knee
clearance, forward-pointing or sideways elbows, grip separation, torso
intersection, and branch snaps.

### Classic double-pole reference contract

The shared SkiErg graph is constrained by public technique and biomechanics,
not by aesthetic interpolation. [Concept2 technique guidance](https://www.concept2.com/training/skierg-technique)
starts tall with bent arms above eye level, initiates the pull from the core,
finishes with long arms beside the thighs, and uses a controlled recovery.
[Concept2's double-pole article](https://www.concept2.com/blog/skierg-technique)
also calls for a slight backward pole angle at plant and explicitly warns
against carrying the hands beyond the hips. Its
[mid-summer technique check](https://www.concept2.com/blog/midsummer-ski-technique-check)
keeps a healthy arm bend at the start and delays extension until the arm has
passed the core. A 2024
[field kinematics study](https://pmc.ncbi.nlm.nih.gov/articles/PMC10963750/)
separately measures elbow angle at plant, minimum flexion, pole-off, and maximum
recovery, with flexion after plant followed by extension toward pole-off.
Published on-snow measurements in
[Stöggl and Holmberg](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00978/full)
place pole contact in roughly the first 26–29% of the cycle, with about an 80°
pole at plant, 23° at pole-off, early elbow flexion, and near-extension at
release. Those sources establish phase and flexion/extension landmarks rather
than one universal 3D elbow vector; down-at-plant → rearward-under-load is the
generic side-view animation contract inferred from those positions, not a
claim about a recorded athlete's joint path.

Those landmarks own both renderers. Canvas retains one outside two-bone
intersection: the high forward grip places that branch below the shoulder at
plant, and the same continuous branch becomes rearward as the hand passes the
torso. Three.js rotates its shared sagittal bend vector from down to back during
the loaded sweep and returns by the shortest sagittal arc underneath the
recovering arm. The V4 clip supplies the skinned base pose, but that shared
marker owns its post-clip SkiErg two-bone branch; the rigid pole owns terminal
hand contact. At the C2-flat flight apex the renderer changes from the previous
snow anchor to the next with zero visible weight, then lowers the basket
continuously into pre-plant. This prevents horizontal elbow inversion,
telescoping poles, and the late-recovery pole drop.

The legs retain a narrow parallel double-pole stance throughout the same cycle.
Canvas represents lateral depth with a small constant offset shared by each
hip, knee, boot, and ski rather than inventing a fore/aft striding step.
Its neutral pelvis sits close to full leg extension and the press adds only a
controlled athletic compression: the authored thigh remains predominantly
vertical, the pelvis stays clearly above the skis, and neither knee approaches
the snow closely enough to read as kneeling. Torso length follows the corrected
pelvis rather than being squashed by the taller stance.
Procedural Three.js keeps every knee on the same side as its planted boot. V4
must consume those shared SkiErg knee markers after clip sampling: contact-locking
the feet while retaining the mirrored clip plane can otherwise select opposite
two-bone branches and make the thighs cross despite correctly separated skis.

## V4 rigged asset

V4 is a compact local glTF with a generic athletic skeleton and skin weights.
Its production surface is authored by the reviewed Blender 5 Python generator,
then sealed onto the canonical `rigV4.ts` skeleton and clips by the Node build.
It has authored canonical clips, not a recording of an athlete. At runtime an
`AnimationMixer` samples clip time from the motion graph / `StrokePose` instead
of free-running from `requestAnimationFrame`; this makes replay time, seeking,
and ghost comparison reproducible. V4 permits only reviewed local animations,
skins, and optional local material maps. Its provenance document records every
byte and source.

After sampling, the renderer applies its existing analytic contact knowledge:
hands attach to RowErg grips or bike bars, feet attach to plate/pedals, oars
remain at oarlocks, and SkiErg baskets pass through explicit free → plant →
loaded → release contact states. IK adjusts only what it must; it no longer
generates the complete human performance from end-effector positions.

The production replay now installs the reviewed V4 skin over the hidden
contact-safe rig after the local asset validates. V3 static athlete/equipment
geometry and the existing procedural rig stay intact as validated 3D fallbacks;
Canvas stays the stable outer fallback. A failed request, parser, skeleton,
clip, or contact-metadata check therefore cannot blank the replay.

The native handoff preserves this same ownership boundary. The GLB remains the
web runtime artifact; USDZ is generated from the GLB for RowPlay Studio and is
validated as a portable skinned derivative, not as a second animation runtime or
a separate remodelled athlete.

## Non-goals

- Reconstructing a user’s actual technique from Concept2 data.
- Scans, likenesses, generic-avatar downloads, or generated human identity.
- Removing existing WebGPU, WebGL, V3, or Canvas fallback behavior.
- Adding third-party runtime asset delivery.
