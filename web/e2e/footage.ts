/**
 * Footage for the product demo video (S20, `docs/submission/demo-script.md`): the real flow on the deployed site from
 * a fresh account, paced for a voice-over, recorded as video at a desk (1440) and a phone (390) size. Nothing is
 * staged: the passkey is a CDP virtual authenticator, the dollars come from the faucet, every trade is a transaction
 * on Tempo testnet (hashes printed). The beats: landing → sign-up and arm → a tap UP → the P&L moving → CLOSE → TP / SL
 * and the share card → Range mode → history → the leaderboard → a Window's proof re-verified in the browser → proof of
 * demand (`/stats`). A beat that can't happen (no Window open yet) is waited for, never faked.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/footage.ts --base https://testnet.mitoshi.xyz --out <dir> [--width 1440|390]
 */
import { mkdirSync, readdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { modal, openTerminalSession, signUpFromTour, stakeMin, waitEnterable } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "footage-out");
const widths = process.argv.includes("--width") ? [Number(arg("width", "1440"))] : [1440, 390];
mkdirSync(out, { recursive: true });

/** A pause the narration can sit in. */
const hold = (page: { waitForTimeout: (ms: number) => Promise<void> }, s: number) => page.waitForTimeout(s * 1000);

for (const width of widths) {
  const dir = join(out, `raw-${width}`);
  mkdirSync(dir, { recursive: true });
  const s = await openTerminalSession({ width, videoDir: dir });
  const { page, log } = s;
  try {
    // The landing, then into the app.
    await page.goto(base, { waitUntil: "load" });
    await hold(page, 4);
    await page.mouse.wheel(0, 900);
    await hold(page, 4);
    await page.mouse.wheel(0, -900);
    await hold(page, 1);
    // Sign-up from the terminal's tour: a passkey, the faucet, one-tap armed.
    await signUpFromTour(s, base, "BTC", "Footage");
    await stakeMin(page);
    await hold(page, 2);
    // A tap UP on the Window on screen.
    await waitEnterable(s, "up");
    await hold(page, 3);
    const up = page.locator(".tm-btn").filter({ hasText: "UP" }).first();
    await up.click();
    // A phone lists positions behind the "View position" pill; a desk beside the chart.
    const opened = width < 768 ? page.locator(".tm-view").first() : page.locator(".tm-pos:visible").filter({ hasText: "Up BTC" }).first();
    await expect(opened).toBeVisible({ timeout: 60_000 });
    log({ step: "tapped-up" });
    await hold(page, 8);
    // CLOSE in one tap.
    await page.locator(".tm-buttons .tm-btn").filter({ hasText: "CLOSE" }).first().click();
    await expect(page.locator('[data-slot="toast-title"]').filter({ hasText: /Closed/ }).first()).toBeVisible({ timeout: 60_000 });
    log({ step: "closed" });
    await hold(page, 4);
    // Another position, its details and TP / SL.
    await waitEnterable(s, "up");
    await up.click();
    await expect(opened).toBeVisible({ timeout: 60_000 });
    await hold(page, 2);
    // A phone keeps the new position behind the "View position" pill, which appears once the position is read.
    if (width < 768) await page.locator(".tm-view").first().click({ timeout: 60_000 });
    const second = page.locator(".tm-pos:visible").filter({ hasText: "Up BTC" }).first();
    await expect(second).toBeVisible({ timeout: 120_000 });
    await second.locator(".tm-pos-open-btn").click();
    await hold(page, 3);
    // The share card from the same details: PnL · ROI · Both, Download, Share on X.
    const share = modal(page).getByRole("button", { name: "Share", exact: true });
    await expect(share).toBeEnabled({ timeout: 60_000 });
    await share.click();
    await expect(page.getByRole("img", { name: /^Share card:/ })).toBeVisible({ timeout: 30_000 });
    await hold(page, 5);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    await modal(page).getByRole("button", { name: "TP / SL" }).click();
    await hold(page, 5);
    for (let i = 0; i < 4 && (await modal(page).count()) > 0; i++) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(700);
    }
    // Range mode with its band on the chart.
    await page.getByRole("tab", { name: "Range" }).click().catch(() => undefined);
    await hold(page, 6);
    await page.getByRole("tab", { name: "Up / Down" }).click().catch(() => undefined);
    // The history.
    await page.locator(".tm-equity:visible").first().click();
    await modal(page).getByRole("button", { name: "Trade history" }).first().click();
    await hold(page, 6);
    // The leaderboard, in the same drawer.
    await modal(page).getByRole("button", { name: "Back" }).click();
    await modal(page).getByRole("button", { name: "Leaderboard" }).first().click();
    await expect(modal(page).getByRole("list", { name: "Ranked wallets" })).toBeVisible({ timeout: 60_000 });
    await hold(page, 5);
    await page.keyboard.press("Escape");
    // A settled BTC Window's proof, re-verified in this browser from the chain alone.
    const listed = (await (await page.request.get(`${base}/api/index/markets?symbol=BTC&state=resolved&limit=1`)).json()) as { rows?: { market: string }[] } | { market: string }[];
    const market = (Array.isArray(listed) ? listed : listed.rows ?? [])[0]?.market;
    if (market) {
      await page.goto(`${base}/proof/${market}`, { waitUntil: "load" });
      await hold(page, 3);
      await page.getByRole("button", { name: "Re-verify in this browser" }).last().click();
      await expect(page.getByText(/Verified now:/).first()).toBeVisible({ timeout: 60_000 });
      await hold(page, 5);
    }
    // Proof of demand: wallets that made a call, read from the engine's fills.
    await page.goto(`${base}/stats`, { waitUntil: "load" });
    await hold(page, 5);
    await page.mouse.wheel(0, 1_100);
    await hold(page, 4);
    log({ step: "done", txs: s.txs.length, prompts: s.assertions() });
  } catch (e) {
    log({ step: "stopped", width, why: (e as Error).message.split("\n")[0] });
  } finally {
    await s.context.close();
    await s.browser.close();
    // One video per page: name it by width so the artifact reads as footage-1440.webm / footage-390.webm.
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".webm"))) renameSync(join(dir, f), join(out, `footage-${width}-${f}`));
  }
}
