import { mkdir, writeFile } from "node:fs/promises";
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
const outputDir = resolve(option("output", "docs/visual-qa/higher-ceiling/release-gate"));

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
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

async function openReplay({ sport, renderer, quality, theme, viewport, reducedMotion }) {
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

  await page.goto(`${baseUrl}/replay/${sport.id}?qa=release-gate`, {
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

  const stageBox = await stage.boundingBox();
  if (!stageBox) throw new Error(`${sport.slug} ${renderer}: stage has no bounding box`);
  const backend =
    renderer === "3d" ? (await page.locator(".backend-label").innerText()).trim() : null;
  const actualTheme = await page.locator("html").getAttribute("data-theme");
  if (actualTheme !== (theme === "dark" ? "dark" : "rowplay")) {
    throw new Error(`${sport.slug} ${renderer}: expected ${theme} theme, got ${actualTheme}`);
  }
  if (errors.length) {
    throw new Error(`${sport.slug} ${renderer}: browser errors: ${errors.join(" | ")}`);
  }

  return { context, page, stage, stageBox, backend, warnings };
}

async function captureViewport(options, filename) {
  const opened = await openReplay(options);
  try {
    await opened.page.screenshot({
      path: resolve(outputDir, filename),
      type: "jpeg",
      quality: 88,
      animations: "disabled",
    });
    evidence.push({
      file: filename,
      sport: options.sport.slug,
      route: `/replay/${options.sport.id}`,
      renderer: options.renderer,
      requestedQuality: options.quality,
      backend: opened.backend,
      theme: options.theme,
      viewport: VIEWPORTS[options.viewport],
      stage: {
        width: Math.round(opened.stageBox.width),
        height: Math.round(opened.stageBox.height),
      },
      reducedMotion: options.reducedMotion,
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

try {
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
} finally {
  await browser.close();
}

const manifestPath = resolve(outputDir, "manifest.json");
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      source: baseUrl,
      command: `node scripts/capture-replay-release-matrix.mjs --base-url=${baseUrl}`,
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

console.log(`Captured ${evidence.length} release-gate frames in ${outputDir}`);
