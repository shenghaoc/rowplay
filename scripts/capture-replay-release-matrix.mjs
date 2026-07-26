import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { chromium } from "@playwright/test";

const SPORTS = [
  { slug: "row", id: "1001", seekSeconds: 4.2 },
  { slug: "bike", id: "1004", seekSeconds: 2.6 },
  { slug: "ski", id: "1003", seekSeconds: 3.25 },
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 1024 },
  mobile: { width: 390, height: 844 },
};

function option(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const baseUrl = option("base-url", "http://127.0.0.1:5173").replace(/\/$/, "");
/**
 * `release-gate` (default) keeps the original per-sport gate frames.
 * `environment` sweeps the premium-environments Requirement 6.2 matrix:
 * every sport in 2D and 3D, paused and moving, light and dark, at Low and
 * Ultra, plus a ghost comparison.
 */
const matrix = option("matrix", "release-gate");
const outputDir = resolve(
  option(
    "output",
    matrix === "environment"
      ? "docs/visual-qa/premium-environments/current"
      : "docs/visual-qa/higher-ceiling/release-gate",
  ),
);

await mkdir(outputDir, { recursive: true });

/**
 * Playwright's bundled Chromium exposes `navigator.gpu` but resolves no
 * adapter, so every Ultra request silently downgrades to High on WebGL and the
 * frames misrepresent the tier. `--browser-channel=chrome` drives the machine's
 * installed Google Chrome instead, which does get a real adapter. Required for
 * any Ultra capture; optional everywhere else.
 */
const browserChannel = option("browser-channel");
/**
 * Fingerprint of the build this capture is meant to evidence. The version file
 * changes every build, so a server that answers with a different fingerprint
 * is serving some other build — which happened silently when several agent
 * worktrees raced for one port, and produced byte-identical "captures" across
 * three different builds. Staleness must fail loudly, not photograph the
 * wrong venue.
 */
async function assertServedBuildMatches() {
  const version = JSON.parse(
    await readFile(resolve(".svelte-kit/cloudflare/_app/version.json"), "utf8"),
  ).version;
  const served = await fetch(`${baseUrl}/_app/version.json`).then((r) => r.json());
  if (served.version !== version) {
    throw new Error(
      `stale server: disk build ${version} but ${baseUrl} serves ${served.version}. ` +
        "Another process owns the port, or the preview was not restarted after the build.",
    );
  }
  return version;
}

const browser = await chromium.launch({
  headless: true,
  ...(browserChannel ? { channel: browserChannel } : {}),
});
const evidence = [];

function normalizedWarnings(warnings) {
  return [
    ...new Set(
      warnings.map((warning) =>
        warning.includes("GPU stall due to ReadPixels")
          ? "Chromium GPU readback warning during screenshot"
          : warning,
      ),
    ),
  ];
}

async function openReplay({
  sport,
  renderer,
  quality,
  theme,
  viewport,
  reducedMotion,
  playing = false,
  ghostPace,
}) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    deviceScaleFactor: 1,
    isMobile: viewport === "mobile",
    hasTouch: viewport === "mobile",
    colorScheme: theme,
    reducedMotion: reducedMotion ? "reduce" : "no-preference",
  });
  await context.addCookies([{ name: "theme", value: theme, url: baseUrl }]);
  await context.addInitScript(
    ({ rendererPreference, qualityPreference }) => {
      localStorage.setItem("replay_renderer", rendererPreference);
      localStorage.setItem("replay_quality", qualityPreference);
    },
    { rendererPreference: renderer, qualityPreference: quality },
  );

  const page = await context.newPage();
  const errors = [];
  const warnings = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
    if (message.type() === "warning") warnings.push(message.text());
  });

  const url = new URL(`/replay/${sport.id}`, `${baseUrl}/`);
  url.searchParams.set("qa", "release-gate");
  if (ghostPace) url.searchParams.set("ghostPace", ghostPace);
  await page.goto(url.toString(), {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(() => document.documentElement.dataset.appHydrated === "true");
  await page.locator(".course").waitFor({ state: "visible" });

  if (renderer === "3d") {
    const toggle = page.getByRole("button", { name: "3D", exact: true });
    await toggle.waitFor({ state: "visible" });
    await toggle.waitFor({ state: "attached" });
    if ((await toggle.getAttribute("aria-pressed")) !== "true") {
      await toggle.click();
    }
    await page.locator(".canvas3d-host:not(.hidden) canvas").waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page.locator(".backend-label").waitFor({ state: "visible", timeout: 30_000 });
  } else {
    await page.locator(".course > canvas:not(.hidden)").waitFor({ state: "visible" });
  }

  const scrub = page.locator("input.scrub");
  await scrub.evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, sport.seekSeconds);
  await page.waitForTimeout(renderer === "3d" ? 900 : 250);

  const stage =
    renderer === "3d"
      ? page.locator(".canvas3d-host:not(.hidden) canvas")
      : page.locator(".course > canvas:not(.hidden)");
  await stage.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);

  // Moving playback: let the replay actually run, so wake, spray, parallax and
  // the chase camera are captured mid-motion rather than from a paused frame.
  // Canvas rAF is unaffected by Playwright's CSS `animations: "disabled"`.
  if (playing) {
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await page.waitForTimeout(renderer === "3d" ? 1_200 : 600);
  }

  const stageBox = await stage.boundingBox();
  if (!stageBox) throw new Error(`${sport.slug} ${renderer}: stage has no bounding box`);
  const backend =
    renderer === "3d" ? (await page.locator(".backend-label").innerText()).trim() : null;
  // Ultra is WebGPU-only. Where no adapter exists the renderer downgrades to
  // High, so record what was actually rendered rather than what was requested.
  const effectiveQuality =
    renderer === "3d"
      ? await page
          .locator(".quality-select select")
          .inputValue()
          .catch(() => null)
      : null;
  const actualTheme = await page.locator("html").getAttribute("data-theme");
  if (actualTheme !== (theme === "dark" ? "dark" : "rowplay")) {
    throw new Error(`${sport.slug} ${renderer}: expected ${theme} theme, got ${actualTheme}`);
  }
  if (errors.length) {
    throw new Error(`${sport.slug} ${renderer}: browser errors: ${errors.join(" | ")}`);
  }

  return { context, page, stage, stageBox, backend, effectiveQuality, warnings };
}

