# Test Coverage — Design

## Overview

Systematic expansion of the Vitest test suite from ~190 tests (pure-function
only) to 692 tests covering the full production surface: pure utilities, server
data/DB layer, route handlers, page load functions, Svelte reactive state
classes, and the Three.js 3D renderer.

Coverage infrastructure was also added: `@vitest/coverage-v8` with `text` +
`lcov` reporters, scoped to `src/**/*.ts`, excluding test files and generated
types.

## Scope

### Layer 1 — Pure library functions (pre-existing + new)

`analytics.ts`, `format.ts`, `datetime.ts`, `goals.ts`, `workoutQuery.ts`,
`i18nPlural.ts`, `i18n.ts`, `liveMode.ts` (non-reactive helpers), `mockData.ts`,
`replay/sports.ts`, `replay/engine.ts`, `replay/ghostPick.ts`,
`server/export.ts`, `server/share.ts` (token/meta), `server/config.ts`,
`server/concept2.ts` (mapStrokes, URL helpers).

These have no runtime dependencies — tested directly with minimal or no mocking.

### Layer 2 — Server data and DB layer

`server/db.ts` (all D1 CRUD: workouts, strokes, sync state, goals, annotations,
share tokens, leaderboard entries), `server/data.ts` (loadWorkouts,
loadWorkoutDetail, loadDashboardAggregates, loadAnnualGoal, saveAnnualGoal,
syncStatus, annotations), `server/session.ts` (KV-backed session lifecycle),
`server/leaderboard.ts` (publishWorkout, withdrawWorkout), `server/hrImport.ts`
(saveHrImport, clearHrImport), `server/rivalGhost.ts` (GHOST_TRACE_CACHE,
loadRivalGhostTrace).

**Fake D1 pattern:**
```ts
function fakeDb(opts: { firstRow?: unknown; allRows?: unknown[] } = {}) {
  const executed: { sql: string; args: unknown[] }[] = [];
  const make = (sql: string) => {
    let bound: unknown[] = [];
    const stmt = {
      bind: (...args) => { bound = args; return stmt; },
      run: async () => { executed.push({ sql, args: bound }); return { meta: { changes: 1, last_row_id: 99 } }; },
      first: async <T>() => { executed.push({ sql, args: bound }); return (opts.firstRow ?? null) as T; },
      all: async <T>() => { executed.push({ sql, args: bound }); return { results: (opts.allRows ?? []) as T[] }; }
    };
    return stmt;
  };
  return { executed, db: { prepare: make, batch: async (stmts) => Promise.all(stmts.map(s => s.run())) } };
}
```

**Fake KV pattern:**
```ts
function fakeKv() {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value); },
    delete: async (key: string) => { store.delete(key); }
  };
}
```

### Layer 3 — Route handlers (API + page server)

All 18 `+server.ts` files and 7 `+page.server.ts` files are tested with fake
`RequestEvent` objects. The pattern mirrors the pre-existing logout test:

```ts
// Fake event — only include properties the handler actually reads
function fakeEvent(opts) {
  return {
    locals: { demo: opts.demo, user: opts.user },
    params: { id: opts.id },
    request: { json: async () => opts.body, url: opts.url },
    cookies: { get: () => null, set: vi.fn(), delete: vi.fn() },
    platform: { env: { DB: {}, SESSIONS: {} } }
  };
}

// SvelteKit redirect() / error() throw — catch with rejects.toMatchObject
await expect(handler(event)).rejects.toMatchObject({ status: 303 });
```

Auth guards (demo 400, unauthenticated 401), input validation (invalid IDs 400,
bad JSON 400, schema violations 400), and happy-path responses are tested for
every handler. Handlers that delegate to service functions mock those services
with `vi.mock('$lib/server/...')`.

### Layer 4 — Svelte reactive state classes (`.svelte.ts`)

`I18n`, `Theme`, and `LiveMode` classes use Svelte 5 runes (`$state`,
`$derived`). The `sveltekit()` Vite plugin in `vitest.config.ts` compiles the
rune transforms, so these classes are importable and testable in Node.js without
a DOM.

**Key stubs:**
- `persistLanguage` mocked to avoid `localStorage` writes.
- `document` stub (minimal `{ documentElement: { dataset: {} } }`) for `Theme`.
- `vi.useFakeTimers()` + minimal `document.addEventListener/removeEventListener`
  stub for `LiveMode`.

### Layer 5 — Three.js 3D renderer (`renderer3d.ts`)

`CourseRenderer3D` requires `document.createElement('canvas')` and a WebGL
context. Only `THREE.WebGLRenderer` is mocked — all other Three.js classes
(geometry, materials, scene, groups, sprites) are the real headless Node
implementations:

```ts
vi.mock('three', async (importOriginal) => {
  const THREE = await importOriginal();
  class FakeWebGLRenderer {
    outputColorSpace = '';
    shadowMap = { enabled: false, type: 0 };
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    render = vi.fn();
    getContext = vi.fn().mockReturnValue({ getExtension: vi.fn().mockReturnValue({ loseContext: vi.fn() }) });
    dispose = vi.fn();
  }
  return { ...THREE, WebGLRenderer: FakeWebGLRenderer };
});
```

`document.createElement('canvas')` is stubbed globally with a fake canvas that
returns a minimal 2D context mock (needed by `makeTextSprite` during
construction). `window.matchMedia` is also stubbed for `prefersReducedMotion`.

## What is NOT covered by unit tests

- **Svelte components (`.svelte` files)**: require jsdom or a real browser;
  tested by Playwright E2E (`tests/e2e/`).
- **`liveMode.svelte.ts` poll/fetch loop**: `fetch`, `AudioContext`, and
  tab-visibility wiring require a real browser event model; covered by E2E.
- **`renderer3d.ts` rendering fidelity**: actual WebGL output cannot be verified
  in Node; the unit tests validate construction, state transitions, and
  invocation — not pixel output.
- **`hooks.server.ts`**: SvelteKit hook wiring requires a real SvelteKit request
  cycle; covered by E2E.
