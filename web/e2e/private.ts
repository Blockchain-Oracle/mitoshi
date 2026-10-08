/**
 * S10d gate: a private bet end to end in a browser against real Moderato, with a Chrome virtual authenticator.
 * One ceremony signs up (faucet-funded); /portfolio's private desk (27122 swap ticket) moves money from the wallet into
 * the private balance (`[approve(desk), depositAndAllow]`, self-paid — intake is never sponsored); the /markets ticket's
 * Private route on a crypto 5m Window: the named refusals before any prompt (over the per-bet cap), then "Hold to bet
 * … privately" — ONE passkey prompt over the bet's text (a committed secret, D-171) and the desk places it (charge →
 * fund → mint, its own fees); the claim appears under the account, verified against the key the contract pins; after the
 * Window answers, Cash out (the desk settles, sweeps and credits); then a withdraw back to the wallet (sponsored).
 * Run `scripts/drive/parlay-live.ts maker` beside it (the depth).
 *
 *   pnpm --filter @cwf/web exec tsx e2e/private.ts --base http://localhost:3110 --out <dir> [--width 390|1440]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3110");
const out = arg("out", "private-out");
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

async function axe(label: string, include?: string) {
  let a = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]);
  if (include) a = a.include(include);
  const r = await a.analyze();
  note({ step: `axe-${label}`, violations: r.violations.map((v) => `${v.id}:${v.nodes.length} ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`) });
}

async function desk(): Promise<Locator> {
  await page.goto(`${base}/portfolio`, { waitUntil: "load" });
  await settle(page);
  const section = page.getByRole("region", { name: "Private desk" });
  await expect(section).toBeVisible({ timeout: 90_000 });
  await section.scrollIntoViewIfNeeded();
  return section;
}

/** /markets → the crypto 5m lane → a Window's Up on its card → Up/Down → Private. */
async function privateTicket(): Promise<boolean> {
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  const lane = page.getByRole("tab", { name: /^Crypto .*5m/ }).first();
  if (!(await expect(lane).toBeVisible({ timeout: 60_000 }).then(() => true, () => false))) return false;
  await lane.click();
  const bet = page.getByRole("button", { name: /^Bet UP · (BTC|ETH|SOL) · \d+¢/ }).first();
  if (!(await expect(bet).toBeVisible({ timeout: 60_000 }).then(() => true, () => false))) return false;
  await bet.click();
  await page.getByRole("button", { name: "Private", exact: true }).last().click();
  return true;
}

