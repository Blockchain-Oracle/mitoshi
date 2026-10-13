/**
 * S10c gate, re-run on the terminal (S23i, RV-41/RV-59): Boost end to end on real Moderato with a Chrome virtual
 * authenticator. The tour's sign-up (one ceremony, the faucet, one-tap armed); the settings drawer's Boost row at 2×
 * (axe on it); UP then reads "2× Boost · passkey" and opens a Boost on BTC 5m — the reserve's own sizing, a fresh signed
 * RedStone spot, ONE passkey prompt (`[approve(reserve, stake), open(…, spotProof)]`, sponsored); the Boost lists as a
 * position tagged "Boost 2×", valued at what its Close pays the owner; CLOSE sells it through `LeverageReserve.close`
 * (ONE passkey prompt). Prints every tx for `cast receipt`.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/boost.ts --base https://mitoshi.xyz --out <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { openTerminalSession, signUpFromTour, stakeMin, waitEnterable, modal } from "./lib/terminal";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "https://mitoshi.xyz");
const out = arg("out", "boost-out");
const width = Number(arg("width", "1440"));
mkdirSync(out, { recursive: true });

const s = await openTerminalSession({ width });
const { page, log } = s;
const errors: string[] = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const steps: Record<string, unknown>[] = [];
const note = (o: Record<string, unknown>) => (steps.push(o), log(o));

let failed = false;
try {
  await signUpFromTour(s, base, "BTC", "boost");
  await stakeMin(page);

  // The Boost row: Off, 2×… up to the reserve's live maximum.
  await page.locator(".tm-stack").click();
  const settings = modal(page);
  await expect(settings.getByText("Boost", { exact: true })).toBeVisible({ timeout: 30_000 });
  await settings.getByRole("button", { name: "2×", exact: true }).click();
  await expect(settings.getByText(/open a 2× Boost/)).toBeVisible();
  await page.screenshot({ path: join(out, `boost-setting-${width}.png`) });
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
  note({ step: "boost-setting", axe: axe.violations.map((v) => `${v.id}:${v.nodes.length}`) });
  await page.keyboard.press("Escape");
  await expect(page.locator(".tm-stack")).toContainText("Boost 2×");

  // UP opens a 2× Boost: one passkey prompt.
  await expect(page.locator(".tm-buttons .tm-btn").filter({ hasText: "UP" }).first()).toContainText("2× Boost · passkey", { timeout: 30_000 });
  await waitEnterable(s, "up", 360_000);
  const before = s.assertions();
  const t0 = Date.now();
  await page.locator(".tm-buttons .tm-btn").filter({ hasText: "UP" }).first().click();
  const boosted = page.locator('[data-slot="toast-title"]').filter({ hasText: /boosted 2×/ });
  const refused = page.locator('[data-slot="toast-title"]').filter({ hasText: /Order failed|didn't go through|Boost|Top up/ });
  await expect(boosted.or(refused).first()).toBeVisible({ timeout: 120_000 });
  const ok = (await boosted.count()) > 0;
  note({ step: "boost-open", ok, ms: Date.now() - t0, prompts: s.assertions() - before, toast: await boosted.or(refused).first().innerText(), body: await page.locator('[data-slot="toast-description"]').first().innerText().catch(() => "") });
  if (!ok) throw new Error("the Boost did not open");

  // The Boost as a terminal position: tagged, valued at what its Close pays the owner.
  const row = page.locator(".tm-side-list .tm-pos").filter({ hasText: "Boost 2×" }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(row.locator(".tm-pos-figure")).toContainText("$", { timeout: 60_000 });
  note({ step: "boost-row", figure: await row.locator(".tm-pos-figure").innerText() });
  await page.screenshot({ path: join(out, `boost-row-${width}.png`) });

  // CLOSE through the reserve: one passkey prompt.
  const b = s.assertions();
  const c0 = Date.now();
  await row.locator(".tm-pos-close").click();
  const closed = page.locator('[data-slot="toast-title"]').filter({ hasText: /^Closed / });
  const notClosed = page.locator('[data-slot="toast-title"]').filter({ hasText: /^Price moved|No bids|Close failed|Close didn't go through/ });
  await expect(closed.or(notClosed).first()).toBeVisible({ timeout: 120_000 });
  note({ step: "boost-close", ok: (await closed.count()) > 0, ms: Date.now() - c0, prompts: s.assertions() - b, toast: await closed.or(notClosed).first().innerText(), body: await page.locator('[data-slot="toast-description"]').first().innerText().catch(() => "") });
  await page.screenshot({ path: join(out, `boost-closed-${width}.png`) });
  if (errors.length) note({ step: "console-errors", errors: errors.slice(0, 8) });
} catch (error) {
  failed = true;
  await page.screenshot({ path: join(out, `fail-${width}.png`) }).catch(() => undefined);
  note({ step: "FAIL", message: (error as Error).message.split("\n").slice(0, 4).join(" | ") });
}
writeFileSync(join(out, `boost-${Date.now()}.json`), JSON.stringify({ base, width, steps, txs: s.txs }, null, 2));
await s.browser.close();
process.exitCode = failed ? 1 : 0;
