/**
 * S7 gate: tap-trading from the Trading Balance with a Chrome virtual authenticator against real Moderato. One passkey
 * ceremony signs up (faucet); the ceremony's arm slot offers the Trading Balance and ONE more assertion sets it aside
 * (`[approve, depositAndGrant]`, self-paid); then taps sign with the session key — ZERO assertions, sponsored by the
 * relay; a call over the per-tap cap is refused on the CTA with its reason (no prompt, nothing sent); add to budget and
 * extend (one assertion each); a tap whose tab is killed mid-send is reconciled on the next page by `validBefore`; the
 * grant on /settings/account; a partial withdraw with Max and its inline reason; the calls' verdicts paid into the
 * Trading Balance by the settler's crank; stop (revoke). Prints every tx for `cast receipt`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/trading-balance.ts --base http://localhost:3107 --out <dir> [--width 390]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3107");
const out = arg("out", "trading-balance-out");
const width = Number(arg("width", "390"));
const verdictWaitMin = Number(arg("verdict-min", "14"));
mkdirSync(out, { recursive: true });

const log: Record<string, unknown>[] = [];
const note = (entry: Record<string, unknown>) => {
  log.push({ atMs: Date.now(), ...entry });
  console.log(JSON.stringify(entry));
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 }, hasTouch: width < 768 });
const page = await context.newPage();
const errors: string[] = [];
const watch = (p: Page) => p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
watch(page);
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
let assertions = 0;
cdp.on("WebAuthn.credentialAsserted", () => { assertions += 1; });

async function axe(p: Page, name: string, include?: string) {
  const builder = new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa"]);
  const r = await (include ? builder.include(include) : builder).analyze();
  note({ step: "axe", name, violations: r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" ; ")}`) });
}

async function closeTicket(p: Page) {
  if (width >= 1024) return;
  const dialog = p.getByRole("dialog");
  if (!(await dialog.count())) return;
  await p.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 5_000 }).catch(() => undefined);
}

/** Opens a ticket on the first of `assets` in a crypto lane with a live card; returns the ticket region. */
async function openTicket(p: Page, assets: string[], side: "UP" | "DOWN"): Promise<Locator | null> {
  for (const asset of assets) {
    await p.getByRole("tab", { name: /^Crypto 5m/ }).first().click();
    const ticker = p.getByRole("radio", { name: asset, exact: true });
    if (await ticker.count()) await ticker.first().click();
    const bet = p.getByRole("button", { name: new RegExp(`^Bet ${side} · ${asset} ·`) }).first();
    if (!(await expect(bet).toBeVisible({ timeout: 90_000 }).then(() => true, () => false))) continue;
    await bet.click();
    const ticket = p.getByRole("region", { name: "Your call", exact: true }).last();
    await expect(ticket).toBeVisible({ timeout: 20_000 });
    return ticket;
  }
  return null;
}