async function captureViewport(options, filename) {
  const opened = await openReplay(options);
  try {
    await opened.page.screenshot({
      path: resolve(outputDir, filename),
      type: "jpeg",
      quality: 88,
      animations: "disabled",
      // Venue review only needs the stage; cropping keeps the committed
      // evidence small and puts the environment itself under scrutiny.
      ...(options.clipToStage
        ? {
            clip: {
              x: Math.round(opened.stageBox.x),
              y: Math.round(opened.stageBox.y),
              width: Math.round(opened.stageBox.width),
              height: Math.round(opened.stageBox.height),
            },
          }
        : {}),
    });
    evidence.push({
      file: filename,
      sport: options.sport.slug,
      route: `/replay/${options.sport.id}`,
      renderer: options.renderer,
      requestedQuality: options.quality,
      effectiveQuality: opened.effectiveQuality,
      backend: opened.backend,
      theme: options.theme,
      viewport: VIEWPORTS[options.viewport],
      stage: {
        width: Math.round(opened.stageBox.width),
        height: Math.round(opened.stageBox.height),
      },
      reducedMotion: options.reducedMotion,
      playback: options.playing ? "moving" : "paused",
      ghostPace: options.ghostPace ?? null,
      seekSeconds: options.sport.seekSeconds,
      warnings: normalizedWarnings(opened.warnings),
    });
  } finally {
    await opened.context.close();
  }
}

async function captureSilhouette(sport) {
  const options = {
    sport,
    renderer: "3d",
    quality: "high",
    theme: "light",
    viewport: "desktop",
    reducedMotion: false,
  };
  const opened = await openReplay(options);
  try {
    // World-space telemetry sits above the athlete. Cropping the top 17% keeps
    // the complete athlete/equipment/contact silhouette while excluding that
    // label at the real, unscaled CSS-pixel budget.
    const top = Math.round(opened.stageBox.height * 0.17);
    const clip = {
      x: Math.round(opened.stageBox.x),
      y: Math.round(opened.stageBox.y + top),
      width: Math.round(opened.stageBox.width),
      height: Math.round(opened.stageBox.height - top),
    };
    const variants = [
      { suffix: "normal", style: undefined },
      {
        suffix: "grayscale",
        style: ".canvas3d-host canvas { filter: grayscale(1) !important; }",
      },
      {
        suffix: "dark-silhouette",
        style:
          ".canvas3d-host canvas { filter: grayscale(1) contrast(1.8) brightness(0.78) !important; }",
      },
    ];
    for (const variant of variants) {
      const filename = `${sport.slug}-3d-hud-hidden-${variant.suffix}.jpg`;
      await opened.page.screenshot({
        path: resolve(outputDir, filename),
        type: "jpeg",
        quality: 90,
        clip,
        style: variant.style,
        animations: "disabled",
      });
      evidence.push({
        file: filename,
        sport: sport.slug,
        route: `/replay/${sport.id}`,
        renderer: "3d",
        requestedQuality: "high",
        backend: opened.backend,
        theme: "light",
        viewport: VIEWPORTS.desktop,
        stage: {
          width: Math.round(opened.stageBox.width),
          height: Math.round(opened.stageBox.height),
        },
        crop: { top, width: clip.width, height: clip.height },
        displayTransform: variant.suffix,
        reducedMotion: false,
        seekSeconds: sport.seekSeconds,
        warnings: normalizedWarnings(opened.warnings),
      });
    }
  } finally {
    await opened.context.close();
  }
}

