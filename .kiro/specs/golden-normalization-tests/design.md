# Golden-file Normalization Tests — Design

## Overview

Four JSON golden fixtures capture representative real (redacted) Concept2 API
responses — one per critical normalization path — together with hand-verified
expected normalized output. A single Vitest test file loads each fixture, calls
the normalization functions directly, and asserts the expected values.

The design is deliberately minimal: no new runtime helpers, no extra build
steps, no HTTP mocking. The fixtures are pure JSON; the test file is a standard
Vitest module; the normalization functions are already exported and take plain
data. The only novel element is the fixture schema, the loader pattern, and the
`REDACTION.md` policy file.

```
tests/fixtures/golden/
  rower-steady.fixture.json      ← RowErg 2000 m (Req 1.1, 1.6)
  bike-steady.fixture.json       ← BikeErg 4000 m (Req 1.2)
  ski-steady.fixture.json        ← SkiErg 6000 m  (Req 1.3)
  rower-interval.fixture.json    ← 4×500 m RowErg (Req 1.4, 1.6)
  REDACTION.md                   ← redaction policy (Req 3.6)

src/lib/server/
  concept2.golden.test.ts        ← test file (Req 6.1)
```

The test file sits beside the existing `concept2.test.ts` so Vitest's default
glob (`src/**/*.test.ts`) picks it up with zero config changes (Req 6.1).

## Fixture schema

Each `.fixture.json` follows this shape (TypeScript equivalent for clarity):

```ts
interface GoldenFixture {
  /** Human-readable description of the case and what is being asserted. */
  description: string;

  /**
   * Raw Concept2 API result body (from GET /api/users/me/results/{id}).
   * PII-redacted; id replaced with stand-in. See REDACTION.md.
   */
  rawResult: RawResultFixture;

  /**
   * Raw stroke array (from GET /api/users/me/results/{id}/strokes).
   * Empty array [] when the case does not test mapStrokes.
   */
  rawStrokes: RawStrokeFixture[];

  expected: {
    /**
     * Partial<Workout> — only the fields explicitly under test.
     * Hand-verified against the documented API unit conversions.
     */
    result: Partial<WorkoutFixture>;

    /**
     * Key normalized strokes to assert (first, last, interval-boundary).
     * Empty array [] when rawStrokes is empty.
     * Annotated by position in the fixture description.
     */
    strokes: StrokeFixture[];

    /**
     * Key normalized splits to assert (at least split 0 for steady/interval cases).
     * Empty array [] when not asserted.
     */
    splits: SplitFixture[];
  };
}
```

`RawResultFixture`, `RawStrokeFixture`, etc. are just JSON objects that match
the shapes in `concept2.ts` (`RawResult`, `RawStroke`, `RawSplit`). No separate
TypeScript types are introduced for fixtures; the test file casts with `as`
or relies on structural assignability.

## Fixture cases

### `rower-steady.fixture.json` — RowErg 2000 m

A typical 2000 m test piece from a RowErg. Representative values:

| Wire field | Example value | Expected normalized |
|---|---|---|
| `time` | `4500` (tenths) | `450` s |
| `distance` | `2000` m | `2000` m (pass-through) |
| `type` | `"rower"` | `sport = 'rower'` |
| Stroke `t` | `12` (tenths) | `1.2` s |
| Stroke `d` | `85` (decimetres) | `8.5` m |
| Stroke `p` | `1080` (tenths, per-500m) | `108` s/500m |
| Split `time` | `1125` (tenths) | `112.5` s |
| Split `distance` | `500` m | `500` m |
| Split `pace` | computed | `112.5 / (500/500) = 112.5` s/500m |

`rawStrokes` contains 4–8 strokes representing the piece. `expected.strokes`
asserts stroke 0 (first) and the last stroke. `expected.splits` asserts the
first 500 m split.

### `bike-steady.fixture.json` — BikeErg 4000 m

The critical test for `paceDiv = 2`. A BikeErg 4000 m piece.

| Wire field | Example value | Expected normalized |
|---|---|---|
| `type` | `"bike"` | `sport = 'bike'` |
| Stroke `p` | `2000` (tenths, per-1000m) | `100` s/500m (`2000/10/2`) |
| Stroke `p` | `1800` (tenths, per-1000m) | `90` s/500m (`1800/10/2`) |

`mapResult.pace` also uses `paceDiv` indirectly — verified via the computed
overall pace from `time` and `distance`. The `expected.result` asserts `sport =
'bike'`. `expected.strokes` asserts the per-1000m-to-per-500m halving on the
first and last strokes. No `mapSplits` assertion (the BikeErg case focuses on
the stroke pace conversion).

