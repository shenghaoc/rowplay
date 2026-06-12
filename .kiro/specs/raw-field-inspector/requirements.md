# Raw Field Inspector — Requirements

## Introduction

rowplay's differentiator is **replay**, and its user is a data nerd who values
the Concept2 logbook's clean, consistent, well-specified data. This feature
turns the replay from an *animation* into an *instrument*: a logic-analyzer-style
readout slaved to the scrubber that shows **every raw logbook value at the
current instant**, unmassaged — the value as Concept2 logged it (tenths,
decimetres, per-1000m bike pace) shown side by side with rowplay's normalized
value.

It is the most rowplay-native feature imaginable: 100% logbook-sourced (no live
erg capture), 100% replay-bound, and unmistakably built by someone who has
debugged a serial protocol. C2's own surfaces never show this; they present a
polished summary. The inspector shows the wire.

A crucial fidelity point drives the design: `sampleAt` **interpolates** between
strokes for smooth playback, but an inspector must show the **actual logged
sample held until the next one** (sample-and-hold), never a value that was never
logged. The inspector therefore reads the real stroke at/before the current
time, not the interpolated frame.

It obeys every project rule in `AGENTS.md`: works in **demo mode**, every label
through **i18n** in all six locales, pure logic is DOM-free and unit-tested, and
it passes the full quality gate (`check` + `build` + `test` + `test:e2e`).

## Glossary

- **Frame** — the interpolated `Frame` the engine emits each rAF tick
  (`engine.ts`): smooth, good for rendering, **not** a real logged sample.
- **Raw stroke** — an actual logged `Stroke` from the workout's `strokes[]`.
- **Sample-and-hold** — show the most recent raw stroke at/before `t`, holding
  its value until the next sample (logic-analyzer semantics).
- **As-logged** — the Concept2 wire representation reconstructed from the
  normalized value via the documented inverse transform (time ×10 → tenths,
  distance ×10 → decimetres, pace ×10 → tenths and ×2 for BikeErg per-1000m).
- **Inspector** — the readout panel, toggled on the replay view, that updates
  with the scrubber.

## Requirements

### Requirement 1 — Read the real sample, not the interpolation

**User story:** As a data nerd, I want the inspector to show the value Concept2
actually logged at this point, so that I'm reading data, not a tween.

#### Acceptance criteria

1. THE inspector SHALL display, for the current scrubber time `t`, the **most
   recent raw stroke at or before `t`** (sample-and-hold), not the interpolated
   `Frame`.
2. THE most-recent-sample lookup SHALL be a **pure, DOM-free** helper
   (`sampleIndexAt`) reusing the engine's existing bracketing search, and SHALL
   be covered by Vitest unit tests (including `t` before the first and after the
   last sample).
3. WHEN the scrubber moves within the span between two samples THE displayed raw
   values SHALL NOT change until `t` crosses the next sample boundary.

### Requirement 2 — Show as-logged next to normalized

**User story:** As an embedded engineer, I want to see the wire representation
beside the decoded value, so that I can trust (and audit) the normalization.

#### Acceptance criteria

1. THE inspector SHALL show, per per-stroke field (`t`, `d`, `p`/pace, `spm`,
   `hr`, `watts`), both the **as-logged** representation (correct Concept2 units)
   and rowplay's **normalized** value.
2. THE as-logged reconstruction SHALL be a pure function of the normalized
   stroke + sport, applying the documented inverse transform (tenths,
   decimetres, BikeErg per-1000m pace), and SHALL be unit-tested against the
   forward transform in `concept2.ts` (round-trip consistency).
3. THE protocol field tokens (`t`, `d`, `p`, `spm`, `hr`) SHALL be shown
   verbatim (not translated, like sport names); their human descriptions SHALL
   be i18n'd.
4. THE inspector SHALL also show useful **derived** values at the instant:
   workout `progress`, current split/interval index, and **distance-per-stroke**
   (metres/stroke) — the seed quantity for the later efficiency-drift analysis.

### Requirement 3 — Slaved to the scrubber, efficiently

**User story:** As a user scrubbing or playing back, I want the readout to track
the playhead without jank, so that it feels like a live instrument.

#### Acceptance criteria

1. THE inspector SHALL update as the engine's time advances (play, scrub, seek,
   speed change), reflecting the current sample-and-hold stroke.
2. THE inspector SHALL recompute its displayed rows **only when the raw sample
   index changes**, not on every rAF tick, so playback stays allocation-light.
3. WHERE the workout has no per-stroke data (split-only fallback) THE inspector
   SHALL degrade gracefully to the synthesized samples the replay already uses,
   without throwing.

### Requirement 4 — Discoverable, optional, accessible

**User story:** As a user, I want to toggle the inspector on demand, so that it
doesn't clutter the default replay.

#### Acceptance criteria

1. THE inspector SHALL be **off by default** and toggled from the replay
   controls (mirroring the existing renderer/quality toggles).
2. THE values SHALL be rendered in a monospace, tabular-aligned layout so digits
   don't jitter as they change.
3. THE toggle and all labels SHALL be i18n'd in all six locales and reachable /
   operable by keyboard with appropriate roles.

### Requirement 5 — Provenance rows and privacy

**User story:** As the maintainer, I want the inspector to extend to result-level
fields without leaking PII on shared replays, so that it grows safely.

#### Acceptance criteria

1. THE inspector SHALL include a static (non-time-varying) section for
   workout-level fields that already exist (sport, distance, time, drag factor,
   …), shown once rather than per sample.
2. WHERE the full-fidelity-data capture (separate spec) has landed THE inspector
   SHALL surface the result `metadata` block (PM version, firmware, erg model,
   HR sensor type, **source/entered app**) in that static section.
3. WHERE the replay is the **public** `/r/<token>` view THE inspector SHALL NOT
   show identifying provenance (`serial_number`, `device`), consistent with the
   shared-view redaction.
4. THE per-stroke inspector SHALL function on **current** data with no dependency
   on the full-fidelity spec; only the `metadata` rows require it.

### Requirement 6 — Quality and i18n

#### Acceptance criteria

1. `sampleIndexAt`, the as-logged reconstruction, and distance-per-stroke SHALL
   be pure and unit-tested.
2. EVERY user-visible string SHALL be added to all six i18n dictionaries.
3. THE feature SHALL pass the full gate: `pnpm run check` (0 errors),
   `pnpm run build`, `pnpm run test`, `pnpm run validate:locales`, and
   `pnpm run test:e2e` (a smoke spec toggles the inspector in demo mode and
   asserts a raw value holds between samples and updates across a boundary).
