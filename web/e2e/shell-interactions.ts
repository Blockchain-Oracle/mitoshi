/**
 * Shell interactions the UX gate can't see statically: the More panel (right edge, search row, focus, Escape), the
 * command palette (⌘K, search, Enter navigates), and the back chevron. Screenshots + axe on the open overlays.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/shell-interactions.ts --base http://localhost:3101 --out <dir>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3101");
const out = arg("out", "shell-out");
mkdirSync(out, { recursive: true });
const failures: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failures.push(name); console.log(`FAIL ${name}: ${(e as Error).message.split("\n")[0]}`); }
};

const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: theme as "dark" | "light" });
  await phone.addInitScript((t) => localStorage.setItem("cwf_theme", t), theme);
  const page = await phone.newPage();
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);
  await check(`${theme}: More opens from the right with search`, async () => {
    await page.getByRole("button", { name: /Everything in Mitoshi/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    if (Math.round(box.x + box.width) < 389) throw new Error(`panel not on the right edge (right=${box.x + box.width})`);
    await page.waitForTimeout(600);
    await page.getByPlaceholder(/Search:/).fill("revoke");
    await expect(dialog.getByRole("link", { name: /Account & keys/ })).toBeVisible();
    await page.screenshot({ path: join(out, `more-${theme}.png`) });
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    if (axe.violations.length) throw new Error(axe.violations.map((v) => v.id).join(", "));
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
  await check(`${theme}: sign-in modal is centred, passkey first, axe clean`, async () => {
    await page.goto(`${base}/markets`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("banner").getByRole("button", { name: "Sign in" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: /Create my account/ })).toBeVisible();
    await page.waitForTimeout(400);
    const box = (await dialog.boundingBox())!;
    if (Math.abs(box.x + box.width / 2 - 195) > 4) throw new Error(`not centred (x=${box.x}, w=${box.width})`);
    await page.screenshot({ path: join(out, `signin-${theme}.png`) });
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    if (axe.violations.length) throw new Error(axe.violations.map((v) => `${v.id} ${v.nodes[0]?.target}`).join(", "));
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
  await check(`${theme}: back chevron goes to the parent`, async () => {
    await page.goto(`${base}/games/duel`, { waitUntil: "load" });
    await settle(page);
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForURL(`${base}/games`);
  });
  await phone.close();

  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme as "dark" | "light" });
  await desk.addInitScript((t) => localStorage.setItem("cwf_theme", t), theme);
  const dp = await desk.newPage();
  await dp.goto(`${base}/`, { waitUntil: "load" });
  await settle(dp);
  await check(`${theme}: ⌘K palette searches and navigates`, async () => {
    await dp.keyboard.press("Meta+k");
    const input = dp.getByRole("combobox", { name: /Search destinations/ });
    await expect(input).toBeVisible();
    await input.fill("bridge");
    await dp.waitForTimeout(200);
    await dp.screenshot({ path: join(out, `palette-${theme}.png`) });
    const axe = await new AxeBuilder({ page: dp }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa"]).analyze();
    if (axe.violations.length) throw new Error(axe.violations.map((v) => `${v.id} ${v.nodes[0]?.failureSummary ?? ""}`).join(", "));
    await dp.keyboard.press("Enter");
    await dp.waitForURL(`${base}/bridge`);
  });
  await check(`${theme}: desktop group menu opens`, async () => {
    await dp.getByRole("button", { name: "Explore" }).click();
    await expect(dp.getByRole("menu")).toBeVisible();
    await dp.screenshot({ path: join(out, `explore-${theme}.png`) });
    await dp.keyboard.press("Escape");
  });
  await desk.close();
}
await browser.close();
console.log(failures.length ? `${failures.length} failure(s)` : "all interactions pass");
process.exitCode = failures.length ? 1 : 0;
