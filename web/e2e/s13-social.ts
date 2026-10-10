/**
 * S13's live check on the deployed build (D-207: the product checked live, no UI test suite), from a CI runner like the
 * other drivers — the in-app browser pane is hidden, so the shared clock never starts there. Signed out, at each width:
 * `/reels` (its cards, the position pill, one swipe, a take card if any), the terminal's Sensei drawer (its on or off
 * state as the server says), the price-alerts drawer and `/settings/notifications`. Words and screenshots land in
 * `s13-social.json`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/s13-social.ts --base https://testnet.mitoshi.xyz --out <dir> [--widths 390,1440]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { openTerminal } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "s13-social-out");
const widths = arg("widths", "390,1440").split(",").map(Number);
mkdirSync(out, { recursive: true });

type Capture = { state: string; width: number; atIso: string; file: string; ok: boolean; words?: Record<string, unknown>; note?: string };
const captures: Capture[] = [];

async function capture(page: Page, state: string, width: number, run: () => Promise<Record<string, unknown>>) {
  const atIso = new Date().toISOString();
  const file = `${state}-${width}.png`;
  try {
    const words = await run();
    await page.screenshot({ path: join(out, file) });
    captures.push({ state, width, atIso, file, ok: true, words });
    console.log(JSON.stringify({ state, width, ok: true, words }));
  } catch (e) {
    await page.screenshot({ path: join(out, file) }).catch(() => undefined);
    captures.push({ state, width, atIso, file, ok: false, note: String(e).slice(0, 300) });
    console.log(JSON.stringify({ state, width, ok: false, note: String(e).slice(0, 300) }));
  }
}

const browser = await chromium.launch();
for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
  context.setDefaultTimeout(60_000);
  const page = await context.newPage();

  await capture(page, "reels", width, async () => {
    await page.goto(`${base}/reels`, { waitUntil: "load" });
    const slides = page.locator('[aria-roledescription="slide"]');
    await slides.first().waitFor({ state: "visible", timeout: 45_000 });
    const first = (await slides.first().innerText()).replace(/\s+/g, " ").slice(0, 200);
    return { cards: await slides.count(), first, position: await page.locator(".reel-count").innerText() };
  });

  await capture(page, "reels-swiped", width, async () => {
    await page.locator(".feed-snap").evaluate((el) => el.scrollBy({ top: el.clientHeight }));
    await page.waitForTimeout(1_500);
    const take = page.locator(".take-card").first();
    return { position: await page.locator(".reel-count").innerText(), address: new URL(page.url()).search, takeCards: await page.locator(".take-card").count(), firstTake: (await take.count()) ? (await take.innerText()).replace(/\s+/g, " ").slice(0, 160) : null };
  });

  await capture(page, "sensei", width, async () => {
    await openTerminal(page, base, "TSLA");
    await page.getByRole("button", { name: "Ask Sensei" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.waitFor({ state: "visible" });
    await page.waitForTimeout(2_000);
    return { text: (await drawer.innerText()).replace(/\s+/g, " ").slice(0, 300) };
  });

  await capture(page, "alerts", width, async () => {
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Price alerts" }).click();
    const drawer = page.getByRole("dialog");
    await drawer.waitFor({ state: "visible" });
    return { text: (await drawer.innerText()).replace(/\s+/g, " ").slice(0, 300) };
  });

  await capture(page, "settings-notifications", width, async () => {
    await page.goto(`${base}/settings/notifications`, { waitUntil: "load" });
    await page.getByRole("heading", { name: "Notifications", exact: true }).waitFor();
    return { switches: await page.getByRole("switch").count(), text: (await page.locator("main, #content").first().innerText()).replace(/\s+/g, " ").slice(0, 300) };
  });
  await context.close();
}
await browser.close();
writeFileSync(join(out, "s13-social.json"), JSON.stringify(captures, null, 2));
const failed = captures.filter((c) => !c.ok);
console.log(JSON.stringify({ done: true, captures: captures.length, failed: failed.length }));
process.exitCode = failed.length ? 1 : 0;
