/**
 * Grip / upper-limb visual-QA matrix for the anatomical grip constraints work.
 *
 * Captures the real application (Workers-faithful preview or dev server) from
 * the query-gated QA cameras: chase, athlete front, athlete rear, top-down
 * arm-path, both palm close-ups, plus skeleton overlays and full-cycle
 * recordings. Writes a manifest recording commit, backend, requested and
 * effective quality, viewport, and camera per frame.
 *
 * Usage:
 *   node scripts/capture-replay-grips-qa.mjs --base-url=http://127.0.0.1:8787 \
 *     --output=docs/visual-qa/grips-and-elbows/after [--cameras=grip,front] \
 *     [--only=row,ski] [--no-cycles] [--headed]
 *
 * The `before` matrix from a main-branch build predates the rear/top/grip-left
 * cameras; pass --cameras=normal,front,close,grip there.
 */
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { chromium } from "@playwright/test";

const VIEWPORT = { width: 1440, height: 1024 };

const SPORTS = {
  row: { id: "1001", label: "row" },
  ski: { id: "1003", label: "ski" },
  bike: { id: "1004", label: "bike" },
};

/**
 * Scrub positions (workout seconds) for the named technique phases. The
 * rowing list walks one full demo stroke (~2.1 s at the workout's natural
 * cadence) through all fifteen arm-draw rework landmarks: the drive's leg /
 * body / arm staging, the 0.64-window draw sub-phases, and the hands-away →
 * body-over → slide recovery order.
 */
const PHASES = {
  row: [
    { name: "catch", seconds: 0.03 },
    { name: "leg-drive-early", seconds: 0.15 },
    { name: "leg-drive-mid", seconds: 0.3 },
    { name: "legs-flat", seconds: 0.45 },
    { name: "body-opening", seconds: 0.52 },
    { name: "draw-onset", seconds: 0.56 },
    { name: "draw-early", seconds: 0.61 },
    { name: "draw-mid", seconds: 0.66 },
    { name: "draw-late", seconds: 0.72 },
    { name: "finish", seconds: 0.78 },
    { name: "release", seconds: 0.88 },
    { name: "hands-away", seconds: 1.05 },
    { name: "body-over", seconds: 1.35 },
    { name: "slide-return", seconds: 1.65 },
    { name: "late-recovery", seconds: 1.95 },
  ],
  ski: [
    { name: "reach", seconds: 0.05 },
    { name: "plant", seconds: 0.3 },
    { name: "loaded-pull", seconds: 0.55 },
    { name: "release", seconds: 0.85 },
    { name: "recovery", seconds: 1.4 },
  ],
  bike: [
    { name: "left-top", seconds: 0.05 },
    { name: "left-power", seconds: 0.2 },
    { name: "opposed", seconds: 0.37 },
    { name: "right-power", seconds: 0.55 },
  ],
};

function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const baseUrl = option("base-url", "http://127.0.0.1:8787").replace(/\/$/, "");
const outputDir = resolve(option("output", "docs/visual-qa/grips-and-elbows/after"));
const cameras = option("cameras", "normal,front,rear,top,close,grip,grip-left")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const onlySports = option("only", "row,ski,bike")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const captureCycles = !process.argv.includes("--no-cycles");
const headed = process.argv.includes("--headed");
const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();

await mkdir(resolve(outputDir, "poses"), { recursive: true });
await mkdir(resolve(outputDir, "cycles"), { recursive: true });

const manifestPath = resolve(outputDir, "manifest.json");
let evidence = [];
try {
  const parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  if (parsed.commit === commit && Array.isArray(parsed.evidence)) evidence = parsed.evidence;
} catch {
  // First run for this output directory.
}
let appBundleForManifest = "unknown";

/**
 * Rewrite the manifest after every capture: a crashed run then leaves a
 * valid manifest of everything captured so far, and skip-on-resume keys on
 * file + entry so nothing is ever silently unrecorded.
 */