let failed = false;
try {
  await page.goto(`${base}/portfolio`, { waitUntil: "load" });
  await settle(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel(/Name this passkey/).fill(`s10 private ${width}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByRole("dialog").getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
  note({ step: "signed-up", prompts: assertions });
  await page.keyboard.press("Escape");

  // 1. Wallet → private balance on the 27122 swap ticket (self-paid).
  let section = await desk();
  await section.getByLabel("You pay", { exact: true }).fill("10");
  const move = section.getByRole("button", { name: /^Move \$10\.00 to private$/ });
  await expect(move).toBeEnabled({ timeout: 60_000 });
  await axe("desk", "section[aria-label='Private desk']");
  await page.screenshot({ path: join(out, `desk-${width}.png`), fullPage: true });
  let before = assertions;
  await move.click();
  await expect(section.getByText("$10.00").first()).toBeVisible({ timeout: 120_000 });
  note({ step: "deposited", prompts: assertions - before, cells: (await section.locator(".pv-cells").innerText()).replace(/\n/g, " · ") });

  // 2. The Private route on a crypto 5m Window: the cap refusal first, then one prompt.
  let placed = false;
  const deadline = Date.now() + 8 * 60_000;
  while (!placed && Date.now() < deadline) {
    if (!(await privateTicket())) { note({ step: "no-crypto-window" }); await page.waitForTimeout(20_000); continue; }
    const amount = page.getByLabel("Your stake").last();
    await amount.fill("30");
    const cap = page.getByRole("button", { name: /Private bets are capped at/ }).last();
    note({ step: "cap-refusal", shown: await cap.isVisible({ timeout: 20_000 }).catch(() => false) });
    await amount.fill("2");
    const cta = page.getByRole("button", { name: /^Hold to bet (Up|Down) privately/ }).last();
    if (!(await expect(cta).toBeVisible({ timeout: 60_000 }).then(() => true, () => false))) {
      note({ step: "private-not-ready", cta: await page.locator("button[disabled]").filter({ hasText: /Private|book|Sizing|balance|desk|lock|stake/ }).last().innerText().catch(() => "?") });
      await page.screenshot({ path: join(out, `private-blocked-${width}-${Date.now()}.png`), fullPage: true });
      await page.waitForTimeout(20_000);
      continue;
    }
    await axe("private-ticket", ".tk-ticket");
    await page.screenshot({ path: join(out, `private-priced-${width}.png`), fullPage: true });
    before = assertions;
    const t0 = Date.now();
    await hold(page, cta);
    const placedCard = page.getByRole("status").filter({ hasText: /Private bet placed/ }).last();
    const failure = page.getByRole("alert").filter({ hasText: /not placed|hasn't answered/ }).last();
    await expect(placedCard.or(failure)).toBeVisible({ timeout: 180_000 });
    if (await placedCard.isVisible()) {
      placed = true;
      note({ step: "private-placed", ms: Date.now() - t0, prompts: assertions - before, text: (await placedCard.innerText()).replace(/\n/g, " · "), tx: await placedCard.getByRole("link").getAttribute("href").catch(() => null) });
      await page.screenshot({ path: join(out, `private-placed-${width}.png`), fullPage: true });
    } else {
      await failure.locator("summary").click().catch(() => undefined);
      note({ step: "private-refused", text: (await failure.innerText()).slice(0, 600) });
    }
  }
  if (!placed) throw new Error("no private bet placed within 8 minutes");

  // 3. The claim under the account, verified; cash out once the Window answered.
  const end = Date.now() + settleWaitMin * 60_000;
  let cashed = false;
  while (!cashed && Date.now() < end) {
    section = await desk();
    await page.waitForTimeout(6_000);
    const claim = section.getByRole("article").first();
    const text = (await claim.innerText().catch(() => "")).replace(/\n/g, " · ");
    if (/home/.test(text)) { note({ step: "claim-final", text }); cashed = true; break; }
    const btn = claim.getByRole("button", { name: "Cash out" });
    if (await btn.isVisible().catch(() => false)) {
      before = assertions;
      await btn.click();
      await page.waitForTimeout(20_000);
      note({ step: "cash-out", prompts: assertions - before, text: (await claim.innerText().catch(() => "")).replace(/\n/g, " · ").slice(0, 300) });
      continue;
    }
    note({ step: "waiting", text: text.slice(0, 200) });
    await page.waitForTimeout(30_000);
  }
  await axe("desk-claims", "section[aria-label='Private desk']");
  await page.screenshot({ path: join(out, `claims-${width}.png`), fullPage: true });

  // 4. Private balance → wallet (sponsored).
  section = await desk();
  await section.getByRole("button", { name: "Flip pay and receive" }).click();
  await section.getByRole("button", { name: /Max/ }).first().click();
  const withdraw = section.getByRole("button", { name: /^Withdraw \$[\d.,]+ to your wallet$/ });
  await expect(withdraw).toBeEnabled({ timeout: 30_000 });
  before = assertions;
  await withdraw.click();
  await expect(section.locator(".pv-cells").getByText("$0.00").first()).toBeVisible({ timeout: 120_000 });
  note({ step: "withdrawn", prompts: assertions - before, cells: (await section.locator(".pv-cells").innerText()).replace(/\n/g, " · ") });
} catch (error) {
  failed = true;
  note({ step: "error", message: String(error).slice(0, 400) });
  await page.screenshot({ path: join(out, `error-${width}.png`), fullPage: true }).catch(() => undefined);
} finally {
  note({ step: "done", consoleErrors: errors.slice(0, 10), assertions });
  writeFileSync(join(out, `private-${width}.json`), JSON.stringify(log, null, 2));
  await browser.close();
}
if (failed) process.exit(1);
