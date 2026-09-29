/**
 * S4 gate (1): the first call end to end with a Chrome virtual authenticator against real Moderato (plan §2.4 flow
 * targets). One passkey ceremony signs up (faucet, no second prompt), one more arms the wallet-mode key in the same modal
 * (D-046/D-047), then every call is a tap with ZERO WebAuthn assertions: calls on several Windows (crypto 5m + 24/7 stock
 * lanes, both sides, so the verdicts include wins and losses), measured tap → Call card; a burst of rapid taps (X21);
 * the key on /settings/account; then the pinned cards walk to their verdicts and the settler's auto-pay ("Paid
 * automatically" / "Not this time" / "Returned") with no prompt. Prints every tx hash for `cast receipt`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/first-call.ts --base http://localhost:3104 --out <dir> [--width 390|1440] [--stock]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Page } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3104");
const out = arg("out", "first-call-out");
const width = Number(arg("width", "390"));
/** Also take a call on a Regular (NYSE-session) stock lane — only during 13:30–20:00 UTC on a trading day. */
const stockSession = process.argv.includes("--stock");
const verdictWaitMin = Number(arg("verdict-min", "16"));
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
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});
let assertions = 0;
cdp.on("WebAuthn.credentialAsserted", () => { assertions += 1; });

async function openLane(p: Page, label: RegExp) {
  await p.getByRole("tab", { name: label }).first().click();
}

/** One call from a lane card: tap the side on the card → the ticket (rail or slide-over) → stake → confirm. */
async function call(p: Page, lane: RegExp, asset: string, side: "UP" | "DOWN", stake: string) {
  await openLane(p, lane);
  const ticker = p.getByRole("radio", { name: asset, exact: true });
  if (await ticker.count()) await ticker.first().click();
  await p.getByRole("button", { name: new RegExp(`^Bet ${side} · ${asset} ·`) }).first().click();
  const ticket = p.getByRole("region", { name: "Your call", exact: true }).last();
  await expect(ticket).toBeVisible({ timeout: 20_000 });
  const amount = ticket.getByLabel("Bet amount in dollars");
  await amount.fill(stake);
  const cta = ticket.getByRole("button", { name: new RegExp(`^Buy ${side} for \\$`) });
  await expect(cta).toBeEnabled({ timeout: 45_000 });
  const before = assertions;
  const t0 = Date.now();
  await cta.click();
  const pressed = Date.now() - t0;
  await expect(ticket.getByText(/Call placed/)).toBeVisible({ timeout: 45_000 });
  const tapToCallMs = Date.now() - t0;
  const tx = await ticket.getByRole("link", { name: /verify on the Tempo explorer/ }).getAttribute("href");
  note({ step: "call", asset, side, stake, tapToCallMs, pressedMs: pressed, prompts: assertions - before, tx });
  await ticket.getByRole("button", { name: "Place another" }).click();
  if (width < 1024) await p.keyboard.press("Escape");
  return { tapToCallMs, prompts: assertions - before, tx };
}

let failed = false;
try {
  // 1. Cold visit → one ceremony → funded → armed.
  const tCold = Date.now();
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
  await page.getByLabel(/Name this passkey/).fill(`s4 gate ${width}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 90_000 });
  const afterSignUp = assertions;
  await page.screenshot({ path: join(out, `onboard-funded-${width}.png`) });
  await dialog.getByRole("button", { name: "Arm tap-trading" }).click();
  await expect(dialog.getByText("Tap-trading is on.")).toBeVisible({ timeout: 30_000 });
  note({ step: "armed", ceremonyAssertions: afterSignUp, armAssertions: assertions - afterSignUp });
  await page.screenshot({ path: join(out, `onboard-armed-${width}.png`) });
  const axeModal = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
  if (axeModal.violations.length) note({ step: "axe-modal", violations: axeModal.violations.map((v) => v.id) });
  await dialog.getByRole("button", { name: "Go to Markets" }).click();
  await expect(dialog).toBeHidden();

  // 2. Calls — crypto and 24/7 stock lanes, both sides; the first publishes the key (sponsored, D-136).
  const calls = [
    await call(page, /^Crypto 5m/, "BTC", "UP", "1"),
    await call(page, /^Crypto 5m/, "ETH", "DOWN", "1"),
    await call(page, /^Crypto 5m/, "SOL", "UP", "1"),
    await call(page, /^24\/7 5m/, "TSLA", "DOWN", "1"),
    await call(page, /^24\/7 5m/, "AAPL", "UP", "1"),
  ];
  if (stockSession) calls.push(await call(page, /^5m/, "NVDA", "UP", "1"));
  note({ step: "cold-to-first-call", ms: calls[0]!.tapToCallMs, sinceColdMs: Date.now() - tCold });

  // 3. Rapid taps (X21): three more calls back to back on one Window, remembered stake.
  const rapid = [];
  for (let i = 0; i < 3; i++) rapid.push(await call(page, /^Crypto 5m/, "BTC", i % 2 ? "DOWN" : "UP", "1"));
  const all = [...calls, ...rapid];
  const sorted = all.map((c) => c.tapToCallMs).sort((a, b) => a - b);
  note({ step: "taps", count: all.length, p50Ms: sorted[Math.floor(sorted.length / 2)], maxMs: sorted.at(-1), promptsTotal: all.reduce((s, c) => s + c.prompts, 0) });

  // 4. The key on the trust surface.
  await page.goto(`${base}/settings/account`, { waitUntil: "load" });
  await settle(page);
  await expect(page.getByText("Tap-trading key on this device").first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: join(out, `settings-key-${width}.png`), fullPage: true });
  note({ step: "key-listed" });

  // 5. Verdicts pinned and paid with no prompt: wait for every card to reach its end state.
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  const promptsBeforeVerdicts = assertions;
  const deadline = Date.now() + verdictWaitMin * 60_000;
  let seen = { paid: 0, lost: 0, returned: 0, collected: 0 };
  while (Date.now() < deadline) {
    const section = page.getByRole("region", { name: "Your calls", exact: true });
    seen = {
      paid: await section.getByText("Paid automatically").count(),
      lost: await section.getByText("Not this time").count(),
      returned: await section.getByText("Returned").count(),
      collected: await section.getByText("Collected").count(),
    };
    if (seen.paid > 0 && seen.lost > 0) break;
    await page.waitForTimeout(20_000);
  }
  await page.screenshot({ path: join(out, `verdicts-${width}.png`), fullPage: true });
  const payoutTx = await page.getByRole("region", { name: "Your calls", exact: true }).getByRole("link", { name: /^0x/ }).evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).href));
  note({ step: "verdicts", ...seen, verdictPrompts: assertions - promptsBeforeVerdicts, payoutTx });
  if (seen.paid === 0) throw new Error("no win reached 'Paid automatically' in time");
  if (errors.length) note({ step: "console-errors", errors: errors.slice(0, 5) });
} catch (error) {
  failed = true;
  await page.screenshot({ path: join(out, `fail-${width}.png`), fullPage: true }).catch(() => undefined);
  note({ step: "FAIL", message: (error as Error).message.split("\n")[0] });
}
writeFileSync(join(out, `first-call-${width}.json`), JSON.stringify(log, null, 2));
await browser.close();
if (failed) process.exit(1);