async function flushManifest() {
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        commit,
        baseUrl,
        appBundle: appBundleForManifest,
        capturedAt: new Date().toISOString(),
        evidence,
      },
      null,
      2,
    )}\n`,
  );
}

function hasEvidence(file) {
  return evidence.some((entry) => entry.file === file);
}

function qaUrl({ sport, camera, skeleton, rate, diagnostics }) {
  const url = new URL(`/replay/${sport.id}`, `${baseUrl}/`);
  url.searchParams.set("qa", "athlete-visual");
  url.searchParams.set("athleteCamera", camera);
  if (skeleton) url.searchParams.set("athleteSkeleton", "1");
  if (rate && rate !== 1) url.searchParams.set("qaPlaybackRate", String(rate));
  if (diagnostics) url.searchParams.set("athleteArmDiag", "1");
  return url.toString();
}

async function openReplay({ sport, seconds, camera, skeleton, video, rate, diagnostics }) {
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "dark",
    recordVideo: video
      ? { dir: resolve(outputDir, "cycles", ".recordings"), size: VIEWPORT }
      : undefined,
  });
  await context.addCookies([{ name: "theme", value: "dark", url: baseUrl }]);
  await context.addInitScript(() => {
    localStorage.setItem("replay_renderer", "3d");
    localStorage.setItem("replay_quality", "ultra");
  });
  const page = await context.newPage();
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 204, body: "" }),
  );
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto(qaUrl({ sport, camera, skeleton, rate, diagnostics }), {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true");
  const toggle = page.getByRole("button", { name: "3D", exact: true });
  await toggle.waitFor({ state: "visible" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  const stage = page.locator(".canvas3d-host:not(.hidden) canvas");
  // Fresh Chromium per capture: allow 3D init headroom under load — the 30 s
  // wait intermittently lost on a busy host across ~80 launches.
  await stage.waitFor({ state: "visible", timeout: 90_000 });
  await page.locator(".backend-label").waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".canvas3d-host:not(.hidden) canvas")
        ?.getAttribute("data-replay-v4-athlete") === "ready",
    undefined,
    { timeout: 90_000 },
  );
  const effectiveQaCamera = await stage.getAttribute("data-replay-qa-camera");

  const scrub = page.locator("input.scrub");
  await scrub.evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, seconds);
  await page.waitForTimeout(700);
  await stage.scrollIntoViewIfNeeded({ timeout: 90_000 });
  await page.waitForTimeout(120);
  if (errors.length) throw new Error(`${sport.label}: browser errors: ${errors.join(" | ")}`);
  return {
    browser,
    context,
    page,
    canvas: stage,
    effectiveQaCamera,
    effectiveQuality: await page.locator(".quality-select select").inputValue(),
    backend: (await page.locator(".backend-label").innerText()).trim(),
  };
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** One retry per capture: a cold 3D init on a loaded host is a flake, twice is a failure. */
async function withRetry(name, run) {
  try {
    await run();
  } catch (error) {
    console.warn(`[capture] retrying ${name} after: ${error.message?.split("\n")[0]}`);
    await run();
  }
}

async function captureStill({ sport, phase, camera, skeleton = false }) {
  const name = `${sport.label}-${phase.name}-${camera}${skeleton ? "-skeleton" : ""}`;
  const file = `poses/${name}.jpg`;
  if ((await fileExists(resolve(outputDir, file))) && hasEvidence(file)) {
    console.log(`[capture] still ${name} exists, skipping`);
    return;
  }
  console.log(`[capture] still ${name}`);
  const opened = await openReplay({ sport, seconds: phase.seconds, camera, skeleton });
  try {
    await opened.canvas.screenshot({ path: resolve(outputDir, file), type: "jpeg", quality: 92 });
    evidence.push({
      kind: "still",
      file,
      sport: sport.label,
      phase: phase.name,
      seconds: phase.seconds,
      camera,
      effectiveQaCamera: opened.effectiveQaCamera,
      skeleton,
      requestedQuality: "ultra",
      effectiveQuality: opened.effectiveQuality,
      backend: opened.backend,
      theme: "dark",
      viewport: VIEWPORT,
    });
    await flushManifest();
  } finally {
    await opened.context.close();
    await opened.browser.close();
  }
}

async function captureCycle(
  sport,
  camera,
  durationMs = 4_500,
  { rate = 1, diagnostics = false } = {},
) {
  const suffix = `${rate !== 1 ? `-rate${rate}` : ""}${diagnostics ? "-diag" : ""}${
    durationMs !== 4_500 ? `-${Math.round(durationMs / 1000)}s` : ""
  }`;
  const name = `${sport.label}-cycle-${camera}${suffix}`;
  const file = `cycles/${name}.webm`;
  if ((await fileExists(resolve(outputDir, file))) && hasEvidence(file)) {
    console.log(`[capture] cycle ${name} exists, skipping`);
    return;
  }
  console.log(`[capture] cycle ${name}`);
  const opened = await openReplay({ sport, seconds: 0.05, camera, video: true, rate, diagnostics });
  const video = opened.page.video();
  try {
    await opened.page.getByRole("button", { name: "Play", exact: true }).click();
    await opened.page.waitForTimeout(durationMs);
    await opened.page.getByRole("button", { name: "Pause", exact: true }).click();
  } finally {
    await opened.context.close();
    await opened.browser.close();
  }
  if (!video) throw new Error(`${name}: Playwright did not create a recording`);
  await rename(await video.path(), resolve(outputDir, file));
  evidence.push({
    kind: "cycle",
    file,
    sport: sport.label,
    camera,
    durationMs,
    playbackRate: rate,
    armDiagnostics: diagnostics,
    requestedQuality: "ultra",
    effectiveQuality: opened.effectiveQuality,
    backend: opened.backend,
    theme: "dark",
    viewport: VIEWPORT,
  });
  await flushManifest();
}

async function buildIdentity() {
  // Guard against the preview-port race across sibling worktrees: record the
  // exact bundle the captured page actually served.
  const response = await fetch(`${baseUrl}/replay/1001`);
  const body = await response.text();
  const match = body.match(/\/_app\/immutable\/entry\/app\.[^"]+\.js/);
  return match?.[0] ?? "unknown";
}

const appBundle = await buildIdentity();
appBundleForManifest = appBundle;
console.log(`[capture] ${baseUrl} serves ${appBundle} at commit ${commit}`);

for (const key of onlySports) {
  const sport = SPORTS[key];
  if (!sport) continue;
  for (const phase of PHASES[key]) {
    for (const camera of cameras) {
      await withRetry(`${phase.name}-${camera}`, () => captureStill({ sport, phase, camera }));
    }
  }
  // One skeleton overlay at the most technique-critical phase per sport.
  const overlayPhase = PHASES[key][Math.min(2, PHASES[key].length - 1)];
  await withRetry(`${overlayPhase.name}-close-skeleton`, () =>
    captureStill({ sport, phase: overlayPhase, camera: "close", skeleton: true }),
  );
  if (key === "row") {
    // Skeleton evidence across the retimed draw itself.
    for (const phaseName of ["draw-onset", "draw-mid", "finish"]) {
      const phase = PHASES.row.find((entry) => entry.name === phaseName);
      if (phase)
        await withRetry(`${phase.name}-skeleton`, () =>
          captureStill({ sport, phase, camera: "normal", skeleton: true }),
        );
    }
  }
  if (captureCycles) {
    await withRetry("cycle-normal", () => captureCycle(sport, "normal"));
    if (cameras.includes("grip")) await withRetry("cycle-grip", () => captureCycle(sport, "grip"));
    if (cameras.includes("grip-left"))
      await withRetry("cycle-grip-left", () => captureCycle(sport, "grip-left"));
    if (key === "row") {
      // ≥6 consecutive cycles at the demo workout's natural cadence, then the
      // capture-only slow-motion passes and the numeric diagnostics overlay.
      // The exact 24/28/32/36 spm sweep is owned by the 512-phase renderer
      // acceptance test; these recordings verify the same motion in the real
      // application at watchable and frame-by-frame speeds.
      await withRetry("cycle-14s", () => captureCycle(sport, "normal", 14_000));
      await withRetry("cycle-0.5x", () => captureCycle(sport, "normal", 14_000, { rate: 0.5 }));
      await withRetry("cycle-0.25x", () => captureCycle(sport, "normal", 14_000, { rate: 0.25 }));
      await withRetry("cycle-diag", () =>
        captureCycle(sport, "normal", 9_000, { diagnostics: true }),
      );
      await withRetry("cycle-rear", () => captureCycle(sport, "rear", 9_000));
    }
  }
}

await flushManifest();
console.log(`[capture] manifest records ${evidence.length} evidence entries in ${outputDir}`);
