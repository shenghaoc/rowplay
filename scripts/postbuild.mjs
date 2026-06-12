// Post-build hardening for the Cloudflare *Workers* target.
//
// @sveltejs/adapter-cloudflare already writes an `.assetsignore` that keeps the
// Workers asset server from serving `_worker.js`, `_routes.json`, `_headers`
// and `_redirects`. It does NOT exclude the worker's source map, though, so we
// append `_worker.js.map` (the server bundle's sourcemap) to the existing file
// rather than replacing it.
import { readFile, writeFile } from "node:fs/promises";

const FILE = ".svelte-kit/cloudflare/.assetsignore";
const EXTRA = ["_worker.js.map"];

let current = "";
try {
  current = await readFile(FILE, "utf8");
} catch {
  // Adapter didn't write one (older version) — start from the full set.
  current = ["_worker.js", "_routes.json", "_headers", "_redirects"].join("\n") + "\n";
}

const lines = new Set(
  current
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean),
);
const added = EXTRA.filter((e) => !lines.has(e));
for (const e of added) lines.add(e);

await writeFile(FILE, [...lines].join("\n") + "\n");
console.log(
  `postbuild: .assetsignore has ${lines.size} entries (added: ${added.join(", ") || "none"})`,
);
