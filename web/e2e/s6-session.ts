/**
 * The S6 gate's live check (D-207: the product checked live, no UI test suite), from a CI runner like the other drivers.
 * Signed out, at each width, it records what the deployed terminal says about the hour on a stock: the session cell
 * beside the Window chip, the crowd and earnings lines, each lane's Window state (Regular, 24/7 with its provider label,
 * the weekend Gap), the halt banner when one holds, the markets drawer's "Paused" rows, `/status/halts` and the
 * `/markets` lanes. Every state's words and the instant they were read land in `s6-session.json` with a screenshot; the
 * gate reads them against the session they were taken in (closed / pre / open / after hours / a halt / the Gap).
 *
 *   pnpm --filter @cwf/web exec tsx e2e/s6-session.ts --base https://testnet.mitoshi.xyz --out <dir> [--widths 1440,390] [--symbol TSLA]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type Page } from "@playwright/test";
import { openTerminal } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "s6-session-out");
const widths = arg("widths", "1440,390").split(",").map(Number);
const symbol = arg("symbol", "TSLA");
mkdirSync(out, { recursive: true });

type Capture = { state: string; width: number; atIso: string; file: string; ok: boolean; words?: Record<string, unknown>; note?: string };
const captures: Capture[] = [];
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

async function capture(page: Page, state: string, width: number, run: () => Promise<Record<string, unknown>>) {
  const atIso = new Date().toISOString();
  try {
    const words = await run();
    const file = `${state}-${width}.png`;
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(out, file), fullPage: false });
    captures.push({ state, width, atIso, file, ok: true, words });
    log({ step: "capture", state, width, ...words });
  } catch (e) {
    const file = `${state}-${width}-miss.png`;
    await page.screenshot({ path: join(out, file) }).catch(() => undefined);
    captures.push({ state, width, atIso, file, ok: false, note: String(e).split("\n").slice(0, 6).join(" | ") });
    log({ step: "miss", state, width, why: String(e).split("\n")[0] });
  }
}

/** The words the terminal shows about the hour and the Window on screen. */
const terminalWords = (page: Page) =>
  page.evaluate(() => ({
    lane: document.querySelector(".tm-lane[aria-pressed=true]")?.textContent ?? null,
    window: document.querySelector(".tm-window-state")?.textContent ?? null,
    cells: [...document.querySelectorAll(".tm-session")].map((c) => c.getAttribute("aria-label") ?? c.textContent),
    notes: [...document.querySelectorAll(".tm-note")].map((n) => n.textContent),
    banner: document.querySelector(".tm-side [role=alert]")?.textContent ?? null,
    underButtons: [...document.querySelectorAll(".tm-btn-note")].map((n) => n.textContent),
  }));

async function lane(page: Page, key: string, width: number, state: string) {
  await capture(page, state, width, async () => {
    await page.goto(`${base}/trade/${symbol}?lane=${key}`, { waitUntil: "load" });
    // The session cell arrives with the stream's `session` event; the chip once the lane's Windows are read.
    await expect(page.locator(".tm-session").first()).toBeVisible({ timeout: 90_000 });
    await expect(page.locator(".tm-window-state")).not.toHaveText("", { timeout: 60_000 });
    await page.waitForTimeout(3_000);
    return terminalWords(page);
  });
}

async function run(width: number) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
  context.setDefaultTimeout(60_000);
  const page = await context.newPage();
  await openTerminal(page, base, symbol);
  await lane(page, "regular:300", width, "regular-5m");
  await lane(page, "stock24:300", width, "stock24-5m");
  await lane(page, "gap:604800", width, "gap");
  await capture(page, "markets-drawer", width, async () => {
    await page.goto(`${base}/trade/${symbol}?d=trade-markets`, { waitUntil: "load" });
    const paused = page.getByRole("region", { name: "Paused" });
    await expect(paused).toContainText("NFLX · Netflix");
    await expect(paused).toContainText("Pre-IPO");
    await paused.scrollIntoViewIfNeeded();
    return { paused: (await paused.textContent()) ?? "" };
  });
  await capture(page, "halts-board", width, async () => {
    await page.goto(`${base}/status/halts`, { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: "Trading halts" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Each ticker's halts" }).getByRole("listitem")).toHaveCount(13);
    const banner = (await page.locator("main p").filter({ hasText: /halts now|Halted now/ }).first().textContent()) ?? "";
    const history = (await page.locator("details summary").textContent()) ?? "";
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(scroll).toBe(true);
    return { banner, history };
  });
  await capture(page, "markets", width, async () => {
    await page.goto(`${base}/markets`, { waitUntil: "load" });
    const lanes = page.getByRole("tablist", { name: "Market length" });
    await expect(lanes).toBeVisible({ timeout: 60_000 });
    const tabs = await lanes.getByRole("tab").allTextContents();
    return { tabs };
  });
  await browser.close();
}

for (const width of widths) await run(width);
writeFileSync(join(out, "s6-session.json"), JSON.stringify({ base, symbol, captures }, null, 2));
const missed = captures.filter((c) => !c.ok);
log({ step: "done", captures: captures.length, missed: missed.length });
process.exitCode = missed.length ? 1 : 0;
