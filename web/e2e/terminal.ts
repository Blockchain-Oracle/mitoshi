/**
 * The terminal (S23, D-192): the first visit's tour (Skip closes it), `/trade` resolves to a symbol, the line follows live ticks (the price moves and names its
 * feed), the Window chip says how long the Window trades, the stack and the buttons read, the markets drawer switches
 * symbol in place (no reload), the settings drawer sets the size, axe on both drawers; screenshots at 1440 and 390 in
 * both themes.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/terminal.ts --base http://localhost:3110 --out <dir>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Page } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3110");
const out = arg("out", "terminal-out");
mkdirSync(out, { recursive: true });
const failures: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failures.push(name); console.log(`FAIL ${name}: ${(e as Error).message.split("\n")[0]}`); }
};
const axeOn = async (page: Page, selector = '[role="dialog"]') => {
  const axe = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa"]).analyze();
  if (axe.violations.length) throw new Error(axe.violations.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`).join(", "));
};
/** The chart's text alternative carries the live price (NumberFlow draws the chip's digits in a shadow root). */
const priceOf = async (page: Page) => (await page.locator(".tm-stage").getAttribute("aria-label"))?.replace(/[^\d.]/g, "") ?? "";

const browser = await chromium.launch();
for (const theme of ["dark", "light"] as const) {
  for (const [label, viewport] of [["desk", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
    const ctx = await browser.newContext({ viewport, colorScheme: theme, hasTouch: label === "phone" });
    ctx.setDefaultTimeout(60_000);
    await ctx.addInitScript((t) => localStorage.setItem("cwf_theme", t), theme);
    const page = await ctx.newPage();
    await page.goto(`${base}/trade`, { waitUntil: "load" });
    await settle(page);
    const tag = `${theme}/${label}`;

    await check(`${tag}: the first visit opens the five-step tour; Skip closes it for good`, async () => {
      const tour = page.getByRole("dialog");
      await expect(tour.getByText("Watch the market")).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: join(out, `tour-${theme}-${label}.png`) });
      await axeOn(page);
      await tour.getByRole("button", { name: "Skip" }).click();
      await expect(tour).toBeHidden();
    });
    await check(`${tag}: /trade lands on a symbol and titles the tab`, async () => {
      await page.waitForURL(/\/trade\/[A-Z]{2,6}$/);
      await expect(page).toHaveTitle(/\(([A-Z]{2,6})\) \| Mitoshi/);
    });
    await check(`${tag}: the line is live — a price, its feed named, and it moves`, async () => {
      await expect.poll(() => priceOf(page), { timeout: 30_000 }).not.toBe("");
      await expect(page.locator(".tm-asset-name").first()).not.toContainText("Reconnecting", { timeout: 30_000 });
      const first = await priceOf(page);
      await expect.poll(() => priceOf(page), { timeout: 30_000 }).not.toBe(first);
    });
    await check(`${tag}: the Window chip says how long this Window trades`, async () => {
      await expect(page.locator(".tm-window-state")).toHaveText(/trades|opens|closes|pricing/, { timeout: 30_000 });
    });
    await check(`${tag}: UP and DOWN read, with what each pays or why not`, async () => {
      await expect(page.getByRole("button", { name: /UP/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /DOWN/ })).toBeVisible();
      await page.waitForTimeout(2_000);
      await page.screenshot({ path: join(out, `terminal-${theme}-${label}.png`) });
    });
    await check(`${tag}: the markets drawer switches symbol in place`, async () => {
      await page.locator(".tm-asset").first().click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await page.waitForURL(/\?d=trade-markets/);
      await page.waitForTimeout(600);
      await axeOn(page);
      await page.screenshot({ path: join(out, `markets-${theme}-${label}.png`) });
      const navs: string[] = [];
      page.on("framenavigated", (f) => f === page.mainFrame() && navs.push(f.url()));
      await dialog.getByRole("button", { name: /^ETH/ }).click();
      await page.waitForURL(/\/trade\/ETH$/);
      await expect(dialog).toBeHidden();
      await expect(page).toHaveTitle(/Ether \(ETH\)/);
      if (navs.some((u) => !u.includes("/trade/"))) throw new Error(`navigated away: ${navs.join(", ")}`);
    });
    if (label === "desk") {
      await check(`${tag}: Range hosts the ticket's band call for this Window, and Up / Down comes back`, async () => {
        await page.getByRole("tab", { name: "Range" }).click();
        const panel = page.getByRole("region", { name: "Range" });
        await expect(panel).toBeVisible();
        await page.waitForTimeout(1_500);
        await page.screenshot({ path: join(out, `mode-range-${theme}.png`) });
        await axeOn(page, ".tm-mode-panel");
        await page.getByRole("tab", { name: "Up / Down" }).click();
        await expect(page.getByRole("button", { name: /UP/ })).toBeVisible();
      });
      await check(`${tag}: Parlay takes this Window as a leg from UP, and the slip beside the chart shows it`, async () => {
        await page.getByRole("tab", { name: "Parlay" }).click();
        const panel = page.getByRole("region", { name: "Parlay" });
        await expect(panel).toBeVisible();
        const up = panel.getByRole("button", { name: /UP/ });
        await expect(up).toContainText("add to parlay", { timeout: 30_000 });
        await up.click();
        await expect(up).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
        await expect(up).toContainText("in parlay");
        await page.waitForTimeout(1_500);
        await page.screenshot({ path: join(out, `mode-parlay-${theme}.png`) });
        await axeOn(page, ".tm-mode-panel");
        await up.click();
        await expect(up).toContainText("add to parlay");
        await page.getByRole("tab", { name: "Up / Down" }).click();
      });
    }
    await check(`${tag}: the settings drawer sets the size`, async () => {
      await page.locator(".tm-stack").click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByRole("heading", { name: "Trade settings" })).toBeVisible();
      await page.waitForTimeout(600);
      await axeOn(page);
      await dialog.getByRole("button", { name: "Min" }).click();
      await expect(page.locator(".tm-stack-value").first()).toContainText("$1.00");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });
    await ctx.close();
  }
}
await browser.close();
console.log(failures.length ? `${failures.length} failure(s)` : "all terminal checks pass");
process.exitCode = failures.length ? 1 : 0;
