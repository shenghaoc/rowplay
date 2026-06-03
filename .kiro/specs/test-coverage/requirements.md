# Test Coverage — Requirements

## 1. Coverage infrastructure

**1.1** — `@vitest/coverage-v8` is installed and `vitest.config.ts` configures
`provider: 'v8'` with `reporter: ['text', 'lcov']` so coverage metrics can be
read in CI and locally.

**1.2** — Coverage is scoped to `src/**/*.ts`, excluding test files
(`*.test.ts`), Svelte reactive files (`*.svelte.ts`), and generated type stubs
(`*.d.ts`, `$types.ts`).

**1.3** — `npm run test` remains the single command that runs all unit tests.
No new scripts are introduced.

## 2. Server data and DB layer

**2.1** — Every exported function in `src/lib/server/db.ts` has at least one
test that exercises the SQL path and one that exercises the not-found / empty
path.

**2.2** — Every exported function in `src/lib/server/data.ts` is tested in demo
mode (mock data) and with authentication guards where applicable.

**2.3** — Session lifecycle functions (`newSessionId`, `readSession`,
`writeSession`, `destroySession`) are tested with a fake KV store.

## 3. Route handlers

**3.1** — Every `+server.ts` route file has a co-located `server.test.ts` that
tests:
  - Demo-mode guard (400) where applicable
  - Authentication guard (401) where applicable
  - Input validation errors (400) for all validated parameters
  - Happy-path response shape (status 200, correct `Content-Type` / body keys)

**3.2** — Every `+page.server.ts` `load()` function is tested for:
  - Auth redirect (303 → `/auth/login`) when `!demo && !user`
  - Happy-path return value shape in demo mode
  - Key data properties are present in the returned object

**3.3** — Route tests do not import real D1/KV/Concept2 API — service layer
dependencies are always mocked with `vi.mock('$lib/server/...')`.

## 4. Svelte reactive classes

**4.1** — `I18n`, `Theme`, and `LiveMode` classes (`.svelte.ts`) each have a
test file that covers:
  - Constructor with non-default initial state
  - State mutation methods (`setLanguage`, `toggle`, `setEnabled`, etc.)
  - Derived/computed properties (`isDark`, `hasWarning`, `polling`)

**4.2** — Tests must not require jsdom or a real DOM. Browser-specific side
effects (`persistLanguage`, `persistTheme`, `document.cookie`) are stubbed.

## 5. Three.js 3D renderer

**5.1** — `CourseRenderer3D` is tested for construction across all three sports
(`rower`, `skierg`, `bike`) and all three quality levels (`low`, `medium`,
`high`).

**5.2** — `resize()`, `render()` (both pre- and post-resize), and `destroy()`
are tested to not throw.

**5.3** — Tests mock only `THREE.WebGLRenderer`; all other Three.js classes run
as real implementations so that geometry/scene logic is exercised.

## 6. Quality gate

**6.1** — `npm run test` passes with zero failures and zero unhandled errors.

**6.2** — Adding new production code follows the co-location convention: test
file next to the source file, same directory.