/** One tap from the Trading Balance: stake → the CTA → the Call card; counts WebAuthn assertions (must be 0). */
async function tap(p: Page, assets: string[], side: "UP" | "DOWN", stake: string) {
  for (let pass = 0; pass < 4; pass++) {
    const ticket = await openTicket(p, assets, side);
    if (!ticket) continue;
    await ticket.getByLabel("Bet amount in dollars").fill(stake);
    const cta = ticket.getByRole("button", { name: new RegExp(`^Buy ${side} for \\$`) });
    if (!(await expect(cta).toBeEnabled({ timeout: 75_000 }).then(() => true, () => false))) {
      note({ step: "not-placed", side, text: (await ticket.getByRole("button").filter({ hasText: /Budget|cap|Over|liquidity|quote|expired/ }).first().innerText().catch(() => "?")).slice(0, 90) });
      await closeTicket(p);
      continue;
    }
    const footnote = await ticket.getByText(/Signed by your tap-trading key/).count();
    const before = assertions;
    const t0 = Date.now();
    await cta.click();
    await p.waitForTimeout(600);
    await p.screenshot({ path: join(out, `after-click-${t0}.png`) }).catch(() => undefined);
    const placed = ticket.getByText(/Call placed/);
    const other = ticket.getByRole("status").filter({ hasText: /Nothing filled|book moved|Waiting for the chain/ }).or(ticket.getByRole("alert"));
    // A Window that closes for entries mid-tap moves the ticket to the next one and resets it (S4 behaviour); the
    // absorbed tap then answers nothing here — wait it out and tap again on the next Window.
    await expect(placed.or(other).first()).toBeVisible({ timeout: 45_000 }).catch(() => undefined);
    const ms = Date.now() - t0;
    if (!(await placed.isVisible())) {
      await p.screenshot({ path: join(out, `not-placed-${Date.now()}.png`) }).catch(() => undefined);
      if (await ticket.getByText(/moved you to the next/).count()) await p.waitForTimeout(20_000);
      const cta2 = (await ticket.innerText().catch(() => "")).split("\n").filter((l) => /Buy|Confirm|Signing|Sent|Waiting|Budget|cap|Try/.test(l)).slice(0, 4).join(" | ");
      const tech = ticket.getByText("Technical details");
      if (await tech.count()) await tech.first().click().catch(() => undefined);
      const all = await ticket.innerText().catch(() => "");
      const technical = all.slice(all.indexOf("Technical details"), all.indexOf("Technical details") + 400);
      note({ step: "not-placed", side, ms, text: (await other.first().innerText().catch(() => "")).slice(0, 160), ticket: cta2, technical, prompts: assertions - before, errors: errors.slice(-3) });
      await closeTicket(p);
      continue;
    }
    const tx = await ticket.getByRole("link", { name: /verify on the Tempo explorer/ }).getAttribute("href");
    note({ step: "tap", side, stake, ms, prompts: assertions - before, viaBalance: footnote > 0, tx });
    await ticket.getByRole("button", { name: "Place another" }).click();
    await closeTicket(p);
    return { ms, prompts: assertions - before, tx };
  }
  throw new Error(`${side}: no fill`);
}

/** The allowance pill's figure, as read by a screen reader. */
const pillText = (p: Page) => p.locator('[aria-label^="Tap-trading:"]').first().getAttribute("aria-label", { timeout: 10_000 }).catch(() => null);

