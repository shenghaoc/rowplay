# Golden-file Normalization Tests — Tasks

Implementation plan. Each task is committed and pushed on its own. Boxes are
checked as the work lands. Requirement references point at `requirements.md`.

- [ ] **1. Fixture directory scaffold and `REDACTION.md`**
  — `tests/fixtures/golden/REDACTION.md`
  - Create `tests/fixtures/golden/` directory.
  - Write `REDACTION.md` documenting: which fields are removed (`id`, PII names,
    `serial_number`, `device`), which are replaced (`id` → stand-in integer,
    name fields → `"REDACTED"` or absent), the realistic-values rule, the
    policy for adding new fixtures, and a note to add `"fixtureVersion"` once
    the full-fidelity shape stabilizes.
  - _Requirements: 3.1–3.6_

- [ ] **2. RowErg steady fixture** — `tests/fixtures/golden/rower-steady.fixture.json`
  - Construct a realistic 2000 m RowErg result body (`rawResult`) with
    plausible `time` (e.g. 4500 tenths = 7:30), `distance`, 4–8 `rawStrokes`
    with wire-unit `t`/`d`/`p` values, and one split in `workout.splits`.
  - Apply redaction policy (Req 3).
  - Populate `expected.result` (`sport`, `time`, `distance`, `pace`),
    `expected.strokes` (first + last, each with `_index`, `t`, `d`, `pace`),
    and `expected.splits` (split 0: `_index`, `time`, `distance`, `pace`).
  - Hand-verify all expected values from wire units (do NOT run the code first).
  - _Requirements: 1.1, 1.5, 1.6, 2.1, 2.2, 3.1–3.5, 4.1–4.2_

- [ ] **3. BikeErg steady fixture** — `tests/fixtures/golden/bike-steady.fixture.json`
  - Construct a realistic BikeErg 4000 m result body with `type = "bike"`,
    4–8 `rawStrokes` with `p` values in per-1000m tenths (e.g. 2000 tenths =
    200 s/km → 100 s/500m normalized).
  - Apply redaction policy (Req 3).
  - Populate `expected.result` (`sport = 'bike'`, `time`, `distance`, `pace`),
    `expected.strokes` (first + last, each with `_index`, `t`, `d`, `pace`).
  - Explicitly verify in `expected.strokes` that each `pace` is exactly half
    of `rawP / 10` (Req 2.4). `expected.splits = []`.
  - _Requirements: 1.2, 1.5, 2.1, 2.2, 2.4, 3.1–3.5, 4.1–4.2_

- [ ] **4. SkiErg steady fixture** — `tests/fixtures/golden/ski-steady.fixture.json`
  - Construct a realistic SkiErg 6000 m result body with `type = "ski"`,
    4–8 `rawStrokes` with `p` values in per-500m tenths (no halving).
  - Apply redaction policy (Req 3).
  - Populate `expected.result` (`sport = 'ski'`), `expected.strokes` (first
    + last). `expected.splits = []`.
  - _Requirements: 1.3, 1.5, 2.1, 2.2, 3.1–3.5, 4.1–4.2_

- [ ] **5. Interval RowErg fixture** — `tests/fixtures/golden/rower-interval.fixture.json`
  - Construct a 4×500 m RowErg result body where `rawStrokes` contains two
    runs of strokes (minimum 5 per rep) whose `t` and `d` values restart from
    zero at the start of rep 2, matching the real API behaviour.
  - Include `workout.intervals` with at least two split entries.
  - Apply redaction policy (Req 3).
  - Populate `expected.strokes` (rep 1 first, rep 1 last, rep 2 first, rep 2
    last) with `_index`, `t`, `d`, `rawT`, `rawD`, and `pace`.
  - Populate a top-level `_rep2FirstIndex` and `_rep1FinalT`/`_rep1FinalD`
    annotation for the offset assertion in the test file (Req 2.3).
  - Populate `expected.splits` for splits 0 and 1.
  - _Requirements: 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 3.1–3.5, 4.1–4.2_

- [ ] **6. Test file** — `src/lib/server/concept2.golden.test.ts`
  - Import all four fixtures via static JSON imports with `assert { type: 'json' }`.
  - Implement `assertStroke` and `assertSplit` helpers (see design.md).
  - Write one `describe` block per fixture with `it` cases for each
    normalization function exercised.
  - For the bike fixture, add an explicit `it` that asserts
    `strokes[i].pace === rawP / 10 / 2` for the first stroke (Req 2.4).
  - For the interval fixture, add an explicit `it` that asserts the offset
    logic: `rep2First.rawT ≈ 0`, `rep2First.t ≈ rep1FinalT` (Req 2.3).
  - _Requirements: 1.1–1.6, 2.1–2.4, 4.3–4.5, 6.1–6.5_

- [ ] **7. Full quality gate pass**
  - `npm run check` → 0 errors.
  - `npm run build` → succeeds.
  - `npm run test` → all tests green including the new golden suite, in under
    500 ms for the new tests.
  - Confirm no new TypeScript errors from fixture import types.
  - _Requirements: 6.1–6.5_
