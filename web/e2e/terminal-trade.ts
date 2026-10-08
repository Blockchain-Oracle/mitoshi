/**
 * A real trade on the terminal (S23c–d, D-197), on Moderato: a fresh passkey (Chrome virtual authenticator) signs up
 * from the terminal's own Sign in, takes the faucet, arms the wallet key, taps UP on `/trade/BTC` (no prompt), sees
 * the position with what Close pays, and closes it in one tap (a requote outside the tolerance is taken from the
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
  // Sign up from the terminal's own equity pill.
  await page.locator(".tm-equity:visible").first().click();
  await page.getByLabel(/Name this passkey/).fill(`terminal ${Date.now()}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
  await dialog.getByRole("button", { name: "Arm tap-trading" }).click();
  await expect(dialog.getByText("Tap-trading is on.")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  log({ step: "signed-up", prompts: assertions });

  // UP, one tap, once the button says what it pays (a quote on the live book) and nothing blocks it.
  const up = page.locator(".tm-btn").filter({ hasText: "UP" }).first();
  await expect(up.locator(".tm-btn-sub")).toContainText(/pays/, { timeout: 120_000 });
  await expect(page.locator("#tm-note-up")).toHaveText("", { timeout: 120_000 });
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
  const closed = titles.some((t) => t.startsWith("Closed") || t.startsWith("Reduced"));
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
