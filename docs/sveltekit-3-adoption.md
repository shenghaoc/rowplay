# SvelteKit 3 adoption decisions

These followups use Kit 3.0.1, adapter-cloudflare 8.0.0 and Wrangler 4.148.0.
Dependencies, release-age safeguards and the Workers deployment target stay unchanged.

## Update detection and the installed PWA

Kit's reactive `updated.current` now gates the single update prompt. A waiting
service worker and an existing controller are also required; choosing Reload
sends `SKIP_WAITING`, and only the subsequent controller change reloads the page.

The installed Kit implementation checks version metadata but never calls
`ServiceWorkerRegistration.update()`. It also stops interval polling once a new
version is detected. Rowplay therefore retains one hourly backstop that checks
Kit metadata and fetches/retries the service worker, including after an offline
failure. `version.pollInterval` remains zero to avoid a second timer. Kit's native
focus/visibility checks still detect versions. Removing the custom hourly check
is deliberately skipped because native Kit polling does not replace its SW work.

## Generated Worker types: deferred after a compiler probe

Two candidates were generated from the existing `wrangler.jsonc`, with no secret
files or production access:

- Default `wrangler types --strict-vars=false` declares Worker-only globals.
  A DOM compiler probe's negative `ExecutionContext` assertion became unused,
  proving the global was exposed even with the app's `skipLibCheck` setting.
  The generated Env also lacks `SESSION_SECRET`, `CONCEPT2_CLIENT_SECRET` and
  optional `ERGDATA_WEBHOOK_SECRET`, which are not config vars.
- `--include-runtime=false --strict-vars=false` avoids runtime globals but leaves
  the asset binding's `Fetcher` unresolved and does not declare the native
  `cloudflare:workers` module. It cannot replace both scoped declarations.

Adoption is skipped: neither generated candidate is a safe complete replacement.
The existing module-imported Fetcher, handmade `Cloudflare.Env` and env-only
`cloudflare:workers` declaration remain. Compiler regressions reject global
`ExecutionContext`/`R2Bucket` leakage and preserve DOM Request/native JSON types;
unit tests exercise browser-compatible request/response behavior. No generated
runtime declarations or fake secret config are committed.

## Parsed workout IDs without new HTTP rejection

`src/params.ts` uses `defineParams` to perform the existing Number coercion for
workout detail, TCX export and replay routes. Route URLs do not change; registered
route IDs and typed link arguments use `[id=workoutId]` and numbers.

Installed Kit source accepts any number result, including NaN. A matcher that
returns undefined/issues instead fails routing and produces 404, so strict
matcher rejection is deliberately skipped. Malformed detail/export IDs still
reach their existing 400 `Invalid workout id.` checks; export still rejects
zero/negative/fractional IDs, while detail/replay retain their existing lookup
404s. Hexadecimal, exponent, whitespace and leading-zero coercion remain valid.
The retired tag endpoint remains 410 for every ID. Authentication, personal
cache headers and best-effort replay candidates remain in the same order.
