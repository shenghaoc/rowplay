# SvelteKit 3 adoption decisions

The initial adoption used Kit 3.0.1, adapter-cloudflare 8.0.0 and Wrangler 4.155.0.
The 24-hour release-age safeguard and the Workers deployment target stay unchanged.

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
The built Worker matrix checks decoded JSON and private cache headers, not
transport byte lengths.

## Central error observability without private request data

Kit 3 sends app, framework, validation and unknown errors to `handleError`.
Rowplay now logs kind, status and the static registered route ID through
`createLogger`: expected errors at warning level, unknown failures at error
level. Returning nothing preserves Kit's original status/message response.
No raw error/message/stack/cause, path/query, headers, cookies, session/locals or
validation input is logged. Static route IDs contain no parsed parameter values.

Per-route logging removal is skipped after inspecting actual catch paths:
dashboard fallback, replay candidate fallback and aggregate fallback recover
errors into successful return values, so those errors never reach the hook.
Tests explicitly retain dashboard/replay recovery output; existing aggregate
failure tests retain null fallback behavior. Removing these logs would lose
coverage. No new remote functions, tracing or shallow routing is introduced.

## Kit 3.4 and Cloudflare adapter 9

The lockfile resolves Kit 3.4.0, adapter 9.0.0, Wrangler 4.166.0, Workers types
5.20261121.1, and Svelte 5.59.1. The Svelte Vite plugin remains at 7.3.1 because
7.3.2 had not cleared 24 hours when the lockfile was resolved.

[Adapter 9](https://github.com/sveltejs/kit/releases/tag/@sveltejs/adapter-cloudflare@9.0.0)
rejects the previous generated Worker path in the source Wrangler config. It
now writes a deployment config with `worker/index.js` as the entry point and
`client/` as the static asset directory under `.svelte-kit/cloudflare`.
Wrangler discovers the generated config through `.wrangler/deploy/config.json`.
Keep the `ASSETS` binding and the default `worker: true`: Rowplay serves SSR and
API routes, not a static-only site. The project uses Workers, not Pages, and
does not set the removed adapter `fallback` option or `paths.assets`.

The Worker and its maps are outside the public client tree. The postbuild
step now appends the existing source-map exclusion to `client/.assetsignore`
without replacing the adapter's exclusions. Replay release capture reads
`_app/version.json` from the same client tree.

[Kit 3.4](https://github.com/sveltejs/kit/releases/tag/@sveltejs/kit@3.4.0)
allows adapters to opt out of the Node preview server with `vite.customPreview`.
Adapter 9 does not opt out. Rowplay's preview tasks still use local Wrangler
for Workers behavior, with or without the preceding build.

The stricter checks of async `load` returns against `App.PageData` apply without casting.
`DocsArticle` still passes the route string `"/"` to `resolve` and uses it
as a prefix; query strings, fragments and replay paths are not passed as URL
objects. Kit skips ETag hashing for `no-store`; Rowplay's `private, no-store`
route responses keep their existing headers.
