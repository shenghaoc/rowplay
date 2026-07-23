import { mkdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { chromium } from "@playwright/test";

const VIEWPORTS = {
  desktop: { width: 1440, height: 1024 },
  mobile: { width: 390, height: 844 },
};

const SPORTS = {
  row: { id: "1001", label: "row" },
  ski: { id: "1003", label: "ski" },
  bike: { id: "1004", label: "bike" },
};

const POSES = [
  { name: "row-catch", sport: SPORTS.row, seconds: 0.05 },
  { name: "row-finish", sport: SPORTS.row, seconds: 0.8 },
  { name: "ski-high-reach", sport: SPORTS.ski, seconds: 0.05 },
  { name: "ski-loaded-press", sport: SPORTS.ski, seconds: 0.5 },
  { name: "bike-pedal-top", sport: SPORTS.bike, seconds: 0.05 },
  { name: "bike-pedal-bottom", sport: SPORTS.bike, seconds: 0.72 },
];

function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const baseUrl = option("base-url", "http://127.0.0.1:5173").replace(/\/$/, "");
const outputDir = resolve(option("output", "docs/visual-qa/athlete-v5/in-app/current"));
const only = new Set(
  option("only", "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);
const commit = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();

await mkdir(outputDir, { recursive: true });
await mkdir(resolve(outputDir, "poses"), { recursive: true });
await mkdir(resolve(outputDir, "tiers"), { recursive: true });
await mkdir(resolve(outputDir, "cycles"), { recursive: true });

const evidence = [];

function shouldCapture(name) {
  return only.size === 0 || only.has(name);
}

function qaUrl({ sport, camera, skeleton, ghostPace }) {
  const url = new URL(`/replay/${sport.id}`, `${baseUrl}/`);
  url.searchParams.set("qa", "athlete-visual");
  url.searchParams.set("athleteCamera", camera);
  if (skeleton) url.searchParams.set("athleteSkeleton", "1");
  if (ghostPace) url.searchParams.set("ghostPace", ghostPace);
  return url.toString();
}

async function openReplay({
  sport,
  seconds,
  quality,
  theme,
  viewport,
  camera,
  skeleton,
  ghostPace,
  video,
}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: 1,
    isMobile: viewport === "mobile",
    hasTouch: viewport === "mobile",
    colorScheme: theme,
    recordVideo: video
      ? {
          dir: resolve(outputDir, "cycles", ".recordings"),
          size: { width: VIEWPORTS[viewport].width, height: VIEWPORTS[viewport].height },
        }
      : undefined,
  });
  await context.addCookies([{ name: "theme", value: theme, url: baseUrl }]);
  await context.addInitScript(
    ({ rendererPreference, qualityPreference }) => {
      localStorage.setItem("replay_renderer", rendererPreference);
      localStorage.setItem("replay_quality", qualityPreference);
    },
    { rendererPreference: "3d", qualityPreference: quality },
  );

  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") warnings.push(message.text());
  });

  await page.goto(qaUrl({ sport, camera, skeleton, ghostPace }), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true");
  const toggle = page.getByRole("button", { name: "3D", exact: true });
  await toggle.waitFor({ state: "visible" });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") await toggle.click();
  const stage = page.locator(".canvas3d-host:not(.hidden) canvas");
  await stage.waitFor({ state: "visible", timeout: 30_000 });
  await page.locator(".backend-label").waitFor({ state: "visible", timeout: 30_000 });
  const expectedQaCamera = camera === "close" ? "athlete-close" : "normal";
  const effectiveQaCamera = await stage.getAttribute("data-replay-qa-camera");
  if (effectiveQaCamera !== expectedQaCamera) {
    throw new Error(
      `${sport.label}: expected QA camera ${expectedQaCamera}, got ${effectiveQaCamera}`,
    );
  }

  const scrub = page.locator("input.scrub");
  await scrub.evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, seconds);
  await page.waitForTimeout(800);
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);

  if (errors.length) throw new Error(`${sport.label}: browser errors: ${errors.join(" | ")}`);
  const box = await stage.boundingBox();
  if (!box) throw new Error(`${sport.label}: 3D stage has no bounding box`);
  return {
    browser,
    context,
    page,
    canvas: stage,
    requestedQuality: quality,
    effectiveQuality: await page.locator(".quality-select select").inputValue(),
    effectiveQaCamera,
    backend: (await page.locator(".backend-label").innerText()).trim(),
    warnings,
    stage: { width: Math.round(box.width), height: Math.round(box.height) },
  };
}

