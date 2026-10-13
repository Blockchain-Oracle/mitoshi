/**
 * The S23 gate's screenshots of the §8 states (`revamp-parity.md` "Empty, loading, error and stale states"), each
 * reached through the deployed terminal's own UI at 1440 and 390, plus Tradash live (`tradash.xyz/trade/BTC`) at the
 * same widths for the side-by-side (Owarine's captures are on disk: canton-season3/…/owarine-captures-2026-10-07).
 *
 * Signed out: the first-visit tour, the guards and "No open positions", "Balance unavailable", the markets drawer's
 * "No favourites yet…", "Loading movers…" (the real `/prices/day` held for 20 s) and "No markets match that search.",
 * SPCX's no-Window reason, "Connecting…" with the stream unreachable. Signed in (a fresh passkey, the faucet, not
 * armed): "Turn on one-tap", the P&L curve's "No closed trades in this window", "No trades yet. Tap UP or DOWN to start.",
 * Activity; then a real $1 UP closed from its details' CLOSE → "This position is no longer open." + Done, the history's
 * stats grid; the stream dropped (network offline 12 s) → "Reconnecting…". The update toast needs a newer build id: the
 * one capture whose answer is substituted (`/api/version`), named so. Every capture is listed in `states.json`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/states.ts --base https://mitoshi.xyz --out <dir> [--widths 1440,390]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { modal, openTerminal, openTerminalSession, stakeMin, waitEnterable } from "./lib/terminal";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://mitoshi.xyz");
const out = arg("out", "states-out");
const widths = arg("widths", "1440,390").split(",").map(Number);
mkdirSync(out, { recursive: true });

const shots: { state: string; width: number; file: string; ok: boolean; note?: string }[] = [];
async function shot(page: Page, state: string, width: number, note?: string) {
  const file = `${state}-${width}.png`;
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, file) });
  shots.push({ state, width, file, ok: true, ...(note ? { note } : {}) });
  console.log(JSON.stringify({ step: "shot", state, width }));
}
/** A miss keeps the screen as it was and Playwright's call log (which locator, what was in its way). */
async function attempt(state: string, width: number, run: () => Promise<void>, page?: Page) {
  try {
    await run();
  } catch (e) {
    const lines = (e as Error).message.split("\n").map((l) => l.trim()).filter(Boolean);
    const file = `miss-${state}-${width}.png`;
    const saved = page ? await page.screenshot({ path: join(out, file) }).then(() => file, () => "") : "";
    shots.push({ state, width, file: saved, ok: false, note: lines[0] });
    console.log(JSON.stringify({ step: "miss", state, width, why: lines[0], log: lines.slice(1, 9), screenshot: saved || null }));
  }
}

