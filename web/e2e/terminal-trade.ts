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
import { chromium, expect } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "terminal-trade-out");
const symbol = arg("symbol", "BTC");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
context.setDefaultTimeout(90_000);
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
let assertions = 0;
cdp.on("WebAuthn.credentialAsserted", () => { assertions += 1; });
const txs: string[] = [];
page.on("response", async (r) => {
  if (r.request().method() !== "POST") return;
  const body = r.request().postData() ?? "";
  if (!body.includes("eth_sendRawTransaction")) return;
  const text = await r.text().catch(() => "");
  const m = /"transactionHash"\s*:\s*"(0x[0-9a-f]{64})"/.exec(text) ?? /"result"\s*:\s*"(0x[0-9a-f]{64})"/.exec(text);
  if (m) { txs.push(m[1]!); console.log(JSON.stringify({ step: "tx", hash: m[1] })); }
});
const toastTitles = () => page.locator('[data-slot="toast-title"]').allInnerTexts();
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

let failed = false;
try {
  await page.goto(`${base}/trade/${symbol}`, { waitUntil: "load" });
  await settle(page);
  // The first visit's tour, all five steps, ends in "Start trading": the real sign-up (D-191).
  const tour = page.getByRole("dialog");
  await expect(tour.getByText("Watch the market")).toBeVisible({ timeout: 120_000 });
  for (let i = 0; i < 4; i++) await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Start trading" }).click();
  log({ step: "tour", ok: true });
  await page.getByLabel(/Name this passkey/).fill(`terminal ${Date.now()}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
  await dialog.getByRole("button", { name: "Arm tap-trading" }).click();
  await expect(dialog.getByText("Tap-trading is on.")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  log({ step: "signed-up", prompts: assertions });

  // A $1 stake keeps each run small (the faucet's balance would default the size to 5 % of $1M).
  await page.locator(".tm-stack").click();
  await page.getByRole("dialog").getByRole("button", { name: "Min" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tm-stack-value").first()).toContainText("$1.00");

  // UP, one tap, once the button says what it pays (a quote on the live book) and nothing blocks it. A Window spends its
  // first 30–60 s waiting for the opening print and its last 30 s closed to entries: wait through both.
  const up = page.locator(".tm-btn").filter({ hasText: "UP" }).first();
  const waitStart = Date.now();
  for (;;) {
    const state = await page.evaluate(() => ({
      chip: document.querySelector(".tm-window-state")?.textContent ?? null,
      note: document.querySelector("#tm-note-up")?.textContent ?? null,
      sub: document.querySelector(".tm-btn-sub")?.textContent ?? null,
    }));
    log({ step: "waiting", s: Math.round((Date.now() - waitStart) / 1000), ...state });
    if (state.note === "" && state.sub) break;
    if (Date.now() - waitStart > 420_000) throw new Error(`UP never opened for entry: ${JSON.stringify(state)}`);
    await page.waitForTimeout(10_000);
  }
  await expect(up.locator(".tm-btn-sub")).toContainText(/pays/, { timeout: 30_000 });
  const before = assertions;
  const t0 = Date.now();
  await up.click();
  await expect.poll(toastTitles, { timeout: 90_000 }).toContainEqual(expect.stringMatching(new RegExp(`Up ${symbol} opened|Price moved|Nothing filled|didn't go through|Waiting for the chain`)));
  const opened = (await toastTitles()).some((t) => t.includes("opened"));
  log({ step: "open", ok: opened, ms: Date.now() - t0, prompts: assertions - before, toasts: await toastTitles() });
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
  await page.getByRole("dialog").getByRole("button", { name: "TP / SL" }).click();
  const exits = page.getByRole("dialog").filter({ hasText: "Take profit" });
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
} catch (e) {
  failed = true;
  log({ step: "error", message: (e as Error).message.split("\n")[0] });
  await page.screenshot({ path: join(out, "error.png") }).catch(() => undefined);
} finally {
  writeFileSync(join(out, "txs.json"), JSON.stringify(txs, null, 2));
  await browser.close();
}
process.exitCode = failed ? 1 : 0;