async function captureStill({
  name,
  sport,
  seconds,
  quality = "ultra",
  theme = "dark",
  viewport = "desktop",
  camera = "normal",
  skeleton = false,
  ghostPace,
}) {
  console.log(`[capture] still ${name}`);
  const opened = await openReplay({
    sport,
    seconds,
    quality,
    theme,
    viewport,
    camera,
    skeleton,
    ghostPace,
  });
  const directory = name.startsWith("tier-") ? "tiers" : "poses";
  const file = `${directory}/${name}.jpg`;
  try {
    await opened.canvas.screenshot({ path: resolve(outputDir, file), type: "jpeg", quality: 92 });
    evidence.push({
      kind: "still",
      file,
      sport: sport.label,
      seconds,
      requestedQuality: opened.requestedQuality,
      effectiveQuality: opened.effectiveQuality,
      backend: opened.backend,
      theme,
      viewport: VIEWPORTS[viewport],
      camera,
      effectiveQaCamera: opened.effectiveQaCamera,
      skeleton,
      ghostPace: ghostPace ?? null,
      stage: opened.stage,
      warnings: opened.warnings,
    });
  } finally {
    await opened.context.close();
    await opened.browser.close();
  }
}

async function captureCycle(sport) {
  console.log(`[capture] cycle ${sport.label}-one-cycle`);
  const opened = await openReplay({
    sport,
    seconds: 0.05,
    quality: "ultra",
    theme: "dark",
    viewport: "desktop",
    camera: "normal",
    skeleton: false,
    video: true,
  });
  const file = `cycles/${sport.label}-one-cycle.webm`;
  const video = opened.page.video();
  try {
    await opened.page.getByRole("button", { name: "Play", exact: true }).click();
    await opened.page.waitForTimeout(4_000);
    await opened.page.getByRole("button", { name: "Pause", exact: true }).click();
  } finally {
    await opened.context.close();
    await opened.browser.close();
  }
  if (!video) throw new Error(`${sport.label}: Playwright did not create a cycle recording`);
  await rename(await video.path(), resolve(outputDir, file));
  evidence.push({
    kind: "cycle",
    file,
    sport: sport.label,
    requestedQuality: opened.requestedQuality,
    effectiveQuality: opened.effectiveQuality,
    backend: opened.backend,
    theme: "dark",
    viewport: VIEWPORTS.desktop,
    durationMs: 4_000,
    warnings: opened.warnings,
  });
}

for (const pose of POSES) {
  if (shouldCapture(pose.name)) await captureStill({ ...pose, name: pose.name, camera: "close" });
  if (shouldCapture(`${pose.name}-skeleton`)) {
    await captureStill({
      ...pose,
      name: `${pose.name}-skeleton`,
      camera: "close",
      skeleton: true,
    });
  }
}

for (const quality of ["low", "medium", "high", "ultra"]) {
  const name = `tier-row-finish-${quality}`;
  if (shouldCapture(name)) {
    await captureStill({
      name,
      sport: SPORTS.row,
      seconds: 0.8,
      quality,
      theme: "light",
      viewport: "desktop",
      camera: "close",
    });
  }
}

if (shouldCapture("ghost-ski-loaded-press")) {
  await captureStill({
    name: "ghost-ski-loaded-press",
    sport: SPORTS.ski,
    seconds: 0.5,
    quality: "ultra",
    theme: "dark",
    viewport: "desktop",
    camera: "normal",
    ghostPace: "2:00",
  });
}
if (shouldCapture("mobile-row-finish")) {
  await captureStill({
    name: "mobile-row-finish",
    sport: SPORTS.row,
    seconds: 0.8,
    quality: "ultra",
    theme: "light",
    viewport: "mobile",
    camera: "normal",
  });
}

for (const sport of Object.values(SPORTS)) {
  if (shouldCapture(`${sport.label}-one-cycle`)) await captureCycle(sport);
}

await writeFile(
  resolve(outputDir, "manifest.json"),
  `${JSON.stringify(
    {
      commit,
      source: baseUrl,
      command: `node scripts/capture-replay-athlete-v5-qa.mjs --base-url=${baseUrl}`,
      note: "Real RowPlay 3D application capture. Requested Ultra may report High when the browser backend is WebGL; the manifest records the effective tier and backend for every file.",
      evidence,
    },
    null,
    2,
  )}\n`,
);

console.log(`Captured ${evidence.length} real in-app athlete QA artifacts in ${outputDir}`);
