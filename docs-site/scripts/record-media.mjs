#!/usr/bin/env node
/**
 * Record the guides' captures and walkthroughs from the deployed testnet product (ported from Owarine
 * 90a91d71:docs-site/scripts/record-walkthrough.mjs, D-227): an isolated headless Chromium at 2× density, the plan's
 * origin only (never localhost or /dev), signed out, nothing typed. A capture is one lossless PNG with a sidecar (URL,
 * time, viewport, SHA-256, HTTP status); a walkthrough is lossless PNG frames sampled every ~150 ms with the chapter
 * marks the plan's steps set as they run. A page that answers ≥ 400, or a required step that fails, leaves that item
 * unrecorded (`failed.json` says where), so `publish-media.mjs` can never publish it.
 *
 *   pnpm media:record                       # everything in scripts/media-plan.json
 *   pnpm media:record --only terminalPhone,first-call-demo
 *
 * Output: evidence/raw-media/ (git-ignored, excluded from the image). Then `pnpm media:publish`.
 */
import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plan = JSON.parse(readFileSync(resolve(root, 'scripts/media-plan.json'), 'utf8'));
const origin = new URL(plan.origin).origin;
if (!origin.startsWith('https://') || /localhost|127\.0\.0\.1/.test(origin)) throw new Error('Media come from the deployed product only.');
const out = resolve(root, 'evidence/raw-media');
const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const wanted = name => !only || only.has(name);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function viewportOf(name) {
  const v = plan.viewports[name];
  if (!v) throw new Error(`Unknown viewport ${name}`);
  return v;
}
function urlOf(path) {
  const url = new URL(path, origin);
  if (url.origin !== origin || /^\/dev(\/|$)/.test(url.pathname)) throw new Error(`Off-product route ${path}`);
  return url.href;
}
async function contextFor(browser, viewportName) {
  const v = viewportOf(viewportName);
  return browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 2, isMobile: v.mobile, hasTouch: v.mobile, colorScheme: 'dark', reducedMotion: 'no-preference', locale: 'en-US', timezoneId: 'UTC' });
}
/** A role locator from the plan: a name starting with ^ is a regular expression, else exact text. */
function locate(page, step) {
  if (step.selector) return page.locator(step.selector).first();
  const name = step.name.startsWith('^') ? new RegExp(step.name) : step.name;
  return page.getByRole(step.role, { name, exact: typeof name === 'string' }).first();
}
async function open(page, path) {
  const response = await page.goto(urlOf(path), { waitUntil: 'load', timeout: 45000 });
  if (!response || response.status() >= 400) throw new Error(`${path} answered ${response?.status() ?? 'nothing'}`);
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  return response.status();
}
async function follow(page, selector) {
  const link = page.locator(selector).first();
  await link.waitFor({ state: 'attached', timeout: 20000 });
  const href = await link.getAttribute('href');
  if (!href) throw new Error(`No href on ${selector}`);
  return open(page, href);
}
async function skipTour(page) {
  const skip = page.getByRole('button', { name: 'Skip', exact: true }).first();
  await skip.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function recordCapture(browser, c) {
  const dir = resolve(out, 'captures');
  await mkdir(dir, { recursive: true });
  await rm(resolve(dir, `${c.name}.failed.json`), { force: true });
  const context = await contextFor(browser, c.viewport);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    let status = await open(page, c.route);
    for (const selector of c.follow ?? []) status = await follow(page, selector);
    if (c.skipTour) await skipTour(page);
    if (c.waitFor) await locate(page, c.waitFor).waitFor({ state: 'visible', timeout: 30000 });
    await sleep(c.settleMs ?? 3000);
    const png = await page.screenshot({ type: 'png' });
    const v = viewportOf(c.viewport);
    const sidecar = { name: c.name, origin, url: page.url(), route: c.route, status, capturedAt: new Date().toISOString(), viewport: { width: v.width, height: v.height, deviceScaleFactor: 2 }, sha256: sha256(png), pageErrors: errors.length };
    await writeFile(resolve(dir, `${c.name}.png`), png);
    await writeFile(resolve(dir, `${c.name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
    console.log(`✓ capture ${c.name} ← ${sidecar.url}`);
  } catch (error) {
    await writeFile(resolve(dir, `${c.name}.failed.json`), `${JSON.stringify({ name: c.name, url: page.url(), error: String(error.message), at: new Date().toISOString() }, null, 2)}\n`);
    console.error(`✗ capture ${c.name}: ${error.message}`);
  } finally {
    await context.close();
  }
}

/** Lossless frames on a timer; identical frames are stored once (as Owarine's Recorder). */
class Recorder {
  constructor(page, dir) { this.page = page; this.dir = dir; this.frames = []; this.marks = []; this.busy = false; this.last = null; }
  now() { return Math.round(performance.now() - this.started); }
  async frame() {
    if (this.busy) return;
    this.busy = true;
    try {
      if (new URL(this.page.url()).origin !== origin) return;
      const t = this.now();
      const png = await this.page.screenshot({ type: 'png', timeout: 15000 });
      const hash = sha256(png);
      if (hash !== this.last?.hash) {
        const file = `frame-${String(this.frames.length).padStart(5, '0')}.png`;
        await writeFile(resolve(this.dir, file), png);
        this.last = { hash, file };
      }
      this.frames.push({ t, file: this.last.file, sha256: hash });
    } catch (error) { this.error = String(error.message); } finally { this.busy = false; }
  }
  start() { this.started = performance.now(); this.timer = setInterval(() => void this.frame(), 150); }
  mark(chapter) { this.marks.push({ t: this.now(), title: chapter.title, text: chapter.text }); }
  async stop() { clearInterval(this.timer); while (this.busy) await sleep(30); await this.frame(); return this.now(); }
}

async function recordWalkthrough(browser, w) {
  const dir = resolve(out, 'videos', w.name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const context = await contextFor(browser, w.viewport);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const rec = new Recorder(page, dir);
  const capturedAt = new Date().toISOString();
  let failure = null;
  try {
    // The first page loads before the clock starts, so the clip never opens on a blank tab.
    const first = w.steps[0];
    if (first?.do !== 'open') throw new Error('A walkthrough starts with an open step');
    await open(page, first.route);
    rec.start();
    if (first.chapter) rec.mark(first.chapter);
    for (const [index, step] of w.steps.slice(1).entries()) {
      try {
        if (step.chapter) rec.mark(step.chapter);
        if (step.do === 'wait') await sleep(step.ms);
        else if (step.do === 'open') await open(page, step.route);
        else if (step.do === 'follow') {
          // On camera a link is clicked, as a visitor would; the target must stay on the product.
          const link = page.locator(step.selector).first();
          await link.waitFor({ state: 'visible', timeout: 20000 });
          const target = new URL(urlOf(await link.getAttribute('href') ?? ''));
          await link.scrollIntoViewIfNeeded();
          await sleep(600);
          await link.click();
          await page.waitForURL(u => u.pathname === target.pathname, { timeout: 30000 });
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
        }
        else if (step.do === 'scroll') await page.mouse.wheel(0, step.y);
        else if (step.do === 'waitFor') {
          const target = locate(page, step);
          await target.waitFor({ state: 'visible', timeout: step.timeout ?? 15000 });
          if (step.enabled) await page.waitForFunction(el => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true', await target.elementHandle(), { timeout: step.timeout ?? 15000 });
        } else if (step.do === 'click') {
          const target = locate(page, step);
          await target.waitFor({ state: 'visible', timeout: step.optional ? 3000 : 15000 });
          await target.click();
        } else throw new Error(`Unknown step ${step.do}`);
      } catch (error) {
        if (step.optional) { if (step.chapter) rec.marks.pop(); continue; }
        throw new Error(`step ${index + 1} (${step.do} ${step.name ?? step.selector ?? step.route ?? ''}): ${error.message}`);
      }
    }
  } catch (error) { failure = String(error.message); }
  const durationMs = rec.started ? await rec.stop() : 0;
  const v = viewportOf(w.viewport);
  const meta = { name: w.name, origin, url: page.url(), capturedAt, viewport: { width: v.width, height: v.height, deviceScaleFactor: 2 }, durationMs, frames: rec.frames, marks: rec.marks, captureError: rec.error ?? null, pageErrors: errors.length };
  await writeFile(resolve(dir, 'frames.json'), `${JSON.stringify(meta, null, 2)}\n`);
  if (failure) await writeFile(resolve(dir, 'failed.json'), `${JSON.stringify({ name: w.name, url: page.url(), error: failure }, null, 2)}\n`);
  await context.close();
  if (failure) console.error(`✗ walkthrough ${w.name}: ${failure}`);
  else console.log(`✓ walkthrough ${w.name}: ${rec.frames.length} frames, ${(durationMs / 1000).toFixed(1)} s, ${rec.marks.length} chapters`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const c of plan.captures) if (wanted(c.name)) await recordCapture(browser, c);
  for (const w of plan.walkthroughs) if (wanted(w.name)) await recordWalkthrough(browser, w);
} finally {
  await browser.close();
}
console.log('Next: pnpm media:publish');