async function signedOut(width: number) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
  const page = await ctx.newPage();
  await attempt("tour", width, async () => {
    await page.goto(`${base}/trade/BTC`, { waitUntil: "load" });
    await expect(modal(page).getByText("Watch the market")).toBeVisible({ timeout: 60_000 });
    await shot(page, "tour", width);
    await modal(page).getByRole("button", { name: "Skip" }).click();
    await page.waitForTimeout(2_500);
    await shot(page, "signed-out", width, "Sign in pill · guards under UP/DOWN · No open positions (desktop column)");
  });
  await attempt("balance-unavailable", width, async () => {
    await page.locator(".tm-stack").click();
    await expect(modal(page).getByText("Balance unavailable")).toBeVisible({ timeout: 15_000 });
    await shot(page, "balance-unavailable", width);
    await page.keyboard.press("Escape");
  });
  await attempt("markets", width, async () => {
    // The day's figures held 20 s, so Hot shows its wait; everything else is the live answer.
    await page.route("**/prices/day**", async (r) => { await new Promise((res) => setTimeout(res, 20_000)); await r.continue().catch(() => undefined); });
    await page.locator(".tm-asset").first().click();
    const drawer = modal(page);
    await drawer.getByRole("tab", { name: "Hot 🔥" }).click();
    await expect(drawer.getByText("Loading movers…")).toBeVisible({ timeout: 10_000 });
    await shot(page, "loading-movers", width, "price and % skeletons on the other tabs until their figures arrive");
    await drawer.getByRole("tab", { name: "Favourites" }).click();
    await expect(drawer.getByText("No favourites yet. Tap a star to add one.")).toBeVisible();
    await shot(page, "no-favourites", width);
    await drawer.getByRole("tab", { name: "All", exact: true }).click();
    await drawer.getByLabel("Search markets").fill("zzzz");
    await expect(drawer.getByText("No markets match that search.")).toBeVisible();
    await shot(page, "no-match", width);
    await page.keyboard.press("Escape");
    await page.unroute("**/prices/day**");
  });
  await attempt("no-window-spcx", width, async () => {
    await openTerminal(page, base, "SPCX");
    await expect(page.getByText(/no signed price source/).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "no-window-spcx", width);
  });
  await attempt("update", width, async () => {
    await openTerminal(page, base, "BTC");
    await page.route("**/api/version", (r) => r.fulfill({ json: { build: "a-newer-build" } }));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.locator('[data-slot="toast-title"]').filter({ hasText: "New version available" })).toBeVisible({ timeout: 15_000 });
    await shot(page, "update", width, "/api/version answered with a newer build id (the only substituted answer)");
    await page.unroute("**/api/version");
  });
  await ctx.close();
  // A fresh tab whose stream can't open: the chip waits with "—" and "Connecting…".
  const ctx2 = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
  const p2 = await ctx2.newPage();
  await attempt("connecting", width, async () => {
    await p2.route(/\/v1\/stream|\/prices\/recent/, (r) => r.abort());
    await p2.goto(`${base}/trade/ETH`, { waitUntil: "load" });
    await settle(p2);
    const tour = modal(p2).filter({ hasText: "Watch the market" });
    if (await tour.isVisible().catch(() => false)) await tour.getByRole("button", { name: "Skip" }).click();
    await expect(p2.locator(".tm-asset-name").first()).toContainText("Connecting…", { timeout: 30_000 });
    await shot(p2, "connecting", width, "stream and recent ticks unreachable");
  });
  await browser.close();
}