/**
 * Requirement 6.2 for the premium-environments spec: all three sports reviewed
 * in 2D and 3D, paused and moving, light and dark, at the extreme quality tiers,
 * plus a ghost comparison that must stay readable over the shared venue.
 */
async function captureEnvironmentMatrix() {
  // The quality selector only exists in 3D — the Canvas renderer has no tiers —
  // so a 2D tier axis would emit identical frames under different names.
  const tiers = (option("tiers", "low,medium,high,ultra") ?? "").split(",").filter(Boolean);

  for (const sport of SPORTS) {
    for (const theme of ["light", "dark"]) {
      for (const playing of [false, true]) {
        await captureViewport(
          {
            sport,
            renderer: "2d",
            quality: "medium",
            theme,
            viewport: "desktop",
            reducedMotion: false,
            playing,
            clipToStage: true,
          },
          `${sport.slug}-2d-${theme}-${playing ? "moving" : "paused"}.jpg`,
        );
      }
    }

    for (const quality of tiers) {
      for (const theme of ["light", "dark"]) {
        for (const playing of [false, true]) {
          await captureViewport(
            {
              sport,
              renderer: "3d",
              quality,
              theme,
              viewport: "desktop",
              reducedMotion: false,
              playing,
              clipToStage: true,
            },
            `${sport.slug}-3d-${quality}-${theme}-${playing ? "moving" : "paused"}.jpg`,
          );
        }
      }
    }

    // Ghost comparison: both athletes and the shared venue must stay readable
    // without double-painted or faded scenery.
    await captureViewport(
      {
        sport,
        renderer: "3d",
        quality: tiers.at(-1) ?? "high",
        theme: "dark",
        viewport: "desktop",
        reducedMotion: false,
        ghostPace: "2:00",
        clipToStage: true,
      },
      `${sport.slug}-3d-ghost-dark.jpg`,
    );
  }
}

async function captureReleaseGate() {
  for (const sport of SPORTS) {
    await captureViewport(
      {
        sport,
        renderer: "2d",
        quality: "medium",
        theme: "light",
        viewport: "mobile",
        reducedMotion: false,
      },
      `${sport.slug}-2d-mobile-light-paused.jpg`,
    );
    await captureViewport(
      {
        sport,
        renderer: "3d",
        quality: "high",
        theme: "dark",
        viewport: "mobile",
        reducedMotion: false,
      },
      `${sport.slug}-3d-mobile-dark-high-paused.jpg`,
    );
    await captureViewport(
      {
        sport,
        renderer: "2d",
        quality: "medium",
        theme: "dark",
        viewport: "desktop",
        reducedMotion: true,
      },
      `${sport.slug}-2d-desktop-dark-reduced-motion.jpg`,
    );
    await captureViewport(
      {
        sport,
        renderer: "3d",
        quality: "high",
        theme: "light",
        viewport: "desktop",
        reducedMotion: true,
      },
      `${sport.slug}-3d-desktop-light-high-reduced-motion.jpg`,
    );
    await captureSilhouette(sport);
  }
}

const buildVersion = await assertServedBuildMatches();

try {
  if (matrix === "environment") await captureEnvironmentMatrix();
  else await captureReleaseGate();
} finally {
  await browser.close();
}

const manifestPath = resolve(outputDir, "manifest.json");
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      source: baseUrl,
      matrix,
      // Which browser produced these frames decides whether a WebGPU adapter
      // was available at all, so it belongs in the evidence.
      browserChannel: browserChannel ?? "playwright-bundled-chromium",
      buildVersion,
      command: [
        "node scripts/capture-replay-release-matrix.mjs",
        `--matrix=${matrix}`,
        `--base-url=${baseUrl}`,
        ...(browserChannel ? [`--browser-channel=${browserChannel}`] : []),
      ].join(" "),
      note: "Screenshots use demo data, actual application themes, native media emulation, and unscaled CSS pixels. Silhouette display transforms are screenshot-only and do not alter application state or renderer selection.",
      evidence,
    },
    null,
    2,
  )}\n`,
);

const formatter = spawnSync(resolve("node_modules/.bin/vp"), ["fmt", manifestPath], {
  stdio: "inherit",
});
if (formatter.status !== 0) {
  throw new Error(`Failed to format ${manifestPath}`);
}

console.log(`Captured ${evidence.length} ${matrix} frames in ${outputDir}`);
