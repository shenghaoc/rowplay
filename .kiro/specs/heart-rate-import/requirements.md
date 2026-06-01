# Heart-Rate Device Import — Requirements

## Introduction

Many Concept2 logbook workouts are logged **without a heart-rate strap** on the
erg, even though the athlete recorded HR on a watch or chest strap (Garmin,
Polar, Wahoo, Apple Health export, etc.). Today rowplay hides the HR gauge,
heart trace, and HR-zone panel whenever stroke data has no `hr` field — the
replay is incomplete for a large slice of real sessions.

This feature lets the athlete **import an HR time series** from a device export
(CSV, TCX, or FIT — the same formats already accepted for ghost-file upload) and
**merge it onto the existing workout timeline** by elapsed time, with an
optional **start offset** when the watch started before or after the piece. The
merged HR flows through the existing replay stack (`sampleAt`, gauges, uPlot,
`hrZones`) without engine or renderer changes.

Promoted from the `HANDOFF.md` parking lot. Must obey `AGENTS.md`: **demo mode**
first, **i18n** (en + zh), RACE BOARD tokens, full quality gate.

## Glossary

- **Workout timeline** — the erg session's elapsed-time axis (`Stroke.t` in
  seconds from piece start).
- **HR sample** — `{ t, hr }` where `t` is seconds on the import file's
  timeline and `hr` is bpm.
- **Offset** — seconds added to workout time when looking up imported HR
  (`fileTime = workoutTime + offset`). Positive offset when the watch started
  before the erg.
- **Overlay** — persisted `{ samples, offset }` applied on top of cached detail.

## Requirements

### Requirement 1 — Discover import when HR is missing

**User story:** As an athlete replaying a piece without logbook HR, I want to
see that I can add heart rate, so I know the feature exists.

#### Acceptance criteria

1. WHEN a workout's strokes contain no HR (`hr` absent or zero on every sample)
   THEN the replay page SHALL show an **import heart rate** panel (not the HR
   gauge/chart/zones until import succeeds).
2. WHEN strokes already include HR from the logbook THEN the import panel SHALL
   NOT be shown (logbook HR wins; no duplicate import UI).
3. WHERE the app is in demo mode THE system SHALL include at least one mock
   workout without HR so the flow is explorable with zero configuration.

### Requirement 2 — Upload and parse device files

**User story:** As an athlete, I want to upload my watch export, so rowplay can
read the HR trace.

#### Acceptance criteria

1. THE system SHALL accept `.csv`, `.tcx`, and `.fit` uploads (same family as
   ghost file upload).
2. WHEN the file contains fewer than two HR samples with valid bpm THEN the
   system SHALL reject the import with a clear, i18n'd error (no partial merge).
3. WHEN parsing succeeds THE system SHALL show a short summary (sample count,
   file-derived duration, average bpm) before apply.
4. Parsing logic SHALL reuse the existing file decoders in `src/lib/replay/sources.ts`
   (no parallel FIT/TCX/CSV implementation).

### Requirement 3 — Align by time with adjustable offset

**User story:** As an athlete, I want to nudge watch start relative to the piece,
so HR lines up with the erg clock.

#### Acceptance criteria

1. THE system SHALL provide an offset control (default 0) in the range **−120s to
   +120s** in 1-second steps.
2. WHEN the athlete changes offset before apply THEN the preview SHALL update
   (merged average HR on the control label or preview line).
3. THE merge SHALL map workout time `t` to imported HR at file time `t + offset`
   via linear interpolation between bracketing HR samples.
4. Strokes without a bracketing HR sample MAY remain without `hr` (no
   extrapolation beyond the imported range).

### Requirement 4 — Apply, persist, and clear

**User story:** As an athlete, I want imported HR to stick and be removable, so
I don't re-upload every visit.

#### Acceptance criteria

1. WHEN the athlete applies an import THEN the replay SHALL immediately show HR
   gauge, heart trace, and HR zones using the merged strokes.
2. WHERE the athlete is authenticated with D1 THE system SHALL persist merged
   detail via the existing `workout_detail` cache (`putCachedDetail`) — no
   separate HR table.
3. WHERE the app is in demo mode THE overlay SHALL persist in `localStorage`
   keyed by workout id (no D1 write).
4. WHEN the athlete clears an import THEN strokes SHALL revert to logbook HR
   (none), persisted overlay SHALL be removed, and HR UI SHALL hide again.
5. THE apply/clear endpoints SHALL reject unauthenticated callers in live mode.

### Requirement 5 — Quality and i18n

**User story:** As the maintainer, I want the feature to meet rowplay's bar.

#### Acceptance criteria

1. Merge, interpolation, and summary logic SHALL live in a pure DOM-free module
   with Vitest coverage (offset maths, interpolation boundaries, summary).
2. EVERY user-visible string SHALL be added to BOTH `en` and `zh` in
   `src/lib/i18n.ts`.
3. THE feature SHALL pass `npm run check`, `npm run build`, `npm run test`, and
   `npm run test:e2e` (new smoke: demo no-HR workout → import fixture → HR
   chart visible).