### `ski-steady.fixture.json` — SkiErg 6000 m

Confirms `paceDiv = 1` for SkiErg — pace should **not** be halved.

| Wire field | Example value | Expected normalized |
|---|---|---|
| `type` | `"ski"` | `sport = 'ski'` |
| Stroke `p` | `1440` (tenths, per-500m) | `144` s/500m (`1440/10/1`) |

`expected.strokes` asserts the first and last stroke. No splits assertion.

### `rower-interval.fixture.json` — 4 x 500 m RowErg

The critical test for the interval t/d reset and offset accumulation logic.
The raw stroke data contains two consecutive reps where `t` and `d` restart
from zero:

```
Rep 1 strokes: t = [0, 8, 16, 24, 32]  (tenths), d = [0, 40, 80, 120, 160] (dm)
Rep 2 strokes: t = [0, 8, 16, 24, 32]  (tenths), d = [0, 40, 80, 120, 160] (dm)
               ^ resets here — mapStrokes must detect prevT > rawT and add offset
```

After normalization:
```
Rep 1: t = [0.0, 0.8, 1.6, 2.4, 3.2] s, d = [0.0, 4.0, 8.0, 12.0, 16.0] m
Rep 2: t = [3.2, 4.0, 4.8, 5.6, 6.4] s, d = [16.0, 20.0, 24.0, 28.0, 32.0] m
            ^ tOffset = 3.2 (last t of rep 1), dOffset = 16.0 (last d of rep 1)
```

`expected.strokes` asserts:
- Stroke 0 (rep 1, first): `t = 0.0`, `d = 0.0`.
- Stroke 4 (rep 1, last): `t = 3.2`, `d = 16.0`.
- Stroke 5 (rep 2, first): `t = 3.2` (offset applied), `d = 16.0` (offset applied).
- Stroke 9 (rep 2, last): `t = 6.4`, `d = 32.0`.

The fixture also exposes `rawT` and `rawD` on these key strokes so that the
test can assert the pre-offset value separately (Req 2.3).

`expected.splits` asserts the first split (`time = 112.5` s, `distance = 500` m,
`pace = 112.5` s/500m) and the second split with the same structure.

## Test file design — `src/lib/server/concept2.golden.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { mapResult, mapStrokes, mapSplits } from './concept2';

// Static JSON imports — resolved at bundle time by Vite/Vitest.
import rowerSteady   from '../../../tests/fixtures/golden/rower-steady.fixture.json'
                     assert { type: 'json' };
import bikeSteady    from '../../../tests/fixtures/golden/bike-steady.fixture.json'
                     assert { type: 'json' };
import skiSteady     from '../../../tests/fixtures/golden/ski-steady.fixture.json'
                     assert { type: 'json' };
import rowerInterval from '../../../tests/fixtures/golden/rower-interval.fixture.json'
                     assert { type: 'json' };

// Tolerance for floating-point pace / time assertions (Req 2.2).
const PACE_TOL = 0.001;

function assertStroke(actual: Stroke, expected: Partial<Stroke>) {
    if (expected.t    !== undefined) expect(actual.t   ).toBeCloseTo(expected.t,    3);
    if (expected.d    !== undefined) expect(actual.d   ).toBeCloseTo(expected.d,    3);
    if (expected.pace !== undefined) expect(actual.pace).toBeCloseTo(expected.pace, 3);
    if (expected.rawT !== undefined) expect(actual.rawT).toBeCloseTo(expected.rawT, 3);
    if (expected.rawD !== undefined) expect(actual.rawD).toBeCloseTo(expected.rawD, 3);
}

function assertSplit(actual: Split, expected: Partial<Split>) {
    if (expected.time     !== undefined) expect(actual.time    ).toBeCloseTo(expected.time,     3);
    if (expected.distance !== undefined) expect(actual.distance).toBe(expected.distance);
    if (expected.pace     !== undefined) expect(actual.pace    ).toBeCloseTo(expected.pace,     3);
}
```

Each fixture drives one `describe` block with `it` cases for `mapResult`,
`mapStrokes`, and `mapSplits` as applicable:

```
describe('golden: rower-steady') → mapResult sport/time/pace/distance
                                 → mapStrokes first stroke, last stroke
                                 → mapSplits first split time/distance/pace

describe('golden: bike-steady')  → mapResult sport
                                 → mapStrokes paceDiv=2 on first stroke, last stroke

describe('golden: ski-steady')   → mapResult sport
                                 → mapStrokes paceDiv=1 on first stroke, last stroke

describe('golden: rower-interval') → mapStrokes rep1 last t/d, rep2 first t/d (offset)
                                   → mapStrokes rawT/rawD on boundary strokes
                                   → mapSplits first and second split
