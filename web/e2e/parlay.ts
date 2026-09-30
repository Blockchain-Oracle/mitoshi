/**
 * S10a gate: the parlay slip end to end in a browser against real Moderato, with a Chrome virtual authenticator.
 * One ceremony signs up (faucet-funded), then /parlay: two legs added from the Windows list (the 24524 arc into the
 * slip), the chain's quote over the S8 maker vault's rested depth, the PD-2 model beside each leg, "Hold to place"
 * (one passkey prompt, sponsored — `[approve(reserve), openParlay(…, spotProofs)]` with the signed RedStone payloads
 * `/api/prices/redstone-payload` served), the receipt; then the ticket settles leg by leg in close order (D-108) and a
 * won ticket is claimed. Prints every tx for `cast receipt`. Run `scripts/drive/parlay-live.ts maker` beside it.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/parlay.ts --base http://localhost:3110 --out <dir> [--width 390|1440]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Page } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3110");
const out = arg("out", "parlay-out");
const width = Number(arg("width", "390"));
const settleWaitMin = Number(arg("settle-min", "14"));
mkdirSync(out, { recursive: true });
const log: Record<string, unknown>[] = [];
const note = (e: Record<string, unknown>) => { log.push({ atMs: Date.now(), ...e }); console.log(JSON.stringify(e)); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && !/api\/stream|status of 503/.test(m.text()) && errors.push(m.text().slice(0, 240)));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
let assertions = 0;
cdp.on("WebAuthn.credentialAsserted", () => { assertions += 1; });

const phone = width < 1024;
async function openSlip(p: Page) {
  if (!phone) return p.getByRole("complementary", { name: "Slip" });
  await p.getByRole("button", { name: /Review slip/ }).click();
  return p.getByRole("dialog");
}
async function hold(p: Page, name: RegExp) {
  const btn = p.getByRole("button", { name }).first();
  await btn.scrollIntoViewIfNeeded();
  const box = (await btn.boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(2_300);
  await p.mouse.up();
}

let failed = false;
try {
  await page.goto(`${base}/parlay`, { waitUntil: "load" });
  await settle(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel(/Name this passkey/).fill(`s10 parlay ${width}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
  note({ step: "signed-up", prompts: assertions });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 }).catch(() => undefined);

  // Two legs on the vault-quoted crypto Windows, from the list; wait until the chain prices the slip.
  const deadline = Date.now() + 8 * 60_000;
  let placedTx: string | null = null;
  while (Date.now() < deadline && !placedTx) {
    await page.goto(`${base}/parlay`, { waitUntil: "load" });
    await settle(page);
    const ups = page.getByRole("button", { name: /^Add Up on (BTC|ETH|SOL)/ });
    await expect(ups.first()).toBeVisible({ timeout: 90_000 });
    await ups.nth(0).click();
    await page.getByRole("button", { name: /^Add Up on (BTC|ETH|SOL)/ }).nth(1).click();
    const slip = await openSlip(page);
    await page.waitForTimeout(1_000);
    await page.screenshot({ path: join(out, `slip-${width}-${Date.now()}.png`), fullPage: !phone });
    // Pick each leg's side the book prices at or above the model: flip a leg the CTA names as under the model.
    for (let attempt = 0; attempt < 6; attempt++) {
      const place = slip.getByRole("button", { name: /^Hold to place/ });
      if (await place.isVisible().catch(() => false)) break;
      const cta = await slip.getByRole("button", { name: /Leg \d is priced under|Pricing|thin|reserve|Quote unavailable|Signed prices/ }).first().innerText().catch(() => "");
      const under = /Leg (\d) is priced under/.exec(cta);
      if (under) await slip.getByRole("radio", { name: /Down/ }).nth(Number(under[1]) - 1).click();
      note({ step: "slip-state", cta });
      await page.waitForTimeout(12_000);
    }
    const place = slip.getByRole("button", { name: /^Hold to place/ });
    if (!(await place.isVisible().catch(() => false))) {
      note({ step: "not-priceable-yet", cta: await slip.getByRole("button").filter({ hasText: /Leg|Pricing|thin|reserve|unavailable/ }).first().innerText().catch(() => "?") });
      await page.waitForTimeout(30_000);
      continue;
    }
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    note({ step: "axe-slip", violations: axe.violations.map((v) => `${v.id}:${v.nodes.length}`) });
    await page.screenshot({ path: join(out, `slip-priced-${width}.png`), fullPage: !phone });
    const label = await place.innerText();
    const before = assertions;
    const t0 = Date.now();
    await hold(page, /^Hold to place/);
    const receipt = slip.getByRole("link", { name: "View the transaction" });
    const failure = slip.getByRole("alert").filter({ hasText: /Nothing was taken|moved|Money|Try again|checking/ });
    await expect(receipt.or(failure).first()).toBeVisible({ timeout: 120_000 });
    if (await receipt.isVisible()) {
      placedTx = await receipt.getAttribute("href");
      note({ step: "placed", label, ms: Date.now() - t0, prompts: assertions - before, tx: placedTx, text: await slip.getByRole("status").first().innerText().catch(() => "") });
      await page.screenshot({ path: join(out, `placed-${width}.png`), fullPage: !phone });
    } else {
      note({ step: "place-failed", text: (await failure.innerText()).slice(0, 300) });
      await page.screenshot({ path: join(out, `place-failed-${width}-${Date.now()}.png`) });
    }
  }
  if (!placedTx) throw new Error("no parlay placed within 8 minutes");
  if (phone) await page.keyboard.press("Escape");

  // Settlement: the next leg's Settle (sponsored), then the claim; a later leg waits its turn.
  const end = Date.now() + settleWaitMin * 60_000;
  for (;;) {
    await page.goto(`${base}/parlay`, { waitUntil: "load" });
    await settle(page);
    await page.waitForTimeout(10_000);
    const tickets = page.getByRole("article");
    const text = await tickets.first().innerText().catch(() => "");
    const settleBtn = tickets.first().getByRole("button", { name: /^Settle$/ });
    const claimBtn = tickets.first().getByRole("button", { name: /^Claim/ });
    if (await claimBtn.isVisible().catch(() => false)) {
      const before = assertions;
      await claimBtn.click();
      await expect(tickets.first().getByText(/Paid out to your wallet/)).toBeVisible({ timeout: 120_000 });
      note({ step: "claimed", prompts: assertions - before, text: (await tickets.first().innerText()).slice(0, 300) });
      break;
    }
    if (await settleBtn.isVisible().catch(() => false)) {
      const before = assertions;
      await settleBtn.click();
      await page.waitForTimeout(15_000);
      note({ step: "settled-leg", prompts: assertions - before, text: text.slice(0, 300) });
      continue;
    }
    if (/Lost|Voided|Paid/.test(text) || Date.now() > end) {
      note({ step: "ticket-final", text: text.slice(0, 400) });
      break;
    }
    note({ step: "waiting", text: text.slice(0, 160) });
    await page.waitForTimeout(30_000);
  }
  await page.screenshot({ path: join(out, `tickets-${width}.png`), fullPage: true });
} catch (error) {
  failed = true;
  note({ step: "error", message: String(error).slice(0, 400) });
  await page.screenshot({ path: join(out, `error-${width}.png`), fullPage: true }).catch(() => undefined);
} finally {
  note({ step: "done", consoleErrors: errors.slice(0, 10), assertions });
  writeFileSync(join(out, `parlay-${width}.json`), JSON.stringify(log, null, 2));
  await browser.close();
}
if (failed) process.exit(1);
