# Full-fidelity Concept2 Data — Requirements

## Introduction

rowplay reads the Concept2 Logbook result model server-side (`mapResult` /
`mapSplits` in `src/lib/server/concept2.ts`) but keeps only a **subset** of the
fields Concept2 carries. The athlete wants to *deeply* analyze performance and
*see everything Concept2 provides* — and today the data layer silently drops
fields the API returns, so the analysis and the UI literally cannot reference
data that exists.

The authoritative field list is the Logbook result model (the create/read
result schema: result-level fields, the `workout.splits` / `workout.intervals`
objects, `workout.targets`, per-stroke `stroke_data`, and the result `metadata`
object). This spec widens rowplay's capture to **full fidelity** across that
model, versions the cached payload so it re-hydrates safely, surfaces every
captured field in a complete metadata view, and adds the analysis the newly
captured fields unlock (HR recovery, work:rest efficiency, target-vs-actual,
per-split power/calorie/drag).

It obeys every project rule in `AGENTS.md`: it works in **demo mode** (mock
data is extended with the new fields), every string goes through **i18n** in all
six locales, server-only reads stay server-side, no PII leaks onto public shared
replays, and it passes the full quality gate (`check` + `build` + `test` +
`test:e2e`).

## Glossary

- **Result model** — the Concept2 Logbook workout object: result-level summary +
  nested `workout` (splits/intervals/targets) + `stroke_data` + `metadata`.
- **Captured field** — a field rowplay reads from the API into its own types
  (`Workout` / `Split` / `WorkoutDetail` / `Stroke`).
- **Metadata block** — the result `metadata` object (`pm_version`,
  `firmware_version`, `serial_number`, `device`, `erg_model_type`, `hr_type`,
  …): provenance of how the piece was logged. Optional; present only when the
  logging client supplied it.
- **Targets** — the athlete's intended `stroke_rate` / `heart_rate_zone` /
  `pace` / `watts` / `calories` for the piece (or per variable interval).
- **Payload version** — `DETAIL_PAYLOAD_VERSION` in `src/lib/server/db.ts`,
  which invalidates cached D1 detail rows when the shape changes.

## Requirements

### Requirement 1 — Capture all result-level fields

**User story:** As an athlete, I want every result-level field Concept2 stores
to be captured, so that nothing the API returns is thrown away before I can
analyze it.

#### Acceptance criteria

1. THE result mapping SHALL capture, in addition to today's fields:
   `timezone`, `weight_class`, `privacy`, `verified`, `rest_time`,
   `rest_distance`, and the full `heart_rate` object including **`ending`** and
   **`recovery`** (today only `average`/`min`/`max` are read).
2. WHERE the result carries a `workout.targets` object THE system SHALL capture
   the target `stroke_rate`, `heart_rate_zone`, `pace`, `watts`, and `calories`.
3. WHERE the result carries a `metadata` object THE system SHALL capture
   `pm_version`, `firmware_version`, `serial_number`, `device`, `device_os`,
   `device_os_version`, `erg_model_type`, and `hr_type`.
4. WHERE any field is absent from the API response THE captured value SHALL be
   `undefined` (not `0`, not `""`), so "not reported" is distinguishable from a
   real zero.
5. THE units already normalized on read (time tenths→seconds, pace per-1000m→
   per-500m for bike, stroke `d` decimetres→metres) SHALL be applied
   consistently to every newly captured time/distance/pace field.

### Requirement 2 — Capture all split / interval fields

**User story:** As an athlete, I want each split and interval to carry its full
detail, so that I can break a piece down rep by rep.

#### Acceptance criteria

1. THE split/interval mapping SHALL capture, per split, in addition to today's
   fields: `calories_total`, `wattminutes_total`, and the **full** `heart_rate`
   object (`average`, `min`, `max`, `ending`, `rest`, `recovery`) — today only a
   single average HR is read.
2. WHERE the split is an interval THE system SHALL additionally capture the
   interval `type` (`time` | `distance` | `calorie` | `wattminute`),
   `rest_time`, `rest_distance`, and (for MultiErg) the per-interval `machine`.
3. THE `isInterval` determination SHALL remain correct, and each split SHALL
   expose whether it is a work or rest segment so work:rest analysis is possible.