```

## Assertion strategy

**`mapResult` assertions** (Req 1.1–1.3, 2.1–2.2):
```ts
const result = mapResult(fixture.rawResult);
expect(result.sport).toBe(fixture.expected.result.sport);
expect(result.time).toBeCloseTo(fixture.expected.result.time, 3);
expect(result.distance).toBe(fixture.expected.result.distance);
expect(result.pace).toBeCloseTo(fixture.expected.result.pace, 3);
```

**`mapStrokes` assertions** (Req 1.1–1.4, 2.3–2.4):
```ts
const strokes = mapStrokes(fixture.rawStrokes, result.sport);
for (const expected of fixture.expected.strokes) {
    assertStroke(strokes[expected._index], expected);
}
```

Each entry in `expected.strokes` carries a `_index` field (not part of the
`Stroke` type — a fixture-local annotation) identifying which output stroke it
validates. This makes assertions stable if strokes are added to the fixture
without changing existing entries.

**`mapSplits` assertions** (Req 1.6):
```ts
const splits = mapSplits(fixture.rawResult);
for (const expected of fixture.expected.splits) {
    assertSplit(splits[expected._index], expected);
}
```

Same `_index` pattern as strokes.

**Interval offset assertion** (Req 2.3):
```ts
// Rep 2 first stroke: t = rawT + tOffset where tOffset = rep1 final t.
const rep2First = strokes[fixture.expected._rep2FirstIndex];
expect(rep2First.rawT).toBeCloseTo(0.0, 3);           // wire resets to 0
expect(rep2First.rawD).toBeCloseTo(0.0, 3);           // wire resets to 0
expect(rep2First.t).toBeCloseTo(fixture.expected._rep1FinalT, 3); // offset applied
expect(rep2First.d).toBeCloseTo(fixture.expected._rep1FinalD, 3); // offset applied
```

The `_`-prefixed fields are fixture-level annotations (not part of `Stroke`)
read directly from the fixture JSON.

## Keeping fixtures in sync when the payload shape changes

When a new field is added to `RawResult` or `RawStroke`:

1. Add the field to the relevant `.fixture.json` files where it is meaningful
   (following the redaction rules in `REDACTION.md`).
2. Add a corresponding `expected.result.<field>` entry with the hand-verified
   normalized value.
3. Add an `it` assertion in `concept2.golden.test.ts` for the new field.

When `mapStrokes` or `mapResult` changes a conversion factor:

1. Recompute the affected expected values independently (do not copy from the
   function output).
2. Update `expected` in the fixture JSON.
3. `npm run test` must pass.

When a fixture needs to be replaced (e.g. the original source data is lost and
a fresh capture is taken):

1. Apply the redaction policy in `REDACTION.md`.
2. Hand-verify all expected values before committing.
3. Open a PR noting that the fixture was replaced (so reviewers know to
   scrutinize the expected values).

## Relationship to existing tests

The existing `concept2.test.ts` tests cover edge cases (absent fields,
round-trip helpers, HR object mapping). The golden-file tests complement them
by anchoring the conversions to external ground truth — realistic fixture data
with values that were never produced by running `concept2.ts` itself (Req 2.1).

The `tests/unit/fixtures.ts` helper (`normalizeRawStrokes`) duplicates part of
`mapStrokes` for use in engine/inspector tests. The golden tests do NOT use that
helper; they call `mapStrokes` directly, which is the point.

## Soft dependency on PR #61 (full-fidelity-data)

The core four fixture cases and all assertions in Req 1–4 stand entirely on the
current `concept2.ts` contract. PR #61 extended `mapResult`/`mapSplits` to
capture HR detail objects, `metadata`, `restTime`, `targets`, etc.

The fixture JSON schema accommodates these fields already (they are optional
keys in `rawResult`). To activate a full-fidelity assertion, a contributor:

1. Adds the relevant keys to the `rawResult` block of an existing fixture (or
   creates a new fixture).
2. Adds the corresponding `expected.result` entry.
3. Adds an `it` assertion in the test file.

No structural change to the test file or fixture schema is required. This is
the "extensible without restructure" guarantee from Req 5.3.

## Out of scope

- Testing `synthStrokes` (the split-synthesis fallback when no stroke data is
  available) — this is a deterministic internal function with no API inputs.
- Testing `mapHeartRate`, `mapTargets`, `mapMetadata` in isolation — these are
  already covered by the existing `concept2.test.ts`. Golden files exercise
  them end-to-end via `mapResult`.
- E2E or integration tests — this is testing infrastructure, not a user-facing
  feature. No Playwright spec is needed.
- i18n — no user-visible strings.
