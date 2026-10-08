/**
 * A real trade on the terminal (S23c–d, D-197), on Moderato: a fresh passkey (Chrome virtual authenticator) signs up
 * from the first visit's tour ("Start trading", D-191), takes the faucet, arms the wallet key, taps UP on `/trade/BTC` (no prompt), sees
 * the position with what Close pays, sets a take-profit and stop-loss in the TP/SL drawer (ROI preset, Change % view,
 * a refused P&L stop, a valid one), and closes it in one tap (a requote outside the tolerance is taken from the
 * toast's "Close for $X"). Every transaction hash the relay sends is printed for `cast receipt`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/terminal-trade.ts --base https://testnet.mitoshi.xyz --out <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { openTerminalSession, signUpFromTour, stakeMin, waitEnterable, modal } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "terminal-trade-out");
const symbol = arg("symbol", "BTC");
mkdirSync(out, { recursive: true });

const session = await openTerminalSession();
const { page, txs, toastsSeen, log } = session;
const toastTitles = () => page.locator('[data-slot="toast-title"]').allInnerTexts();

let failed = false;
try {
  await signUpFromTour(session, base, symbol, "terminal");
  // A $1 stake keeps each run small (the faucet's balance would default the size to 5 % of $1M).
  await stakeMin(page);

  // UP, one tap, once the button says what it pays (a quote on the live book) and nothing blocks it. A Window spends its
  // first 30–60 s waiting for the opening print and its last 30 s closed to entries: wait through both.
  const up = page.locator(".tm-btn").filter({ hasText: "UP" }).first();
  await waitEnterable(session, "up");
  await expect(up.locator(".tm-btn-sub")).toContainText(/pays/, { timeout: 30_000 });
  const before = session.assertions();
  const t0 = Date.now();
  await up.click();
  await expect.poll(toastTitles, { timeout: 90_000 }).toContainEqual(expect.stringMatching(new RegExp(`Up ${symbol} opened|Price moved|Nothing filled|didn't go through|Waiting for the chain`)));
  const opened = (await toastTitles()).some((t) => t.includes("opened"));
  log({ step: "open", ok: opened, ms: Date.now() - t0, prompts: session.assertions() - before, toasts: await toastTitles() });
  if (!opened) throw new Error("UP did not open");
  await page.screenshot({ path: join(out, "opened.png") });

  // The position, valued at what Close pays, and the buttons now TRAIL / CLOSE.
  const row = page.locator(".tm-pos").filter({ hasText: `Up ${symbol}` }).first();
  await expect(row).toBeVisible({ timeout: 90_000 });
  await expect(row.locator(".tm-pos-figure")).toContainText("$", { timeout: 60_000 });
  log({ step: "valued", figure: await row.locator(".tm-pos-figure").innerText() });
  const close = page.locator(".tm-buttons .tm-btn").filter({ hasText: "CLOSE" });
  await expect(close).toBeVisible();
  await page.screenshot({ path: join(out, "valued.png") });

  // TP/SL (RV-51, D-200) from the position's details: Tradash's tabs, linked inputs, caption and checks, on what Close pays.
  await row.locator(".tm-pos-open-btn").click();
  await modal(page).getByRole("button", { name: "TP / SL" }).click();
  const exits = modal(page).filter({ hasText: "Take profit" });
  await expect(exits).toBeVisible();
  const tp = exits.getByRole("group", { name: "Take profit" });
  const sl = exits.getByRole("group", { name: "Stop loss" });
  await tp.getByRole("button", { name: "+50%" }).click();
  const tpCaption = await tp.locator("p").innerText();
  await exits.getByRole("tab", { name: "Change %" }).click();
  const tpChange = await tp.getByLabel("Change %").inputValue();
  await exits.getByRole("tab", { name: "P&L" }).click();
  await sl.getByLabel("P&L").fill("5");
  const slError = await sl.getByRole("alert").innerText();
  await sl.getByLabel("P&L").fill("-0.5");
  const slCaption = await sl.locator("p").innerText();
  await page.screenshot({ path: join(out, "exits.png") });
  await exits.getByRole("button", { name: "Set" }).click();
  log({ step: "exits", tpCaption, tpChange, slError, slCaption, toasts: await toastTitles() });

  // CLOSE, one tap; a requote outside the tolerance offers "Close for $X".
  const t1 = Date.now();
  await close.click();
  await expect.poll(toastTitles, { timeout: 90_000 }).toContainEqual(expect.stringMatching(new RegExp(`Closed ${symbol}|Reduced ${symbol}|Price moved|Nothing sold|No bids|didn't go through|Waiting for the chain`)));
  let titles = await toastTitles();
  if (titles.some((t) => t === "Price moved")) {
    log({ step: "close-requote", toasts: titles });
    await page.getByRole("button", { name: /^Close for \$/ }).first().click();
    await expect.poll(toastTitles, { timeout: 90_000 }).toContainEqual(expect.stringMatching(new RegExp(`Closed ${symbol}|Reduced ${symbol}`)));
    titles = await toastTitles();
  }
  // A stop-loss set above may fire first: its own close is the same one-tap Close.
  const closed = titles.some((t) => t.startsWith("Closed") || t.startsWith("Reduced") || / hit · /.test(t));
  log({ step: "close", ok: closed, ms: Date.now() - t1, toasts: titles, body: await page.locator('[data-slot="toast-description"]').allInnerTexts() });
  await page.screenshot({ path: join(out, "closed.png") });
  if (!closed) throw new Error("CLOSE did not close");
  await expect(row).toBeHidden({ timeout: 60_000 }).catch(() => log({ step: "row-still-listed (index lag)" }));

  // The install drawer from Account (RV-91): the browser's own install state, `/download` one link away.
  await page.locator(".tm-equity:visible").first().click();
  await modal(page).getByRole("button", { name: "Install app" }).click();
  const install = modal(page).filter({ hasText: "Install Mitoshi" });
  await expect(install).toBeVisible();
  log({ step: "install", body: (await install.innerText()).split("\n").slice(0, 6) });
  log({ step: "toasts-seen", toasts: await toastsSeen() });
  await page.screenshot({ path: join(out, "install.png") });
} catch (e) {
  failed = true;
  log({ step: "error", message: (e as Error).message.split("\n")[0] });
  await page.screenshot({ path: join(out, "error.png") }).catch(() => undefined);
} finally {
  writeFileSync(join(out, "txs.json"), JSON.stringify(txs, null, 2));
  await session.browser.close();
}
process.exitCode = failed ? 1 : 0;