4. THE per-stroke capture (`t`, `d`, `p`→pace, `spm`, `hr`) SHALL be confirmed
   complete against the stroke schema and SHALL NOT regress.

### Requirement 3 — Version and migrate the cached payload

**User story:** As the maintainer, I want widening the detail type to invalidate
stale cache safely, so that no athlete sees a half-populated workout.

#### Acceptance criteria

1. WHEN `Workout` / `Split` / `WorkoutDetail` gain fields THEN
   `DETAIL_PAYLOAD_VERSION` in `db.ts` SHALL be bumped so previously cached D1
   detail rows are treated as stale and re-hydrated from the API on next read.
2. WHERE a cached payload predates the bump THE system SHALL re-fetch rather than
   render missing fields, and SHALL NOT throw on the old shape.
3. THE widened fields SHALL all be **optional** on the types so existing
   consumers (replay engine, renderer, analytics, leaderboard) compile and run
   unchanged.

### Requirement 4 — Surface every captured field

**User story:** As an athlete, I want to see all of it, so that the workout view
reflects everything Concept2 knows about my piece.

#### Acceptance criteria

1. THE workout detail / replay view SHALL present a **complete metadata panel**
   listing every captured result-level field that is present (HR ending/recovery,
   rest time/distance, weight class, drag factor, watt-minutes, verified flag,
   targets, and the logging metadata), formatted via `format.ts`.
2. THE splits/intervals view SHALL expose the per-split calories, watt-minutes,
   HR detail, and (for intervals) type + rest, not just distance/time/pace.
3. WHERE a field is absent THE UI SHALL omit its row rather than show a blank or
   a misleading zero.
4. EVERY label SHALL come from i18n in all six locales; sport/machine names and
   raw enum tokens that are proper nouns stay untranslated.

### Requirement 5 — Analysis unlocked by the new fields

**User story:** As an athlete, I want analysis that uses the newly captured data,
so that "more fields" turns into "deeper insight."

#### Acceptance criteria

1. THE system SHALL add a pure, DOM-free analysis (in/alongside `analytics.ts`)
   for **HR recovery** (using `heart_rate.ending` → `recovery`) trended across
   **hydrated workout details** (`WorkoutDetail[]` from the detail endpoint or
   D1 cache — not the summary list alone).
2. THE system SHALL add a **work:rest efficiency** analysis for interval pieces
   using the captured `rest_time` / `rest_distance` (total and per interval).
3. WHERE a piece carries `targets` THE system SHALL compute and present
   **target-vs-actual** (e.g. achieved pace/watts/stroke-rate vs the logged
   target).
4. ALL new analysis SHALL be pure and covered by Vitest unit tests with
   deterministic fixtures.

### Requirement 6 — Quality, privacy, and i18n

**User story:** As the maintainer, I want full-fidelity capture without leaking
sensitive provenance, so that it ships safely.

#### Acceptance criteria

1. THE public shared replay (`/r/<token>`) SHALL NOT expose identifying
   provenance — specifically `serial_number`, `device`, `device_os`,
   `device_os_version`, and any metadata that could fingerprint the athlete's
   hardware — even though the owner sees it on their own view. `redactForPublic`
   SHALL run inside `loadSharedWorkout`.
2. THE mapping and analysis logic SHALL be covered by Vitest unit tests, and
   `mockData.ts` SHALL be extended so demo mode exercises every new field
   (including an interval piece with rest + targets + metadata).
3. EVERY user-visible string SHALL be added to all six i18n dictionaries.
4. THE feature SHALL pass the full gate: `npm run check` (0 errors),
   `npm run build`, `npm run test`, `npm run validate:locales`, and
   `npm run test:e2e`.

## Open verification

The field schema above is taken from the Logbook **create-result** model, which
the read endpoints mirror. Two items must be confirmed against a real
`GET /api/users/me/results/{id}` response during task 1, because some APIs accept
a field on write without echoing it on read:

1. Whether `workout.targets` is returned on read.
2. Whether the result `metadata` block is returned on read (and which keys).
3. Whether rest periods appear as separate `intervals[]` elements or only via
   `rest_time` / `rest_distance` on work interval elements (determines `isRest`).

If either is read-only-absent, its capture/surface/analysis tasks drop to
"best-effort when present" rather than guaranteed.
