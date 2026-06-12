# Pace-Band Overlay on Replay — Tasks

Implementation plan. Each task is self-contained and testable before the next
begins. Requirement references point at `requirements.md`.

- [ ] **1. Pure pace input helpers** — `src/lib/paceInput.ts`
  - `parsePaceInput(raw: string): number | null` — accepts M:SS / MM:SS /
    bare integers; returns null for empty, non-positive, or unparseable input.
  - `formatPaceInput(seconds: number): string` — inverse of parse; e.g. 112 → "1:52".
  - No DOM, no Svelte, no side effects.
  - _Requirements: 3.1_

- [ ] **2. Unit tests** — `src/lib/paceInput.test.ts`
  - Round-trip: `parsePaceInput(formatPaceInput(n)) === n` for a range of values.
  - Invalid inputs: empty string, `"0:00"`, `"abc"`, negative, `"99:99"`.
  - Bare integer strings treated as seconds.
  - _Requirements: 3.1_

- [ ] **3. URL param wiring** — `src/routes/replay/[id]/+page.svelte`
  - On `onMount`: read `page.url.searchParams.get('targetPace')`, run through
    `parsePaceInput`; if valid, set `targetPaceSecs`; else no-op.
  - Add `let targetPaceSecs = $state<number | null>(null)` and
    `let showBand = $state(false)`.
  - _Requirements: 2.2, 2.3_

- [ ] **4. Target-pace UI control** — `replay/[id]/+page.svelte`
  - Collapsed by default; "Set target pace" expander link.
  - When expanded: `input input-bordered input-sm` for M:SS entry, `toggle
toggle-sm` for band, clear button.
  - On blur or Enter (not keystroke): call `parsePaceInput`; on valid result
    update `targetPaceSecs`; on invalid or empty set to `null`. Bind to
    `onchange` / `onblur` rather than `oninput` to avoid input lag and chart
    flickering from re-initialising the uPlot series on every keystroke.
  - _Requirements: 2.1, 2.4_

- [ ] **5. uPlot horizontal line + optional band** — `replay/[id]/+page.svelte`
  - Pass `targetPaceSecs` and `showBand` into the pace chart initialisation.
  - Constant-value series for the target line (dashed stroke style via uPlot
    series `stroke` / `dash` options).
  - **uPlot `AlignedData` constraint:** all series arrays MUST match the X-axis
    array length. When constructing the target line and band series, pre-fill
    each with `Array(xs.length).fill(value)` so every data array has exactly
    `xs.length` elements.
  - Band: two constant-value series (target ± 5) with `fill` between them using
    low-opacity `--pace` colour.
  - Label: uPlot `hook` or annotation drawn at x = max to show formatted pace.
  - When `targetPaceSecs` is null, series are absent (or set to empty data) so
    there is zero visual change to existing replays.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] **6. i18n keys** — `src/lib/locales/{en,zh,de,es,fr,ja}.ts`
  - Add `replay.targetPace`, `replay.targetPacePlaceholder`, `replay.targetPaceSet`,
    `replay.targetPaceClear`, `replay.targetPaceBand` to all six locale files.
  - Run `pnpm run validate:locales` to confirm parity.
  - _Requirements: 3.2_

- [ ] **7. Quality gate**
  - `pnpm run check` → 0 errors.
  - `pnpm run build` → succeeds.
  - `pnpm run test` → green; test count ≥ previous count.
  - _Requirements: 3.3, 3.4, 3.5_