let failed = false;
try {
  // 1. Cold visit → one ceremony → funded → the arm slot's Trading Balance → one assertion.
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel(/Name this passkey/).fill(`s7 gate ${width}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 90_000 });
  const afterSignUp = assertions;
  const choice = dialog.getByRole("radio", { name: "Trading Balance" });
  if (await choice.count()) await choice.click();
  await expect(dialog.getByText(/Set aside \$25 and every tap signs with no prompt/)).toBeVisible();
  await page.screenshot({ path: join(out, `arm-${width}.png`) });
  await axe(page, "arm-modal", '[role="dialog"]');
  // The caps presets (21st 23552) behind "Adjust": $1 taps — a per-tap cap the thin testnet book can exceed.
  await dialog.getByText(/^Adjust —/).click();
  await dialog.getByRole("radio", { name: "$1 taps" }).click();
  await expect(dialog.getByText(/Set aside \$10 and every tap signs with no prompt/)).toBeVisible();
  await page.screenshot({ path: join(out, `arm-adjust-${width}.png`) });
  await dialog.getByRole("button", { name: /^Set aside \$10$/ }).click();
  const armedOk = await expect(dialog.getByText("Tap-trading is on.")).toBeVisible({ timeout: 90_000 }).then(() => true, () => false);
  if (!armedOk) {
    const details = dialog.getByText(/Technical details/);
    if (await details.count()) await details.first().click().catch(() => undefined);
    const all = await dialog.innerText();
    const at = Math.max(0, all.indexOf("Technical"));
    note({ step: "arm-failed", text: all.slice(Math.max(0, at - 300), at + 700), errors: errors.slice(-5) });
    throw new Error("the arm did not complete");
  }
  note({ step: "armed", ceremonyAssertions: afterSignUp, armAssertions: assertions - afterSignUp });
  await page.screenshot({ path: join(out, `armed-${width}.png`) });
  await dialog.getByRole("button", { name: "Go to Markets" }).click();
  await expect(dialog).toBeHidden();

  // 2. Session-key taps: no prompt, sponsored.
  const taps = [await tap(page, ["BTC", "ETH", "SOL"], "UP", "1"), await tap(page, ["ETH", "SOL", "BTC"], "DOWN", "1"), await tap(page, ["SOL", "BTC", "ETH"], "UP", "1")];
  const sorted = taps.map((t) => t.ms).sort((a, b) => a - b);
  note({ step: "taps", count: taps.length, p50Ms: sorted[1], prompts: taps.reduce((s, t) => s + t.prompts, 0), pill: await pillText(page) });

  // 3. A call over the per-tap cap: the CTA names the reason and the fix; nothing is sent, no prompt.
  let ticket: Locator | null = null;
  for (const asset of ["BTC", "ETH", "SOL"]) {
    ticket = await openTicket(page, [asset], "UP");
    // A Listed Window takes only a scheduled call from the wallet (its own reason on the CTA): try a Trading one.
    if (ticket && !(await ticket.getByText("Your price").count())) break;
    await closeTicket(page);
    ticket = null;
  }
  if (ticket) {
    const before = assertions;
    await ticket.getByLabel("Bet amount in dollars").fill("1.5");
    const refusal = ticket.getByRole("button", { name: /Over your \$1 per tap — lower the stake/ });
    const shown = await expect(refusal).toBeVisible({ timeout: 60_000 }).then(() => true, () => false);
    await page.screenshot({ path: join(out, `cap-refusal-${width}.png`) });
    note({ step: "cap-refusal", shown, disabled: shown ? await refusal.isDisabled() : null, walletChoice: await ticket.getByText(/Pay from your wallet instead · asks your passkey/).count(), prompts: assertions - before });
    await axe(page, "ticket-refusal", '[aria-label="Your call"]');
    await closeTicket(page);
  }

  // 4. The manager: add to budget, extend — one assertion each; the pill reads the new figures.
  await page.getByRole("button", { name: /^Tap-trading: / }).first().click();
  const manager = page.getByRole("dialog", { name: "Tap-trading" });
  await expect(manager.getByText("Spent today")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: join(out, `manager-${width}.png`) });
  await axe(page, "manager", '[role="dialog"]');
  let before = assertions;
  await manager.getByRole("button", { name: /^Add \$[\d.]+ to budget$/ }).click();
  await expect(manager.getByRole("button", { name: /^Add \$[\d.]+ to budget$/ }).or(manager.getByText(/Nothing was taken/)).first()).toBeVisible({ timeout: 90_000 });
  note({ step: "add-to-budget", prompts: assertions - before, pill: await pillText(page) });
  before = assertions;
  const expiryBefore = await manager.getByText(/^Ends|Expires/).first().innerText().catch(() => "");
  await manager.getByRole("button", { name: "Extend 24 h" }).click();
  await expect(manager.getByRole("button", { name: "Extend 24 h" })).toBeEnabled({ timeout: 90_000 });
  await page.waitForTimeout(4_000);
  note({ step: "extend", prompts: assertions - before, pill: await pillText(page), expiryBefore });
  await page.keyboard.press("Escape");

  // 5. Killed tab: a tap whose page closes right after the click; the next page reconciles it by validBefore.
  const killed = await context.newPage();
  watch(killed);
  await killed.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(killed);
  let killedDone = false;
  for (const [asset, side] of [["ETH", "UP"], ["SOL", "DOWN"], ["BTC", "UP"], ["ETH", "DOWN"]] as const) {
    const kt = await openTicket(killed, [asset], side);
    if (!kt) continue;
    await kt.getByLabel("Bet amount in dollars").fill("1");
    const cta = kt.getByRole("button", { name: new RegExp(`^Buy ${side} for \\$`) });
    if (!(await expect(cta).toBeEnabled({ timeout: 45_000 }).then(() => true, () => false))) {
      note({ step: "killed-tab-skip", asset, side });
      await closeTicket(killed);
      continue;
    }
    const t0 = Date.now();
    await cta.click();
    // Kill it once the write is journaled and on its way ("Sent — waiting for the chain"), before any receipt.
    const sent = await expect(kt.getByRole("button", { name: /Sent — waiting for the chain/ })).toBeVisible({ timeout: 20_000 }).then(() => true, () => false);
    await killed.close({ runBeforeUnload: false });
    note({ step: "tab-killed", asset, side, afterMs: Date.now() - t0, sent });
    await page.waitForTimeout(40_000); // past the tap's 25 s validBefore
    const next = await context.newPage();
    watch(next);
    await next.goto(`${base}/markets`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    const toast = next.getByText(/An earlier call landed|An earlier send never reached the chain|still being checked/).first();
    const seen = await expect(toast).toBeVisible({ timeout: 60_000 }).then(() => true, () => false);
    note({ step: "killed-tab-recovery", seen, text: seen ? await toast.innerText() : null });
    await next.screenshot({ path: join(out, `recovery-${width}.png`) });
    await next.close();
    killedDone = true;
    break;
  }
  if (!killedDone) note({ step: "killed-tab-recovery", seen: false, text: "no fillable Window for the killed-tab tap" });

  // 6. The grant on the trust surface.
  await page.goto(`${base}/settings/account`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page);
  await expect(page.getByText(/Tap-trading key · this device/).first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: join(out, `settings-grant-${width}.png`), fullPage: true });
  await axe(page, "settings");
  note({ step: "grant-listed" });

  // 7. Stop it (revoke) from the trust surface: one assertion, sponsored; the unspent budget returns to the balance.
  before = assertions;
  await page.getByRole("button", { name: "Stop", exact: true }).first().click();
  let stopped = await expect(page.getByText(/No live grants/)).toBeVisible({ timeout: 90_000 }).then(() => true, () => false);
  if (!stopped) {
    // The public RPC's per-IP limit can refuse the raw send ("Nothing was taken"): the user's own next step is Stop again.
    const tech = page.getByText("Technical details");
    if (await tech.count()) await tech.first().click().catch(() => undefined);
    const all = await page.locator("body").innerText();
    note({ step: "revoke-first-attempt", text: all.slice(all.indexOf("The network is busy"), all.indexOf("The network is busy") + 120), technical: all.slice(all.indexOf("Details:"), all.indexOf("Details:") + 80) });
    for (let attempt = 2; attempt <= 4 && !stopped; attempt++) {
      await page.waitForTimeout(15_000);
      await page.getByRole("button", { name: "Stop", exact: true }).first().click();
      stopped = await expect(page.getByText(/No live grants/)).toBeVisible({ timeout: 90_000 }).then(() => true, () => false);
      note({ step: "revoke-attempt", attempt, stopped });
    }
  }
  await page.screenshot({ path: join(out, `settings-stopped-${width}.png`), fullPage: true });
  note({ step: "revoke", stopped, prompts: assertions - before, history: await page.getByText(/Stopped grants/).count() });

  // 8. Portfolio: add money, then a partial withdraw with Max and its inline reason.
  await page.goto(`${base}/portfolio`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await settle(page);
  const field = page.getByLabel("Withdraw to your account");
  await expect(field).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Max" }).last()).toBeEnabled({ timeout: 60_000 });
  await field.fill("99999");
  const reason = await page.getByRole("alert").filter({ hasText: /Your Trading Balance has \$[\d.,]+ free/ }).first().innerText().catch(() => null);
  await page.getByRole("button", { name: "Max" }).last().click();
  const max = await field.inputValue();
  await field.fill("3");
  before = assertions;
  await page.getByRole("button", { name: /^Withdraw \$3$/ }).click();
  const withdrawn = await expect(page.getByText("Withdrawn to your account.")).toBeVisible({ timeout: 90_000 }).then(() => true, () => false);
  await page.screenshot({ path: join(out, `portfolio-${width}.png`), fullPage: true });
  await axe(page, "portfolio");
  note({ step: "partial-withdraw", reason, max, withdrawn, prompts: assertions - before });

  // 9. Verdicts paid into the Trading Balance by the settler's crank, no prompt.
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  before = assertions;
  const deadline = Date.now() + verdictWaitMin * 60_000;
  let seen = { paid: 0, lost: 0 };
  while (Date.now() < deadline) {
    const section = page.getByRole("region", { name: "Your calls", exact: true });
    seen = { paid: await section.getByText("Paid into your Trading Balance").count(), lost: await section.getByText("Not this time").count() };
    if (seen.paid > 0 && seen.paid + seen.lost >= taps.length) break;
    await page.waitForTimeout(20_000);
  }
  await page.screenshot({ path: join(out, `verdicts-${width}.png`), fullPage: true });
  note({ step: "verdicts", ...seen, prompts: assertions - before });
  if (errors.length) note({ step: "console-errors", errors: errors.slice(0, 8) });
} catch (error) {
  failed = true;
  await page.screenshot({ path: join(out, `fail-${width}.png`) }).catch(() => undefined);
  note({ step: "FAIL", message: (error as Error).message.split("\n").slice(0, 6).join(" | ") });
}
writeFileSync(join(out, `trading-balance-${width}.json`), JSON.stringify(log, null, 2));
await browser.close();
if (failed) process.exit(1);