async function signedIn(width: number) {
  const s = await openTerminalSession({ width });
  const { page } = s;
  await attempt("turn-on-one-tap", width, async () => {
    await page.goto(`${base}/trade/BTC`, { waitUntil: "load" });
    await settle(page);
    const tour = modal(page);
    await expect(tour.getByText("Watch the market")).toBeVisible({ timeout: 120_000 });
    for (let i = 0; i < 4; i++) await tour.getByRole("button", { name: "Next" }).click();
    await tour.getByRole("button", { name: "Start trading" }).click();
    await page.getByLabel(/Name this passkey/).fill(`states ${Date.now()}`);
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(modal(page).getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Turn on one-tap" }).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, "turn-on-one-tap", width);
    // Then arm it from that card, so the trade below takes one tap with no prompt.
    await page.getByRole("button", { name: "Turn on one-tap" }).first().click();
    await modal(page).getByRole("button", { name: "Turn on One-tap" }).last().click();
    await expect(page.getByRole("button", { name: "Turn on one-tap" })).toHaveCount(0, { timeout: 60_000 });
    await page.keyboard.press("Escape");
  });
  await attempt("account-empty", width, async () => {
    await page.locator(".tm-equity:visible").first().click();
    const drawer = modal(page);
    await drawer.locator(".tm-pnl-line-btn").click();
    await expect(drawer.getByText("No closed trades in this window")).toBeVisible({ timeout: 30_000 });
    await shot(page, "pnl-empty", width);
    await drawer.getByRole("button", { name: "Activity" }).click();
    await expect(drawer.getByText(/Test dollars|No activity yet/).first()).toBeVisible({ timeout: 60_000 });
    await shot(page, "activity", width, "a fresh account's one row: the faucet's test dollars");
    await drawer.getByRole("button", { name: "Back" }).click();
    await drawer.getByRole("button", { name: "Trade history" }).first().click();
    await expect(drawer.getByText("No trades yet. Tap UP or DOWN to start.")).toBeVisible({ timeout: 60_000 });
    await shot(page, "history-empty", width);
    await page.keyboard.press("Escape");
  });
  await attempt("position-gone", width, async () => {
    await stakeMin(page);
    await waitEnterable(s, "up");
    const toast = () => page.locator('[data-slot="toast-title"]').allInnerTexts();
    const up = page.locator(".tm-btn").filter({ hasText: "UP" }).first();
    await up.click();
    await expect.poll(toast, { timeout: 90_000 }).toContainEqual(expect.stringMatching(/Up BTC opened|Price moved|failed|Nothing filled/));
    if ((await toast()).includes("Price moved")) {
      await page.waitForTimeout(1_000);
      await up.click();
      await expect.poll(toast, { timeout: 90_000 }).toContainEqual(expect.stringMatching(/Up BTC opened/));
    }
    // Phones keep the positions behind the "View position" pill.
    if (width < 768) await page.locator(".tm-view").first().click({ timeout: 60_000 });
    const row = page.locator(".tm-pos:visible").filter({ hasText: "Up BTC" }).first();
    await expect(row).toBeVisible({ timeout: 120_000 });
    await row.locator(".tm-pos-open-btn").click();
    const details = modal(page);
    await shot(page, "position-details", width);
    // The Reduce row's 100 % is its CLOSE (the screen's own CLOSE button sits under the drawer).
    await details.locator(".tm-field").getByRole("button", { name: "CLOSE", exact: true }).first().click();
    await expect(details.getByText("This position is no longer open.")).toBeVisible({ timeout: 120_000 });
    await shot(page, "position-gone", width, "closed from its own details (Reduce → CLOSE)");
    await details.getByRole("button", { name: "Done" }).click();
  });
  await attempt("history-stats", width, async () => {
    // Every drawer the trade opened is closed (phones stack positions under details), then the closed round is
    // awaited in the indexed history: it lands within minutes, so the history is reopened until it does.
    // Each Escape closes the top drawer; its exit animation keeps it counted for a moment, so wait it out before the
    // next (run 37996627086: the phone's positions slide-over stayed over the equity pill and the click timed out).
    for (let i = 0; i < 4 && (await modal(page).count()) > 0; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    }
    await expect(modal(page)).toHaveCount(0, { timeout: 10_000 });
    const deadline = Date.now() + 6 * 60_000;
    for (;;) {
      await page.locator(".tm-equity:visible").first().click();
      const drawer = modal(page);
      await drawer.getByRole("button", { name: "Trade history" }).first().click();
      if (await drawer.getByText("Lifetime PnL").waitFor({ timeout: 30_000 }).then(() => true, () => false)) break;
      if (Date.now() > deadline) throw new Error("the closed round never reached the history");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(20_000);
    }
    await shot(page, "history-stats", width);
    await page.keyboard.press("Escape");
  }, page);
  await attempt("reconnecting", width, async () => {
    // The stream closes while the page is hidden and reopens when it shows (stream-hub): hide it, refuse the stream's
    // address, show it — the reconnect fails as a dropped connection would, and after 10 s the chip says so.
    // A string, not a closure: tsx wraps named inner functions in `__name`, which the page doesn't have.
    const visibility = (hidden: boolean) => page.evaluate(`(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => ${hidden} });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "${hidden ? "hidden" : "visible"}" });
      document.dispatchEvent(new Event("visibilitychange"));
    })()`);
    await visibility(true);
    await page.route(/\/v1\/stream/, (r) => r.abort());
    await page.waitForTimeout(1_500);
    await visibility(false);
    await expect(page.locator(".tm-asset-name").first()).toContainText("Reconnecting…", { timeout: 45_000 });
    await shot(page, "reconnecting", width, "the stream's reconnect refused for > 10 s");
    await page.unroute(/\/v1\/stream/);
  });
  await s.browser.close();
}

async function tradash(width: number) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
  const page = await ctx.newPage();
  await attempt("tradash", width, async () => {
    await page.goto("https://tradash.xyz/trade/BTC", { waitUntil: "load", timeout: 90_000 });
    await page.waitForTimeout(6_000);
    await shot(page, "tradash-first-load", width, "Tradash live: splash or tour, as a first visitor sees it");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2_000);
    await shot(page, "tradash-terminal", width, "Tradash live");
  });
  await browser.close();
}

for (const width of widths) {
  await signedOut(width);
  await signedIn(width);
  await tradash(width);
}
writeFileSync(join(out, "states.json"), JSON.stringify(shots, null, 2));
const missed = shots.filter((x) => !x.ok);
console.log(JSON.stringify({ step: "done", shots: shots.length - missed.length, missed: missed.map((m) => `${m.state}@${m.width}: ${m.note}`) }));
process.exitCode = missed.length ? 1 : 0;
