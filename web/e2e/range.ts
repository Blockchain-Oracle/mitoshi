/**
 * S10b gate: Range and Moonshot end to end in a browser against real Moderato, with a Chrome virtual authenticator.
 * One ceremony signs up (faucet-funded); /games/range: a band on a crypto 5m Window priced by the chain over the S8
 * maker vault's rested depth, "Hold to place" (one passkey prompt, sponsored — `[approve(reserve), openRange(…,
 * spotProof)]` with the signed RedStone payload from `/api/prices/redstone-payload`), the receipt; /games/moonshot: a
 * long ×2 fired the same way; the Range mode in the /markets ticket with the band drawn on the hero chart; then the
 * rounds settle (anyone, once the engine answers) and a won round is claimed. Prints every tx for `cast receipt`.
 * Run `scripts/drive/parlay-live.ts maker` beside it (the depth and the house supply).
 *
 *   pnpm --filter @cwf/web exec tsx e2e/range.ts --base http://localhost:3110 --out <dir> [--width 390|1440]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3110");
const out = arg("out", "range-out");
const width = Number(arg("width", "390"));
const settleWaitMin = Number(arg("settle-min", "12"));
mkdirSync(out, { recursive: true });
const log: Record<string, unknown>[] = [];
const note = (e: Record<string, unknown>) => { log.push({ atMs: Date.now(), ...e }); console.log(JSON.stringify(e)); };

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
const page = await context.newPage();
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && !/api\/stream|status of (503|429)/.test(m.text()) && errors.push(m.text().slice(0, 240)));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
let assertions = 0;
cdp.on("WebAuthn.credentialAsserted", () => { assertions += 1; });

async function hold(p: Page, btn: Locator) {
  await btn.scrollIntoViewIfNeeded();
  const box = (await btn.boundingBox())!;
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(2_300);
  await p.mouse.up();
}

/** Waits for the hold CTA (priced) on `route`, then places; retries through thin books and rolled Windows. */
async function placeOn(route: string, label: string, holdName: RegExp): Promise<string | null> {
  const deadline = Date.now() + 8 * 60_000;
  while (Date.now() < deadline) {
    await page.goto(`${base}${route}`, { waitUntil: "load" });
    await settle(page);
    const cta = page.getByRole("button", { name: holdName }).first();
    if (!(await expect(cta).toBeVisible({ timeout: 90_000 }).then(() => true, () => false))) {
      const blocked = await page.locator("button[disabled]").filter({ hasText: /band|book|Pricing|reserve|price|lock|shot|sure|Window/ }).first().innerText().catch(() => "?");
      note({ step: `${label}-not-priceable`, cta: blocked });
      await page.waitForTimeout(20_000);
      continue;
    }
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    note({ step: `axe-${label}`, violations: axe.violations.map((v) => `${v.id}:${v.nodes.length}`) });
    await page.screenshot({ path: join(out, `${label}-priced-${width}.png`), fullPage: true });
    const before = assertions;
    const t0 = Date.now();
    const text = await cta.innerText();
    await hold(page, cta);
    const receipt = page.getByRole("link", { name: /View the transaction/ }).first();
    const failure = page.getByRole("alert").filter({ hasText: /Nothing was taken|moved|Money|Try again|checking/ }).first();
    await expect(receipt.or(failure)).toBeVisible({ timeout: 120_000 });
    if (await receipt.isVisible()) {
      const tx = await receipt.getAttribute("href");
      note({ step: `${label}-placed`, cta: text.split("\n")[0], ms: Date.now() - t0, prompts: assertions - before, tx });
      await page.screenshot({ path: join(out, `${label}-placed-${width}.png`), fullPage: true });
      return tx;
    }
    await failure.getByText(/Technical details/i).first().click().catch(() => undefined);
    note({ step: `${label}-failed`, text: (await failure.innerText()).slice(0, 700) });
  }
  return null;
}

let failed = false;
try {
  await page.goto(`${base}/games/range`, { waitUntil: "load" });
  await settle(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel(/Name this passkey/).fill(`s10 range ${width}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
  note({ step: "signed-up", prompts: assertions });
  await page.keyboard.press("Escape");

  const rangeTx = await placeOn("/games/range", "range", /^Hold to place/);
  const moonTx = await placeOn("/games/moonshot", "moonshot", /^Hold to fire/);

  // The markets ticket's Range mode: the band on the hero chart.
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  await page.getByRole("button", { name: /^Bet UP · (BTC|ETH|SOL) ·/ }).first().click().catch(() => undefined);
  await page.getByRole("button", { name: "Range", exact: true }).first().click().catch(() => undefined);
  await page.waitForTimeout(20_000);
  await page.screenshot({ path: join(out, `markets-range-mode-${width}.png`), fullPage: true });
  note({ step: "markets-range-mode", bandLines: await page.getByText(/band (low|high)/).count() });

  // Settlement: Settle on each answered round, then Claim a won one.
  const end = Date.now() + settleWaitMin * 60_000;
  let settled = 0;
  while (Date.now() < end && (rangeTx || moonTx)) {
    await page.goto(`${base}/games/range`, { waitUntil: "load" });
    await settle(page);
    await page.waitForTimeout(10_000);
    const claim = page.getByRole("button", { name: /^Claim \$/ }).first();
    if (await claim.isVisible().catch(() => false)) {
      const before = assertions;
      await claim.click();
      await expect(page.getByText(/Paid out to your wallet/).first()).toBeVisible({ timeout: 120_000 });
      note({ step: "claimed", prompts: assertions - before });
      continue;
    }
    const settleBtn = page.getByRole("button", { name: /^Settle$/ }).first();
    if (await settleBtn.isVisible().catch(() => false)) {
      const before = assertions;
      await settleBtn.click();
      await page.waitForTimeout(15_000);
      settled += 1;
      note({ step: "settled-round", prompts: assertions - before });
      continue;
    }
    const live = await page.getByText(/^In play$/).count();
    if (live === 0 && settled > 0) break;
    note({ step: "waiting", live });
    await page.waitForTimeout(30_000);
  }
  await page.screenshot({ path: join(out, `rounds-${width}.png`), fullPage: true });
  note({ step: "rounds", text: (await page.getByRole("article").allInnerTexts()).map((t) => t.replace(/\n/g, " · ").slice(0, 200)) });
} catch (error) {
  failed = true;
  note({ step: "error", message: String(error).slice(0, 400) });
  await page.screenshot({ path: join(out, `error-${width}.png`), fullPage: true }).catch(() => undefined);
} finally {
  note({ step: "done", consoleErrors: errors.slice(0, 10), assertions });
  writeFileSync(join(out, `range-${width}.json`), JSON.stringify(log, null, 2));
  await browser.close();
}
if (failed) process.exit(1);
