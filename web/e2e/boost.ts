/**
 * S10c gate: Boost end to end in a browser against real Moderato, with a Chrome virtual authenticator.
 * One ceremony signs up (faucet-funded); /markets: a crypto 5m Window, the ticket's Boost mode, 2× on the 29217 slider,
 * the reserve's own sizing over the S8 maker vault's rested depth, "Hold to boost" (one passkey prompt, sponsored —
 * `[approve(reserve, stake), open(…, spotProof)]` with the signed RedStone payload), the receipt; then the boost on
 * /portfolio settles after the Window answers (or is cashed out). Prints every tx for `cast receipt`.
 * Run `scripts/drive/parlay-live.ts maker` beside it (the depth and the house supply).
 *
 *   pnpm --filter @cwf/web exec tsx e2e/boost.ts --base http://localhost:3110 --out <dir> [--width 390|1440]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3110");
const out = arg("out", "boost-out");
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

/** /markets → the crypto 5m lane → a Window's side on its card (the ticket opens on it, the hero follows it). */
async function openCrypto(side: "UP" | "DOWN"): Promise<boolean> {
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  const lane = page.getByRole("tab", { name: /^Crypto .*5m/ }).first();
  if (!(await expect(lane).toBeVisible({ timeout: 60_000 }).then(() => true, () => false))) return false;
  await lane.click();
  const bet = page.getByRole("button", { name: new RegExp(`^Bet ${side} · (BTC|ETH|SOL) · \\d+¢`) }).first();
  if (!(await expect(bet).toBeVisible({ timeout: 60_000 }).then(() => true, () => false))) return false;
  await bet.click();
  return true;
}

let failed = false;
try {
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel(/Name this passkey/).fill(`s10 boost ${width}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
  note({ step: "signed-up", prompts: assertions });
  await page.keyboard.press("Escape");

  // The Range mode's band on the hero chart (S10b, E.1): a crypto 5m Window picked from its lane becomes the hero, the
  // ticket switches to Range, the chart draws the band's two dashed price lines (canvas-drawn: the screenshot is the
  // evidence).
  if (await openCrypto("UP")) {
    await page.getByRole("button", { name: "Range", exact: true }).last().click();
    const low = page.getByRole("slider", { name: /Band low/ }).last();
    await expect(low).toBeVisible({ timeout: 90_000 }).catch(() => undefined);
    await page.waitForTimeout(6_000);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(out, `hero-band-${width}.png`) });
    note({ step: "hero-band", slider: await low.count(), value: await low.getAttribute("aria-valuetext").catch(() => null) });
  } else note({ step: "hero-band", skipped: "no crypto Window priced" });

  let boostTx: string | null = null;
  const deadline = Date.now() + 10 * 60_000;
  while (!boostTx && Date.now() < deadline) {
    if (!(await openCrypto(Math.random() < 0.5 ? "UP" : "DOWN"))) {
      note({ step: "no-crypto-window" });
      await page.waitForTimeout(20_000);
      continue;
    }
    await page.getByRole("button", { name: "Boost", exact: true }).last().click();
    const cta = page.getByRole("button", { name: /^Hold to boost/ }).last();
    if (!(await expect(cta).toBeVisible({ timeout: 60_000 }).then(() => true, () => false))) {
      const blocked = await page.locator("button[disabled]").filter({ hasText: /boost|book|reserve|model|void|Sizing|lock|decided|healthy/i }).last().innerText().catch(() => "?");
      note({ step: "boost-not-priceable", cta: blocked });
      await page.screenshot({ path: join(out, `boost-blocked-${width}-${Date.now()}.png`), fullPage: true });
      await page.waitForTimeout(20_000);
      continue;
    }
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    note({ step: "axe-boost", violations: axe.violations.map((v) => `${v.id}:${v.nodes.length}`) });
    await page.screenshot({ path: join(out, `boost-priced-${width}.png`), fullPage: true });
    const before = assertions;
    const t0 = Date.now();
    await hold(page, cta);
    const receipt = page.getByRole("link", { name: /View the transaction/ }).last();
    const failure = page.getByRole("alert").filter({ hasText: /Nothing was taken|moved|Money|Try again|checking/ }).last();
    await expect(receipt.or(failure)).toBeVisible({ timeout: 120_000 });
    if (await receipt.isVisible()) {
      boostTx = await receipt.getAttribute("href");
      note({ step: "boost-placed", ms: Date.now() - t0, prompts: assertions - before, tx: boostTx, text: (await page.getByRole("status").filter({ hasText: /Boost #/ }).first().innerText().catch(() => "")).slice(0, 200) });
      await page.screenshot({ path: join(out, `boost-placed-${width}.png`), fullPage: true });
    } else {
      await failure.getByText(/Technical details/i).first().click().catch(() => undefined);
      note({ step: "boost-failed", text: (await failure.innerText()).slice(0, 700) });
    }
  }
  if (!boostTx) throw new Error("no boost placed within 10 minutes");

  const end = Date.now() + settleWaitMin * 60_000;
  while (Date.now() < end) {
    await page.goto(`${base}/portfolio`, { waitUntil: "load" });
    await settle(page);
    await page.waitForTimeout(12_000);
    const card = page.getByRole("article", { name: /boosted #/ }).first();
    const text = await card.innerText().catch(() => "");
    const settleBtn = card.getByRole("button", { name: /^Settle$/ });
    if (await settleBtn.isVisible().catch(() => false)) {
      const before = assertions;
      await settleBtn.click();
      await page.waitForTimeout(15_000);
      note({ step: "boost-settled", prompts: assertions - before });
      continue;
    }
    if (/Settled|Knocked out|Cashed out/i.test(text)) {
      note({ step: "boost-final", text: text.replace(/\n/g, " · ").slice(0, 300) });
      break;
    }
    note({ step: "waiting", text: text.replace(/\n/g, " · ").slice(0, 160) });
    await page.waitForTimeout(30_000);
  }
  await page.screenshot({ path: join(out, `portfolio-boost-${width}.png`), fullPage: true });
} catch (error) {
  failed = true;
  note({ step: "error", message: String(error).slice(0, 400) });
  await page.screenshot({ path: join(out, `error-${width}.png`), fullPage: true }).catch(() => undefined);
} finally {
  note({ step: "done", consoleErrors: errors.slice(0, 10), assertions });
  writeFileSync(join(out, `boost-${width}.json`), JSON.stringify(log, null, 2));
  await browser.close();
}
if (failed) process.exit(1);
