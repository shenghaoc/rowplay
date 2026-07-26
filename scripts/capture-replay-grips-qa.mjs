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
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { chromium } from "@playwright/test";

const VIEWPORT = { width: 1440, height: 1024 };

const SPORTS = {
  row: { id: "1001", label: "row" },
  ski: { id: "1003", label: "ski" },
  bike: { id: "1004", label: "bike" },
};

/** Scrub positions (workout seconds) for the named technique phases. */
const PHASES = {
  row: [
    { name: "catch", seconds: 0.05 },
    { name: "mid-drive", seconds: 0.55 },
    { name: "finish-draw", seconds: 0.8 },
    { name: "extraction", seconds: 0.95 },
    { name: "recovery", seconds: 1.5 },
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

const evidence = [];

function qaUrl({ sport, camera, skeleton }) {
  const url = new URL(`/replay/${sport.id}`, `${baseUrl}/`);
  url.searchParams.set("qa", "athlete-visual");
  url.searchParams.set("athleteCamera", camera);
  if (skeleton) url.searchParams.set("athleteSkeleton", "1");
  return url.toString();
}

async function openReplay({ sport, seconds, camera, skeleton, video }) {
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

  await page.goto(qaUrl({ sport, camera, skeleton }), {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true");
  const toggle = page.getByRole("button", { name: "3D", exact: true });
  await toggle.waitFor({ state: "visible" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  const stage = page.locator(".canvas3d-host:not(.hidden) canvas");
  await stage.waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".backend-label").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(
    () =>
      document
        .querySelector(".canvas3d-host:not(.hidden) canvas")
        ?.getAttribute("data-replay-v4-athlete") === "ready",
    undefined,
    { timeout: 30_000 },
  );
  const effectiveQaCamera = await stage.getAttribute("data-replay-qa-camera");

  const scrub = page.locator("input.scrub");
  await scrub.evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, seconds);
  await page.waitForTimeout(700);
  await stage.scrollIntoViewIfNeeded();
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

async function captureStill({ sport, phase, camera, skeleton = false }) {
  const name = `${sport.label}-${phase.name}-${camera}${skeleton ? "-skeleton" : ""}`;
  console.log(`[capture] still ${name}`);
  const opened = await openReplay({ sport, seconds: phase.seconds, camera, skeleton });
  const file = `poses/${name}.jpg`;
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
  } finally {
    await opened.context.close();
    await opened.browser.close();
  }
}

async function captureCycle(sport, camera, durationMs = 4_500) {
  const name = `${sport.label}-cycle-${camera}`;
  console.log(`[capture] cycle ${name}`);
  const opened = await openReplay({ sport, seconds: 0.05, camera, video: true });
  const file = `cycles/${name}.webm`;
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
    requestedQuality: "ultra",
    effectiveQuality: opened.effectiveQuality,
    backend: opened.backend,
    theme: "dark",
    viewport: VIEWPORT,
  });
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
console.log(`[capture] ${baseUrl} serves ${appBundle} at commit ${commit}`);

for (const key of onlySports) {
  const sport = SPORTS[key];
  if (!sport) continue;
  for (const phase of PHASES[key]) {
    for (const camera of cameras) {
      await captureStill({ sport, phase, camera });
    }
  }
  // One skeleton overlay at the most technique-critical phase per sport.
  const overlayPhase = PHASES[key][Math.min(2, PHASES[key].length - 1)];
  await captureStill({ sport, phase: overlayPhase, camera: "close", skeleton: true });
  if (captureCycles) {
    await captureCycle(sport, "normal");
    if (cameras.includes("grip")) await captureCycle(sport, "grip");
    if (cameras.includes("grip-left")) await captureCycle(sport, "grip-left");
  }
}

let existing = [];
try {
  const parsed = JSON.parse(await readFile(resolve(outputDir, "manifest.json"), "utf8"));
  if (parsed.commit === commit && Array.isArray(parsed.evidence)) existing = parsed.evidence;
} catch {
  // First run for this output directory.
}
await writeFile(
  resolve(outputDir, "manifest.json"),
  `${JSON.stringify({ commit, baseUrl, appBundle, capturedAt: new Date().toISOString(), evidence: [...existing, ...evidence] }, null, 2)}\n`,
);
console.log(`[capture] wrote ${evidence.length} new evidence entries to ${outputDir}`);
