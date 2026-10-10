/**
 * The S5 gate's browser pass (D-207: the product checked live, no UI test suite), from a CI runner like the other
 * drivers. Signed out, at each width: `/stats`, `/news`, `/status`, `/leaderboard` (P&L ↔ ROI, Daily ↔ All time) and
 * `/portfolio/edge`'s sign-in state. Signed in (a fresh passkey from the terminal's tour, the faucet, one-tap armed): a
 * $1 UP on BTC held through its Window's settlement — shared from its details (the card, and the PNG Download saves) —
 * then `/portfolio/edge` — "nothing settled yet" with the open count
 * while the Window runs, the report once it settles — and `/leaderboard` with the account's own row (Daily). Every
 * capture is listed in `s5-pages.json`; a miss keeps its screen and the reason.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/s5-pages.ts --base https://testnet.mitoshi.xyz --out <dir> [--widths 1440,390]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { settle } from "./lib/settle";
import { modal, openTerminalSession, signUpFromTour, stakeMin, waitEnterable } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "s5-pages-out");
const widths = arg("widths", "1440,390").split(",").map(Number);
mkdirSync(out, { recursive: true });

const shots: { state: string; width: number; file: string; ok: boolean; note?: string }[] = [];
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

async function shot(page: Page, state: string, width: number, note?: string) {
  const file = `${state}-${width}.png`;
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(out, file), fullPage: true });
  shots.push({ state, width, file, ok: true, ...(note ? { note } : {}) });
  log({ step: "shot", state, width });
}

async function attempt(state: string, width: number, page: Page, run: () => Promise<void>) {
  try {
    await run();
  } catch (e) {
    const file = `${state}-${width}-miss.png`;
    await page.screenshot({ path: join(out, file), fullPage: true }).catch(() => undefined);
    shots.push({ state, width, file, ok: false, note: String(e).split("\n").slice(0, 6).join(" | ") });
    log({ step: "miss", state, width, why: String(e).split("\n")[0] });
  }
}

const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

async function signedOut(width: number) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
  context.setDefaultTimeout(60_000);
  const page = await context.newPage();
  await attempt("stats", width, page, async () => {
    await page.goto(`${base}/stats`, { waitUntil: "load" });
    await expect(page.getByText("Wallets that made a call").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Receipt/ }).first()).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await shot(page, "stats", width);
  });
  await attempt("news", width, page, async () => {
    await page.goto(`${base}/news`, { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "The wire" })).toBeVisible();
    expect(await page.locator("main ol li").count()).toBeGreaterThan(5);
    expect(await noHorizontalScroll(page)).toBe(true);
    await shot(page, "news", width);
  });
  await attempt("status", width, page, async () => {
    await page.goto(`${base}/status`, { waitUntil: "load" });
    await expect(page.getByText(/All systems running|Something is behind/)).toBeVisible();
    await shot(page, "status", width);
  });
  await attempt("leaderboard", width, page, async () => {
    await page.goto(`${base}/leaderboard`, { waitUntil: "load" });
    await settle(page);
    await expect(page.getByRole("list", { name: "Ranked wallets" })).toBeVisible({ timeout: 60_000 });
    await shot(page, "leaderboard-pnl-week", width);
    await page.getByRole("radio", { name: "ROI" }).click();
    await page.getByRole("radio", { name: "All time" }).click();
    await expect(page.getByRole("radio", { name: "All time" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText(/ranked wallets? · .* settled rounds?/)).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await shot(page, "leaderboard-roi-all", width);
  });
  await attempt("edge-signed-out", width, page, async () => {
    await page.goto(`${base}/portfolio/edge`, { waitUntil: "load" });
    await settle(page);
    await expect(page.getByText("See the trader your history reveals.")).toBeVisible({ timeout: 60_000 });
    await shot(page, "edge-signed-out", width);
  });
  await browser.close();
}

async function signedIn(width: number) {
  const s = await openTerminalSession({ width });
  const { page } = s;
  let opened = false;
  await attempt("call", width, page, async () => {
    await signUpFromTour(s, base, "BTC", "s5-pages");
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
    opened = true;
    s.log({ step: "opened", txs: s.txs });
  });
  if (!opened) return void (await s.browser.close());
  await attempt("share", width, page, async () => {
    // The position's details → Share: the card is drawn in the browser, then Download saves the same PNG.
    if (width < 768) await page.locator(".tm-view").first().click({ timeout: 60_000 });
    const row = page.locator(".tm-pos:visible").filter({ hasText: "Up BTC" }).first();
    await expect(row).toBeVisible({ timeout: 120_000 });
    await row.locator(".tm-pos-open-btn").click();
    const share = modal(page).getByRole("button", { name: "Share", exact: true });
    await expect(share).toBeEnabled({ timeout: 60_000 });
    await share.click();
    await expect(page.getByRole("img", { name: /^Share card: BTC UP/ })).toBeVisible({ timeout: 30_000 });
    await shot(page, "share", width, "the share modal over the position's details");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download" }).click();
    await (await download).saveAs(join(out, `share-card-${width}.png`));
    shots.push({ state: "share-card", width, file: `share-card-${width}.png`, ok: true, note: "the PNG Download saved" });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  });
  await attempt("edge-open", width, page, async () => {
    await page.goto(`${base}/portfolio/edge`, { waitUntil: "load" });
    await settle(page);
    await expect(page.getByText(/open Windows? (is|are) still waiting to settle/)).toBeVisible({ timeout: 90_000 });
    await shot(page, "edge-open", width, "the call's Window still running");
  });
  await attempt("edge-report", width, page, async () => {
    // A 5m Window settles a few minutes after its lock; the report reads the index, revalidated on the stream.
    await expect(async () => {
      await page.reload({ waitUntil: "load" });
      await expect(page.getByText("Net result")).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 12 * 60_000, intervals: [30_000] });
    await expect(page.getByText(/1 settled ·/)).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
    await shot(page, "edge-report", width, "after the call's Window settled");
  });
  await attempt("leaderboard-you", width, page, async () => {
    // The board is recomputed every few minutes; the account's row appears on the next snapshot.
    await expect(async () => {
      await page.goto(`${base}/leaderboard`, { waitUntil: "load" });
      await settle(page);
      await page.getByRole("radio", { name: "Daily" }).click();
      await expect(page.locator('[aria-current="true"]').first()).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 10 * 60_000, intervals: [45_000] });
    await shot(page, "leaderboard-you", width, "the account's own row, highlighted");
  });
  await s.browser.close();
}

for (const width of widths) await signedOut(width);
await signedIn(widths[0]!);
writeFileSync(join(out, "s5-pages.json"), JSON.stringify(shots, null, 2));
const missed = shots.filter((x) => !x.ok);
log({ step: "done", shots: shots.length, missed: missed.map((m) => `${m.state}-${m.width}`) });
process.exit(missed.length ? 1 : 0);
