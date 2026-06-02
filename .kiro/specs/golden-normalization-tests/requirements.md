# Golden-file Normalization Tests — Requirements

## Introduction

rowplay's normalization layer (`mapResult`, `mapStrokes`, `mapSplits` in
`src/lib/server/concept2.ts`) converts raw Concept2 API wire values — time in
tenths of a second, distance in decimetres, pace in tenths with BikeErg
per-1000m — into the internal SI-like units the rest of the app consumes. Today
nothing *proves* these conversions are correct end-to-end: the raw-field
inspector shows raw-vs-normalized but both values derive from the same code path,
so a systematic bug in `mapStrokes` would appear self-consistent in the UI while
silently corrupting every replay, pace display, and watt calculation.

This feature introduces **golden-file normalization tests**: a handful of
checked-in fixture files that capture representative real (redacted) Concept2
result and stroke API responses, paired with explicitly asserted expected
normalized output. Any regression in the unit-conversion logic immediately
fails CI. The tests are pure Vitest (DOM-free) and exercise the normalization
functions directly, without an HTTP layer.

They also double as the first verified test vectors for the full-fidelity-data
fields that arrived in PR #61 — ensuring that the wider capture of `mapResult`
and `mapSplits` (HR detail, targets, metadata, rest fields) is also anchored
to real data.

## Glossary

- **Golden file** — a checked-in JSON fixture capturing both the raw Concept2
  API payload and the expected normalized output for a specific workout case.
- **Fixture case** — one distinct workout scenario (sport x structure
  combination) represented by one or more JSON golden files.
- **Normalization function** — `mapResult`, `mapStrokes`, or `mapSplits` from
  `src/lib/server/concept2.ts`.
- **Redaction** — removal or replacement of PII and credentials from fixture
  data before committing (see Req 3).
- **Wire value** — a field as the Concept2 Logbook API returns it: `t` in
  tenths of a second, `d` in decimetres, `p` in tenths (per-500m row/ski,
  per-1000m bike), `time` in tenths, `distance` in metres.

## Requirements

### Requirement 1 — Fixture cases cover the critical normalization paths

**User story:** As a maintainer, I want the golden-file suite to cover every
non-trivial unit conversion so that a bug in any one conversion path fails at
least one test.

#### Acceptance criteria

1. THE suite SHALL include a fixture case for a **steady RowErg piece** (e.g.
   2000 m or 5000 m), asserting:
   - `mapResult` converts `time` (tenths to seconds), computes `pace` as
     `time / (distance / 500)` in sec/500m, and passes `distance` through
     unchanged (metres as-is from the API).
   - `mapStrokes` converts each stroke `t` (tenths to seconds), `d`
     (decimetres to metres), and `p` (tenths to sec/500m, `paceDiv = 1`).
   - `mapSplits` converts split `time` (tenths to seconds) and computes split
     `pace` correctly.

2. THE suite SHALL include a fixture case for a **BikeErg piece**, asserting
   that `mapStrokes` applies `paceDiv = 2` to stroke `p` (per-1000m wire to
   per-500m normalized) and that `mapResult` correctly identifies `sport = 'bike'`.

3. THE suite SHALL include a fixture case for a **SkiErg piece**, asserting
   that `mapStrokes` uses `paceDiv = 1` (identical to rower — no halving),
   and that `sport = 'ski'`.

4. THE suite SHALL include a fixture case for an **interval RowErg piece**
   (minimum two work reps), asserting that `mapStrokes` detects the t/d
   counter reset between reps and accumulates the correct offsets so the
   output timeline is monotonically increasing across the interval boundary.
   The fixture SHALL contain strokes whose raw `t` and `d` values restart
   from zero at the second rep.

5. EACH fixture case SHALL assert **at minimum** the first stroke, the last
   stroke, and (where applicable) the first stroke of the second rep, so that
   both individual samples and the cumulative offset logic are verified.

