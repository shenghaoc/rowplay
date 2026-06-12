# Efficiency-Drift Overlay — Requirements

## Introduction

The replay scrubber turns a raw workout into a *film*. This feature adds a
**second layer of intelligence to that film**: a distance-per-stroke (DPS) trace
that animates with the playhead and shows, at a glance, whether the athlete's
efficiency held, drifted, or collapsed as the piece wore on.

DPS (metres/stroke = `30000 / (pace × spm)`) is the **real output metric** for
a Concept2 athlete: it captures exactly how much work each stroke produced.
Efficiency *fade* manifests as DPS sagging while stroke rate holds or rises — the
athlete is working harder for less boat. This is the insight the overlay delivers.

The overlay is **self-contained**: it defines its own baseline from the opening
segment of the piece (~first 500 m) so no historical data is needed. It
**animates as the replay scrubs** — the scrubber cursor tracks across the DPS
trace in real time. It lives on the replay timeline, not on the dashboard.

The feature depends on PR #63 (raw-field-inspector), which landed
`distancePerStroke` in `src/lib/replay/inspector.ts` (wrapping
`analytics.distancePerStroke`) and is the authoritative single source for that
computation.

It obeys every project rule in `AGENTS.md`: works in **demo mode**, all user
strings through **i18n** in all six locales, pure computation is DOM-free and
unit-tested with fixtures, reduced-motion respected, and it passes the full
quality gate (`check` + `build` + `test` + `test:e2e`).

## Glossary

- **DPS** — Distance per stroke in metres: `30000 / (pace × spm)`. Undefined
  when pace or spm is non-positive or NaN (guarded with `!(x > 0)`).
- **Baseline** — The athlete's average DPS over the **opening segment** of the
  piece (first ~500 m of valid strokes, or the first 10% of total distance when
  piece is shorter than 5000 m). At minimum the first 5 valid strokes are
  included to avoid a one-sample baseline on very short pieces.
- **Drift** — The signed difference DPS(stroke) minus baseline. Positive = more
  efficient than the opening; negative = efficiency loss.
- **Fade summary** — The signed delta between the closing-segment mean DPS and
  the baseline, expressed in m/stroke and as a percentage. Positive = piece
  improved; negative = fade.
- **Overlay** — The DPS trace rendered as a second series on the pace chart,
  sharing the time x-axis, with the scrubber cursor tracking the playhead.
- **Gap** — A span where pace or spm is invalid (DPS undefined). The trace must
  render a visible break rather than a straight-line bridge.
- **Reduced motion** — CSS `prefers-reduced-motion: reduce` media feature.

## Requirements

### Requirement 1 — Pure drift computation, DOM-free and tested

**User story:** As a developer, I want a pure function that converts a stroke
array into a DPS series, baseline, and fade summary, so that I can unit-test it
independently of the UI and reuse it elsewhere.

#### Acceptance criteria

1. A new exported function `efficiencyDrift(strokes: Stroke[]): EfficiencyDriftResult`
   SHALL live in `src/lib/analytics.ts` (pure; no DOM, no Svelte).
2. The function SHALL compute DPS for every stroke using the existing
   `distancePerStroke(pace, spm)` from `src/lib/analytics.ts`, with no
   duplication of the formula.
3. The function SHALL return a `series` array of `{ t: number; dps: number }`
   points aligned to each stroke's `t` (seconds). Strokes where DPS is undefined
   or zero SHALL be **omitted** from the series (not interpolated, not null-padded
   at this layer).
4. The **opening segment** for baseline calculation SHALL consist of valid strokes
   up to and including the first stroke whose cumulative distance `d` reaches
   500 m; for pieces with total distance < 5000 m the threshold is 10% of total
   distance; at minimum the first 5 valid strokes SHALL be included regardless.
5. The function SHALL return `baseline: number` (the mean DPS over the opening
   segment).
6. The function SHALL return `baselineEndD: number` — the cumulative distance in
   metres at which the opening segment closes — so the overlay can draw the
   baseline annotation at the right x-position on the chart.
7. The **closing segment** for fade calculation SHALL mirror the opening segment
   definition: valid strokes from the final 500 m (or 10% of distance) of the
   piece, minimum 5 valid strokes.
8. The function SHALL return `fadeDelta: number` (closing-segment mean DPS minus
   baseline; negative = fade, positive = negative split) and `fadePercent: number`
   (`fadeDelta / baseline × 100`, or 0 when baseline is 0).
9. WHEN `strokes` contains fewer than 5 valid DPS samples in total the function
   SHALL return `{ series: [], baseline: 0, baselineEndD: 0, fadeDelta: 0, fadePercent: 0 }`.

### Requirement 2 — Gaps represent real data absences, not smooth bridges

**User story:** As a coach, I want to see breaks in the DPS trace where pace or
spm was invalid, so that I'm reading real data and not a smoothed lie.

#### Acceptance criteria

