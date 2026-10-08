/**
 * S7 gate, re-run on the terminal (S23 gate: "a vault position closed through the sell lane"), with a Chrome virtual
 * authenticator on real Moderato. The tour's sign-up (one ceremony, the faucet); its arm slot sets the Trading Balance
 * aside with ONE more assertion ($1 taps, `[approve, depositAndGrant]`); then on `/trade`:
 *   - UP and DOWN sign with the session key — ZERO assertions, sponsored — and the positions are held in the Trading
 *     Balance (the details drawer says so);
 *   - CLOSE sells one back through the vault's sell lane (`placeFor`, the session key) — ZERO assertions;
 *   - a stake over the $1 per-tap cap is refused under the button in D-160's words, nothing sent, no prompt;
 *   - the grant is listed on /settings/account and stops (one assertion).
 * `--verdict-min N` also waits for the open position's Window to settle into the Trading Balance. Prints every tx.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/trading-balance.ts --base https://testnet.mitoshi.xyz --out <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { settle } from "./lib/settle";
import { tapPhases, openTerminalSession, switchSymbol, waitEnterable, type TerminalSession, modal } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://testnet.mitoshi.xyz");
const out = arg("out", "trading-balance-out");
const width = Number(arg("width", "1440"));
const verdictMin = Number(arg("verdict-min", "0"));
mkdirSync(out, { recursive: true });

const s = await openTerminalSession({ width });
const { page, log } = s;
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const steps: Record<string, unknown>[] = [];
const note = (o: Record<string, unknown>) => (steps.push(o), log(o));

async function axe(p: Page, name: string, include: string) {
  const r = await new AxeBuilder({ page: p }).include(include).withTags(["wcag2a", "wcag2aa"]).analyze();
  if (r.violations.length) note({ step: "axe", name, violations: r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`) });
}

/** One tap on `symbol`: opened with zero prompts, and held in the Trading Balance (its details say so). */
async function tap(t: TerminalSession, symbol: string, side: "up" | "down") {
  await switchSymbol(page, symbol);
  await waitEnterable(t, side, 300_000);
  const before = t.assertions();
  const t0 = Date.now();
  const button = page.locator(".tm-buttons .tm-btn").filter({ hasText: side.toUpperCase() }).first();
  await button.click();
  const opened = page.locator('[data-slot="toast-title"]').filter({ hasText: / opened$/ });
  const refused = page.locator('[data-slot="toast-title"]').filter({ hasText: /Price moved|Nothing filled|didn't go through|Waiting for the chain/ });
  await expect(opened.or(refused).first()).toBeVisible({ timeout: 90_000 });
  const toastMs = Date.now() - t0;
  // A dearer book is a requote (D-208): "Tap again to take it" — once, as a person would.
  if ((await opened.count()) === 0 && /Price moved/.test(await refused.first().innerText().catch(() => ""))) {
    note({ step: "requote", symbol, side, body: await page.locator('[data-slot="toast-description"]').first().innerText().catch(() => "") });
    // The buttons may be between rounds by now (the last 30 s, the next opening print): wait, as a person would.
    await waitEnterable(t, side, 300_000);
    await button.click();
    await expect(opened.first()).toBeVisible({ timeout: 90_000 }).catch(() => undefined);
  }
  const ok = (await opened.count()) > 0;
  const row = page.locator(".tm-side-list .tm-pos").filter({ hasText: `${side === "up" ? "Up" : "Down"} ${symbol}` }).first();
  let heldIn: string | null = null;
  let rowMs = -1;
  if (ok) {
    await expect(row).toBeVisible({ timeout: 60_000 });
    rowMs = Date.now() - t0;
    await row.locator(".tm-pos-open-btn").click();
    const details = modal(page);
    heldIn = await details.locator("dt", { hasText: "Held in" }).locator("xpath=following-sibling::dd").innerText().catch(() => null);
    await page.keyboard.press("Escape");
  }
  note({ step: "tap", symbol, side, ok, ms: Date.now() - t0, toastMs, rowMs, phases: await tapPhases(page), prompts: t.assertions() - before, heldIn });
  if (!ok) throw new Error(`${side} ${symbol}: ${await refused.first().innerText().catch(() => "not opened")}`);
  return row;
}

let failed = false;
try {
  // 1. The tour → one ceremony → funded → the arm slot's Trading Balance at $1 taps → one assertion.
  await page.goto(`${base}/trade/BTC`, { waitUntil: "load" });
  await settle(page);
  const tour = modal(page);
  await expect(tour.getByText("Watch the market")).toBeVisible({ timeout: 120_000 });
  for (let i = 0; i < 4; i++) await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Start trading" }).click();
  await page.getByLabel(/Name this passkey/).fill(`s7 terminal ${width} ${Date.now()}`);
  await page.getByRole("button", { name: "Create my account" }).click();
  const dialog = modal(page);
  await expect(dialog.getByText(/You're funded/)).toBeVisible({ timeout: 120_000 });
  const afterSignUp = s.assertions();
  const choice = dialog.getByRole("radio", { name: "Trading Balance" });
  if (await choice.count()) await choice.click();
  await dialog.getByText(/^Adjust —/).click();
  await dialog.getByRole("radio", { name: "$1 taps" }).click();
  await expect(dialog.getByText(/Set aside \$10 and every tap signs with no prompt/)).toBeVisible();
  await page.screenshot({ path: join(out, `arm-${width}.png`) });
  await axe(page, "arm", '[role="dialog"]');
  await dialog.getByRole("button", { name: /^Set aside \$10$/ }).click();
  await expect(dialog.getByText("Tap-trading is on.")).toBeVisible({ timeout: 120_000 });
  note({ step: "armed", ceremonyAssertions: afterSignUp, armAssertions: s.assertions() - afterSignUp });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await page.locator(".tm-stack").click();
  await modal(page).getByRole("button", { name: "Min" }).click();
  await page.keyboard.press("Escape");

  // 2. Session-key taps from the Trading Balance: no prompt, sponsored, held in the vault.
  await tap(s, "BTC", "up");
  const ethRow = await tap(s, "ETH", "down");

  // 2b. Exits with the app closed (S24.5): from the position's TP/SL drawer, one passkey confirmation grants EXIT, a
  // take-profit is handed to the keeper (the session key signs it, no prompt) and the server holds it armed.
  await ethRow.locator(".tm-pos-open-btn").click();
  await modal(page).getByRole("button", { name: "TP / SL", exact: true }).click();
  const exits = modal(page);
  const turnOn = exits.getByRole("button", { name: "Keep exits running with the app closed" });
  await expect(turnOn).toBeVisible({ timeout: 30_000 });
  const beforeGrant = s.assertions();
  await turnOn.click();
  await expect(exits.getByText(/^Runs with the app closed/)).toBeVisible({ timeout: 120_000 });
  const grantPrompts = s.assertions() - beforeGrant;
  await page.screenshot({ path: join(out, `keeper-on-${width}.png`) });
  await axe(page, "keeper", '[role="dialog"]');
  await exits.getByRole("button", { name: "+25%", exact: true }).click();
  const beforeSet = s.assertions();
  await exits.getByRole("button", { name: "Set", exact: true }).click();
  await expect(page.locator('[data-slot="toast-title"]').filter({ hasText: /^TP\/SL updated/ })).toBeVisible({ timeout: 30_000 });
  const held = (await page.evaluate(`fetch("/api/exits").then((r) => r.status === 200 ? r.json() : { status: r.status })`)) as { exits?: Array<{ market: string; side: string; status: string; takeProfitBase: string | null }>; status?: number };
  const armed = held.exits?.find((e) => e.status === "armed" && e.side === "down") ?? null;
  note({ step: "keeper-armed", grantPrompts, setPrompts: s.assertions() - beforeSet, armed, read: held.status ?? 200 });
  if (!armed) throw new Error(`the keeper holds no armed exit: ${JSON.stringify(held).slice(0, 200)}`);

  // 3. CLOSE through the vault's sell lane: the session key signs `placeFor`, no prompt.
  const close = page.locator(".tm-buttons .tm-btn").filter({ hasText: "CLOSE" });
  await expect(close).toBeVisible({ timeout: 30_000 });
  const beforeClose = s.assertions();
  const c0 = Date.now();
  await close.click();
  const closed = page.locator('[data-slot="toast-title"]').filter({ hasText: /^Closed |^Reduced / });
  const notClosed = page.locator('[data-slot="toast-title"]').filter({ hasText: /^Price moved|No bids|Close didn't go through|Nothing sold/ });
  await expect(closed.or(notClosed).first()).toBeVisible({ timeout: 90_000 });
  note({ step: "vault-close", ok: (await closed.count()) > 0, ms: Date.now() - c0, prompts: s.assertions() - beforeClose, toast: await closed.or(notClosed).first().innerText().catch(() => ""), body: await page.locator('[data-slot="toast-description"]').first().innerText().catch(() => "") });
  await page.screenshot({ path: join(out, `vault-close-${width}.png`) });

  // 4. Over the per-tap cap: the reason under the button (D-160), nothing sent, no prompt.
  await switchSymbol(page, "SOL");
  await page.locator(".tm-stack").click();
  const settings = modal(page);
  await settings.getByLabel(/Size|Stake/).first().fill("1.50");
  await settings.getByLabel(/Size|Stake/).first().blur();
  await page.keyboard.press("Escape");
  const before = s.assertions();
  const capNote = page.locator("#tm-note-up");
  const shown = await expect(capNote).toContainText(/per tap/, { timeout: 60_000 }).then(() => true, () => false);
  note({ step: "cap-refusal", shown, text: await capNote.innerText().catch(() => ""), prompts: s.assertions() - before });
  await page.screenshot({ path: join(out, `cap-refusal-${width}.png`) });

  // 5. The grant on /settings/account, and Stop (one assertion).
  await page.goto(`${base}/settings/account`, { waitUntil: "load" });
  await settle(page);
  // The EXIT grant made from the terminal (S24.5): listed sell-only, and stopped from here in one step.
  const exitRow = page.locator("li").filter({ hasText: "Exits with the app closed" }).first();
  await expect(exitRow).toBeVisible({ timeout: 60_000 });
  note({ step: "grant-listed", exit: (await exitRow.innerText()).replace(/\s+/g, " ").slice(0, 240) });
  const beforeExitStop = s.assertions();
  await exitRow.getByRole("button", { name: /^Stop/ }).click();
  await expect(page.locator("li").filter({ hasText: "Exits with the app closed" })).toHaveCount(0, { timeout: 120_000 });
  note({ step: "exit-stopped", prompts: s.assertions() - beforeExitStop });
  const stop = page.getByRole("button", { name: /^Stop/ }).first();
  if (await stop.count()) {
    const b = s.assertions();
    await stop.click();
    const confirm = page.getByRole("button", { name: /^Stop|Hold to stop/ }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click({ delay: 1_600 }).catch(() => undefined);
    await page.waitForTimeout(8_000);
    note({ step: "stop", prompts: s.assertions() - b });
  }

  // 6. Optional: the open DOWN ETH settles into the Trading Balance (the settler's crank, no prompt).
  if (verdictMin > 0) {
    await page.goto(`${base}/trade/ETH`, { waitUntil: "load" });
    await settle(page);
    const settled = page.locator('[data-slot="toast-title"]').filter({ hasText: /settled/ });
    const seen = await expect(settled.first()).toBeVisible({ timeout: verdictMin * 60_000 }).then(() => true, () => false);
    note({ step: "verdict", seen, toasts: await s.toastsSeen() });
  }
  if (errors.length) note({ step: "console-errors", errors: errors.slice(0, 8) });
} catch (error) {
  failed = true;
  await page.screenshot({ path: join(out, `fail-${width}.png`) }).catch(() => undefined);
  note({ step: "FAIL", message: (error as Error).message.split("\n").slice(0, 4).join(" | ") });
}
writeFileSync(join(out, `trading-balance-${Date.now()}.json`), JSON.stringify({ base, width, steps, txs: s.txs }, null, 2));
await s.browser.close();
process.exitCode = failed ? 1 : 0;