6. THE RowErg steady and interval cases SHALL also assert `mapSplits` output
   (at minimum one split's `time`, `distance`, and `pace`) so that the split
   normalization is independently anchored.

### Requirement 2 — Assertions are specific, not round-trip

**User story:** As a maintainer, I want the tests to assert specific numeric
values, not just "output equals what the function produces from the same input",
so that a bug in the function would actually fail the test.

#### Acceptance criteria

1. THE expected output in each golden fixture SHALL be **hand-verified values**
   (computed independently from the documented API units) rather than values
   captured by running the current implementation.
2. FOR each conversion the test SHALL assert the exact normalized value (or
   within a tolerance of `±0.001` for floating-point pace/time) rather than
   structural shape alone.
3. THE interval fixture assertion SHALL explicitly verify the accumulated `t`
   and `d` for the first stroke of the second rep (i.e. `rawT + tOffset` and
   `rawD + dOffset`), confirming the offset is the last value from the
   previous rep, not zero.
4. THE bike pace assertion SHALL explicitly verify that the normalized pace is
   **half** the result of dividing the raw `p` by 10, confirming the per-1000m
   to per-500m halving occurs.

### Requirement 3 — Fixture redaction rules

**User story:** As a contributor, I want a clear, enforceable policy for what
to remove from fixtures before committing, so that no real athlete data or
credentials are ever checked in.

#### Acceptance criteria

1. FIXTURE files SHALL NOT contain any real `id` values (result or user id).
   All numeric ids SHALL be replaced with small deterministic stand-ins (e.g.
   `9001`, `9002`).
2. FIXTURE files SHALL NOT contain any token, cookie, authorization header, or
   secret. Fixtures are pure API response bodies — no HTTP headers.
3. FIXTURE files SHALL NOT contain any name, username, first_name, email, or
   other personally identifying string. Where the raw API response included
   such fields, they SHALL be absent from the fixture or replaced with the
   literal string `"REDACTED"`.
4. FIXTURE files SHALL NOT contain `serial_number` or `device` from the
   `metadata` block. These fields SHALL be absent from the fixture entirely
   (not replaced with a placeholder), consistent with the public-view redaction
   policy in the full-fidelity-data spec.
5. FIXTURE files SHALL use realistic but not real numeric values for
   performance fields (`time`, `distance`, stroke data) so that tests remain
   meaningful. A 2000 m piece at 7:30 (time = 4500 tenths) with plausible
   stroke data is appropriate; a 2000 m piece at 00:01 is not.
6. A `REDACTION.md` file co-located in the golden fixture directory SHALL
   document which fields were removed or replaced, why, and the policy for
   adding new fixtures in the future.

### Requirement 4 — Fixture file layout and loader

**User story:** As a contributor adding a new test case, I want the fixture
format and loader to be predictable, so I know exactly what JSON to write and
how to import it.

#### Acceptance criteria

1. FIXTURE files SHALL live under `tests/fixtures/golden/` and follow the
   naming pattern `<case>.fixture.json` (e.g.
   `rower-steady.fixture.json`, `bike-steady.fixture.json`,
   `ski-steady.fixture.json`, `rower-interval.fixture.json`).
2. EACH fixture JSON file SHALL have the structure:
   ```jsonc
   {
     "description": "<human-readable case description>",
     "rawResult": { /* RawResult shape as returned by GET /results/{id} */ },
     "rawStrokes": [ /* RawStroke[] as returned by GET /results/{id}/strokes */ ],
     "expected": {
       "result": { /* Partial<Workout> — the fields under test */ },
       "strokes": [ /* selected Stroke objects (first, last, key reps) */ ],
       "splits": [ /* Split[] or [] if not asserted */ ]
     }
   }
   ```
3. THE test file SHALL import fixtures via static Vite/Vitest JSON imports
   (e.g. `import fixture from '../../fixtures/golden/rower-steady.fixture.json'
   assert { type: 'json' }`) — no `fs.readFileSync`, no dynamic runtime I/O.
4. WHERE the fixture does not assert `mapStrokes` (e.g. splits-only fallback
   case), `rawStrokes` SHALL be an empty array `[]` and
   `expected.strokes` SHALL be `[]`.
5. THE `expected.strokes` array in the fixture SHALL document which strokes are
   asserted by index (using the `description` field and inline comments) so
   that adding intermediate strokes later does not silently change the meaning
   of existing assertions.

### Requirement 5 — Extensibility for full-fidelity-data fields (PR #61 soft dependency)

**User story:** As a maintainer, I want the golden fixtures to be extensible to
the new fields from PR #61 without requiring a restructure, so that we can
anchor the wider capture as real data becomes available.

#### Acceptance criteria

1. THE `rawResult` fixture block MAY include full-fidelity-data fields
   (`heart_rate` as an object, `metadata`, `rest_time`, `rest_distance`,
   `workout.targets`, etc.) when they are available from the real API response.
   The `expected.result` block SHALL then assert the corresponding normalized
   fields (`heartRate.ending`, `metadata.pmVersion`, `restTime`,
   `targets.pace`, etc.).
2. WHERE a fixture was sourced from a response that did not include metadata
   (because `?include=metadata` was not requested or the field was absent),
   `expected.result.metadata` SHALL be `undefined` — and the test SHALL
   assert that absence explicitly (it is not silently skipped).
3. THE core normalization tests (Req 1–4) stand entirely on the current
   `concept2.ts` API contract and do not require PR #61 to be landed.
   Full-fidelity assertions are additive: they are enabled by populating the
   relevant keys in the fixture, with no structural change to the test file.
4. THE fixture format SHALL NOT require a version field in the initial
   implementation, but the `REDACTION.md` SHALL note that a `"fixtureVersion"`
   key SHOULD be added once the full-fidelity shape stabilizes, to track
   fixture provenance across schema bumps.

### Requirement 6 — Quality gate and CI integration

**User story:** As a maintainer, I want the golden-file tests to run in the
existing `npm run test` Vitest suite and fail CI on any normalization regression,
without requiring any new tooling or credentials.

#### Acceptance criteria

1. THE golden-file tests SHALL live in a single test file at
   `src/lib/server/concept2.golden.test.ts` (alongside the existing
   `concept2.test.ts`) so that `npm run test` picks them up automatically
   without config changes.
2. THE tests SHALL be pure Vitest (`describe`/`it`/`expect`) with no DOM
   dependency, no network calls, and no environment variables required.
3. THE tests SHALL NOT depend on the Cloudflare Workers runtime
   (`KVNamespace`, `D1Database`) — the normalization functions accept plain
   data and return plain objects.
4. `npm run test` SHALL pass with the new tests present. `npm run check` and
   `npm run build` SHALL also pass (no new TypeScript errors introduced by
   fixture types).
5. THE tests SHALL run in under 500 ms total (they are pure data
   transformations with no I/O).