1. WHEN consecutive valid DPS points are separated by one or more invalid strokes
   THE data array passed to uPlot SHALL contain a `null` entry between them, not
   an interpolated value.
2. THE `UPlotChart` series config for the DPS overlay SHALL use `spanGaps: false`
   so uPlot renders a visible break between disconnected segments.
3. The null-padding (Req 2.1) SHALL be applied at the chart data preparation
   layer in the page (not in `efficiencyDrift` itself, which returns only valid
   points — see Req 1.3), by aligning the series to the full stroke time-axis
   with `null` where no valid DPS point exists.

### Requirement 3 — Overlay renders on the pace chart, scrubber-tracked

**User story:** As an athlete reviewing my replay, I want to see the DPS trace
layered on the pace chart, with the scrubber cursor following as I play or scrub,
so that I can see how my efficiency relates to my pace moment by moment.

#### Acceptance criteria

1. THE DPS overlay SHALL render as a **second series** on the existing pace
   `UPlotChart` card in the replay page, sharing the x-axis (time in seconds).
   The DPS y-axis SHALL be on the right side of the chart.
2. THE overlay SHALL be visible only when a labelled **toggle** is active; it
   SHALL be **off by default** to keep the default pace chart uncluttered.
3. THE `UPlotChart` `marker` prop already passed as `frame.t` to the pace chart
   SHALL continue to drive the vertical cursor line as the replay plays or scrubs.
4. THE overlay series SHALL use `var(--dps)` CSS variable (a warm amber tone,
   already defined in the chart theme palette) to distinguish it from the pace
   line in both light and dark themes.
5. A **horizontal baseline reference line** SHALL be drawn at `y = baseline` on
   the DPS right-axis, styled as a dashed muted-colour line.
6. THE chart data for the overlay (`EfficiencyDriftResult`) SHALL be computed
   **once** via a `$derived` that depends only on `strokes`. It SHALL NOT be
   recomputed per animation frame.

### Requirement 4 — Fade summary badge

**User story:** As an athlete, I want a headline number telling me how much my
efficiency changed from start to finish, so that I can quickly assess whether
this was a good technical piece.

#### Acceptance criteria

1. THE replay page SHALL display a fade summary when the overlay toggle is active,
   showing: the baseline DPS value (e.g. `8.2 m/st`), the fade delta (e.g.
   `−0.6 m/st`), and the fade percent (e.g. `−7.3%`).
2. THE delta value SHALL use a **semantic colour**: CSS class `good` when
   `fadeDelta >= 0` (held or improved), `warn` when `fadePercent` is between
   `−5` and `0`, and `bad` when `fadePercent < −5`. These match the existing
   `.good` / `.bad` classes used on the `tech.fade` stat in the page.
3. The summary SHALL render only WHEN `efficiencyDrift.series.length >= 5`.
4. WHEN `prefers-reduced-motion: reduce` is set the animated cursor on the chart
   SHALL be static (no interpolated smooth movement between frames); the series
   data itself requires no further motion consideration.

### Requirement 5 — Demo mode and graceful degradation

**User story:** As a new visitor, I want the overlay to work on the demo workout
without any credentials, so that I can evaluate the feature immediately.

#### Acceptance criteria

1. THE overlay SHALL work on any workout whose strokes carry valid `pace` and
   `spm`, including the demo workout at `/replay/1001`.
2. THE overlay toggle and summary SHALL be **hidden** (not rendered) WHEN
   `efficiencyDrift.series.length < 5`, without throwing or rendering corrupted
   output.
3. THE feature SHALL require no new server endpoints, KV bindings, or D1 schema
   changes; it reads only `WorkoutDetail.strokes`.

### Requirement 6 — i18n and accessibility

**User story:** As a user in any supported locale, I want all labels to be in my
language, so that the feature feels native.

#### Acceptance criteria

1. EVERY user-visible string introduced by this feature SHALL be added to all six
   locale files (`en`, `zh`, `de`, `es`, `fr`, `ja`): overlay toggle label,
   baseline label, fade delta label, fade percent label, the summary title, and
   unit strings.
2. THE toggle SHALL be keyboard-operable with a visible focus ring and an
   `aria-pressed` attribute (or equivalent checkbox semantics).
3. `pnpm run validate:locales` SHALL pass with no missing keys.

### Requirement 7 — Quality gate

#### Acceptance criteria

1. `pnpm run check` SHALL report 0 errors (existing `state_referenced_locally`
   warnings are accepted).
2. `pnpm run build` SHALL succeed.
3. `pnpm run test` SHALL be green, including new unit tests for `efficiencyDrift`
   (steady-pace fixture ≈ flat series, fading fixture trends down, short fixture
   returns empty, gap handling).
4. `pnpm run test:e2e` SHALL pass; a new smoke spec SHALL: open demo replay at
   `/replay/1001`, toggle the overlay on, assert the DPS chart series is visible,
   and assert the fade summary element appears with a numeric value.
