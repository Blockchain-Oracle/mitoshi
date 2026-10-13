#!/usr/bin/env node
/**
 * Record the guides' captures and walkthroughs from the deployed testnet product (ported from Owarine
 * 90a91d71:docs-site/scripts/record-walkthrough.mjs, D-227): an isolated headless Chromium at 2× density, the plan's
 * origin only (never localhost or /dev), signed out, nothing typed. A capture is one lossless PNG with a sidecar (URL,
 * time, viewport, SHA-256, HTTP status); a walkthrough is lossless PNG frames sampled every ~150 ms with the chapter
 * marks the plan's steps set as they run. A page that answers ≥ 400, or a required step that fails, leaves that item
 * unrecorded (`failed.json` says where), so `publish-media.mjs` can never publish it. So does a screen that is still
 * the not-built placeholder (`.capability-pending`): a guide never shows a route's "coming" page as the product.
 *
 *   pnpm media:record                       # everything in scripts/media-plan.json
 *   pnpm media:record --only terminalPhone,first-call-demo
 *   pnpm media:record --probe               # every page, link and step against the live product; no pixels kept
 *
 * Output: evidence/raw-media/ (git-ignored, excluded from the image). Then `pnpm media:publish`. A probe touches
 * nothing there: it writes evidence/media-probe-<date>.json, so a plan's locators are proven before a deploy is filmed.
 */
import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
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
const probe = args.includes('--probe');
const probed = [];
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
/** A plan locator: a CSS selector, visible text (a regular expression) or a role and name (^ = regular expression,
 * else exact). The first match, or the last with `"last": true` (the closing print's button after the opening's). */
function locate(page, step) {
  const pick = l => (step.last ? l.last() : l.first());
  if (step.selector) return pick(page.locator(step.selector));
  if (step.text) return pick(page.getByText(new RegExp(step.text)));
  const name = step.name.startsWith('^') ? new RegExp(step.name) : step.name;
  return pick(page.getByRole(step.role, { name, exact: typeof name === 'string' }));
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
/** The route still renders its not-built placeholder (web/src/components/shell/CapabilityPending.tsx). */
const notBuilt = page => page.locator('.capability-pending').first().isVisible().catch(() => false);
const PLACEHOLDER = 'the page is still the not-built placeholder (CapabilityPending); record it once the screen ships';
async function skipTour(page) {
  const skip = page.getByRole('button', { name: 'Skip', exact: true }).first();
  await skip.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

async function recordCapture(browser, c) {
  const dir = resolve(out, 'captures');
  if (!probe) await mkdir(dir, { recursive: true });
  if (!probe) await rm(resolve(dir, `${c.name}.failed.json`), { force: true });
  const context = await contextFor(browser, c.viewport);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const started = performance.now();
  try {
    let status = await open(page, c.route);
    for (const selector of c.follow ?? []) status = await follow(page, selector);
    if (c.skipTour) await skipTour(page);
    if (c.waitFor) await locate(page, c.waitFor).waitFor({ state: 'visible', timeout: 30000 });
    if (await notBuilt(page)) throw new Error(PLACEHOLDER);
    if (probe) {
      probed.push({ kind: 'capture', name: c.name, ok: true, url: page.url(), status, ms: Math.round(performance.now() - started), pageErrors: errors.map(e => e.slice(0, 300)) });
      console.log(`✓ probe capture ${c.name} ← ${page.url()}`);
      return;
    }
    await sleep(c.settleMs ?? 3000);
    const png = await page.screenshot({ type: 'png' });
    const v = viewportOf(c.viewport);
    const sidecar = { name: c.name, origin, url: page.url(), route: c.route, status, capturedAt: new Date().toISOString(), viewport: { width: v.width, height: v.height, deviceScaleFactor: 2 }, sha256: sha256(png), pageErrors: errors.length };
    await writeFile(resolve(dir, `${c.name}.png`), png);
    await writeFile(resolve(dir, `${c.name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
    console.log(`✓ capture ${c.name} ← ${sidecar.url}`);
  } catch (error) {
    if (probe) {
      probed.push({ kind: 'capture', name: c.name, ok: false, url: page.url(), error: String(error.message), pageErrors: errors.map(e => e.slice(0, 300)) });
      console.error(`✗ probe capture ${c.name}: ${error.message}`);
      return;
    }
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
  start() { this.started = performance.now(); if (!probe) this.timer = setInterval(() => void this.frame(), 150); }
  mark(chapter) { this.marks.push({ t: this.now(), title: chapter.title, text: chapter.text }); }
  async stop() { clearInterval(this.timer); while (this.busy) await sleep(30); if (!probe) await this.frame(); return this.now(); }
}

async function recordWalkthrough(browser, w) {
  const dir = resolve(out, 'videos', w.name);
  if (!probe) await rm(dir, { recursive: true, force: true });
  if (!probe) await mkdir(dir, { recursive: true });
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
      // A click's chapter starts when the click lands (after any wait for the control to enable), so its caption never
      // sits over the wait before it; every other step's chapter starts with the step.
      let marked = false;
      const markNow = () => { if (step.chapter && !marked) { rec.mark(step.chapter); marked = true; } };
      const enabledNow = async target => page.waitForFunction(el => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true', await target.elementHandle(), { timeout: step.timeout ?? 15000 });
      try {
        if (step.do !== 'click') markNow();
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
          if (step.enabled) await enabledNow(target);
        } else if (step.do === 'click') {
          const target = locate(page, step);
          await target.waitFor({ state: 'visible', timeout: step.optional ? 3000 : 15000 });
          if (step.enabled) await enabledNow(target);
          markNow();
          await target.click({ timeout: 5000 });
        } else throw new Error(`Unknown step ${step.do}`);
      } catch (error) {
        if (step.optional) { if (marked) rec.marks.pop(); continue; }
        throw new Error(`step ${index + 1} (${step.do} ${step.name ?? step.text ?? step.selector ?? step.route ?? ''}): ${error.message}`);
      }
    }
    if (await notBuilt(page)) throw new Error(PLACEHOLDER);
  } catch (error) { failure = String(error.message); }
  const durationMs = rec.started ? await rec.stop() : 0;
  if (probe) {
    probed.push({ kind: 'walkthrough', name: w.name, ok: !failure, url: page.url(), ms: durationMs, chapters: rec.marks.map(m => m.title), ...(failure ? { error: failure } : {}), pageErrors: errors.map(e => e.slice(0, 300)) });
    await context.close();
    if (failure) console.error(`✗ probe walkthrough ${w.name}: ${failure}`);
    else console.log(`✓ probe walkthrough ${w.name}: ${rec.marks.length} chapters, ${(durationMs / 1000).toFixed(1)} s`);
    return;
  }
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
if (probe) {
  const at = new Date().toISOString();
  const file = resolve(root, `evidence/media-probe-${at.slice(0, 10)}.json`);
  // `--only` re-probes a few: the day's other results stay, each with its own time.
  const earlier = only && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).results.filter(r => !only.has(r.name)) : [];
  const results = [...earlier, ...probed.map(r => ({ ...r, at }))];
  const passed = results.filter(r => r.ok).length;
  await writeFile(file, `${JSON.stringify({ origin, probedAt: at, method: 'Headless Chromium, signed out; every capture\'s page, links and wait, and every walkthrough step, run against the live product with no pixels kept.', passed, failed: results.length - passed, results }, null, 2)}\n`);
  console.log(`Probe: ${passed} of ${results.length} ready → ${file}`);
} else console.log('Next: pnpm media:publish');
