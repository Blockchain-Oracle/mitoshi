#!/usr/bin/env node
/**
 * The store listing's pictures (D-227, MOBILE), written to mobile/store/:
 *   - icon-512.png: Play's 512 × 512 icon, the app icon (assets/icon.png, from web/src/app/icon.svg) scaled down;
 *   - feature-graphic.png: Play's 1024 × 500 graphic, feature-graphic.html (the site's link-preview card) rendered;
 *   - screenshots/phone-<n>-<name>.png: 1080 × 1920 phone captures of the deployed site as the app shows it — a 360 × 640
 *     viewport at 3× density, the dark theme, reduced motion (no figure caught mid-roll), `window.ReactNativeWebView`
 *     and the app's user-agent mark defined (so the page renders as inside the app: no "install the app" strip), signed
 *     out, nothing typed. A page that redirects off the origin, answers ≥ 400 or throws is not kept.
 *     screenshots/manifest.json records each one's URL, time and hash.
 *
 *   node mobile/scripts/store-assets.mjs                    # all three, screenshots from https://mitoshi.xyz
 *   node mobile/scripts/store-assets.mjs --only feature,icon
 *   node mobile/scripts/store-assets.mjs --only shots --origin https://mitoshi.xyz
 *
 * Needs ImageMagick (`magick`) and the Playwright the docs site installs (docs-site/node_modules/playwright).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mobile = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(mobile, "..");
const store = resolve(mobile, "store");
const { chromium } = createRequire(resolve(repo, "docs-site/package.json"))("playwright");

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const only = flag("--only") ? new Set(flag("--only").split(",")) : null;
const wanted = (name) => !only || only.has(name);
const origin = new URL(flag("--origin") ?? "https://mitoshi.xyz").origin;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** In order: what a first-time reader sees, then the call, the proof and the rest of the product. */
const SHOTS = [
  { name: "markets", route: "/markets" },
  { name: "btc", route: "/trade/BTC" },
  { name: "tsla", route: "/trade/TSLA" },
  { name: "proof", route: "/proof" },
  { name: "games", route: "/games" },
  { name: "earn", route: "/earn" },
];
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const APP_UA = `${ANDROID_UA} CWFShell/1.0.0 (android; testnet)`;

function icon() {
  const out = resolve(store, "icon-512.png");
  execFileSync("magick", [resolve(mobile, "assets/icon.png"), "-resize", "512x512", "-strip", out]);
  console.log(`✓ ${out}`);
}

async function feature(browser) {
  const font = await readFile(resolve(repo, "web/src/features/og/fonts/Sora-SemiBold.ttf"));
  const html = (await readFile(resolve(store, "feature-graphic.html"), "utf8")).replaceAll("__SORA__", `data:font/ttf;base64,${font.toString("base64")}`);
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const out = resolve(store, "feature-graphic.png");
  await page.screenshot({ path: out, type: "png" });
  await page.close();
  execFileSync("magick", [out, "-alpha", "off", "-strip", out]);
  console.log(`✓ ${out}`);
}

async function skipTour(page) {
  const skip = page.getByRole("button", { name: "Skip", exact: true }).first();
  await skip.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function shots(browser) {
  const dir = resolve(store, "screenshots");
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const kept = [];
  for (const [i, shot] of SHOTS.entries()) {
    const context = await browser.newContext({
      viewport: { width: 360, height: 640 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      colorScheme: "dark",
      reducedMotion: "reduce",
      userAgent: APP_UA,
      locale: "en-US",
      timezoneId: "America/New_York",
    });
    await context.addInitScript(() => {
      window.ReactNativeWebView = { postMessage() {} };
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    try {
      const response = await page.goto(new URL(shot.route, origin).href, { waitUntil: "load", timeout: 45000 });
      if (!response || response.status() >= 400) throw new Error(`answered ${response?.status() ?? "nothing"}`);
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      if (new URL(page.url()).origin !== origin) throw new Error(`left ${origin} for ${page.url()}`);
      await skipTour(page);
      await sleep(shot.settleMs ?? 5000);
      if (errors.length) throw new Error(`page errors: ${errors.join(" | ").slice(0, 300)}`);
      const png = await page.screenshot({ type: "png" });
      const file = `phone-${i + 1}-${shot.name}.png`;
      await writeFile(resolve(dir, file), png);
      kept.push({ file, url: page.url(), capturedAt: new Date().toISOString(), viewport: "360x640@3x", sha256: sha256(png) });
      console.log(`✓ ${file} ← ${page.url()}`);
    } catch (error) {
      console.error(`✗ ${shot.name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
  await writeFile(resolve(dir, "manifest.json"), `${JSON.stringify({ origin, shots: kept }, null, 2)}\n`);
  if (kept.length < 4) throw new Error(`only ${kept.length} screenshots kept; Play needs at least 2, the listing wants 4–8`);
}

await mkdir(store, { recursive: true });
if (wanted("icon")) icon();
const browser = await chromium.launch();
try {
  if (wanted("feature")) await feature(browser);
  if (wanted("shots")) await shots(browser);
} finally {
  await browser.close();
}
