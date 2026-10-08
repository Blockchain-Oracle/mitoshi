/**
 * Shell interactions the UX gate can't see statically (S22, D-189/D-190): the Everything drawer (floating on the right,
 * URL state `?d=everything`, search row, focus, Escape and Back close it), the phone dock, the centred sign-in modal,
 * the back chevron, the command palette (⌘K, Enter navigates), the rail's keys (1–5) and the `?` keyboard map, and the
 * 88 px rail between 768 and 1279. Screenshots + axe on the open overlays, both themes.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/shell-interactions.ts --base http://localhost:3110 --out <dir>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium, expect, type Page } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3110");
const out = arg("out", "shell-out");
mkdirSync(out, { recursive: true });
const failures: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failures.push(name); console.log(`FAIL ${name}: ${(e as Error).message.split("\n")[0]}`); }
};
const axeOn = async (page: Page, selector = '[role="dialog"]') => {
  const axe = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa"]).analyze();
  if (axe.violations.length) throw new Error(axe.violations.map((v) => `${v.id} ${v.nodes[0]?.target ?? ""}`).join(", "));
};

const browser = await chromium.launch();
for (const theme of ["dark", "light"]) {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, colorScheme: theme as "dark" | "light" });
  phone.setDefaultTimeout(30_000);
  await phone.addInitScript((t) => localStorage.setItem("cwf_theme", t), theme);
  const page = await phone.newPage();
  await page.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(page);

  await check(`${theme}: the dock fits 390 px and marks the current place`, async () => {
    const dock = page.getByRole("navigation", { name: /Mobile primary navigation/ });
    await expect(dock).toBeVisible();
    const box = (await dock.locator("ul").boundingBox())!;
    if (box.x < 0 || box.x + box.width > 390) throw new Error(`dock overflows (x=${box.x}, w=${box.width})`);
    await expect(dock.getByRole("link", { name: "Markets" })).toHaveAttribute("aria-current", "page");
  });
  await check(`${theme}: Everything opens from the right, floating, in the URL, with search`, async () => {
    await page.getByRole("button", { name: /Everything in Mitoshi/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForURL(/\?d=everything/);
    await page.waitForTimeout(500);
    const box = (await dialog.boundingBox())!;
    if (box.x + box.width < 370 || box.x + box.width > 390) throw new Error(`panel not floating at the right edge (right=${box.x + box.width})`);
    await page.getByPlaceholder(/Search:/).fill("revoke");
    await expect(dialog.getByRole("link", { name: /Account & keys/ })).toBeVisible();
    await page.screenshot({ path: join(out, `everything-${theme}.png`) });
    await axeOn(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    if (new URL(page.url()).searchParams.has("d")) throw new Error("Escape left ?d in the URL");
  });
  await check(`${theme}: Back closes the Everything drawer`, async () => {
    await page.getByRole("button", { name: /Everything in Mitoshi/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toBeHidden();
    if (!page.url().endsWith("/markets")) throw new Error(`Back left ${page.url()}`);
  });
  await check(`${theme}: sign-in modal is centred, passkey first, axe clean`, async () => {
    await page.getByRole("banner").getByRole("button", { name: "Sign in" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: /Create my account/ })).toBeVisible({ timeout: 90_000 });
    await page.waitForTimeout(400);
    const box = (await dialog.boundingBox())!;
    if (Math.abs(box.x + box.width / 2 - 195) > 4) throw new Error(`not centred (x=${box.x}, w=${box.width})`);
    await page.screenshot({ path: join(out, `signin-${theme}.png`) });
    await axeOn(page);
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
  desk.setDefaultTimeout(30_000);
  await desk.addInitScript((t) => localStorage.setItem("cwf_theme", t), theme);
  const dp = await desk.newPage();
  await dp.goto(`${base}/markets`, { waitUntil: "load" });
  await settle(dp);
  await check(`${theme}: the rail's keys move between places and 5 opens Everything`, async () => {
    const rail = dp.getByRole("navigation", { name: "Places" });
    await expect(rail.getByRole("link", { name: /Markets/ })).toHaveAttribute("aria-current", "page");
    await dp.locator("body").click({ position: { x: 700, y: 880 } });
    await dp.keyboard.press("2");
    await dp.waitForURL(`${base}/stocks`);
    await expect(rail.getByRole("link", { name: /Stocks/ })).toHaveAttribute("aria-current", "page");
    await dp.keyboard.press("5");
    await expect(dp.getByRole("dialog")).toBeVisible();
    await dp.screenshot({ path: join(out, `rail-everything-${theme}.png`) });
    await dp.keyboard.press("Escape");
    await expect(dp.getByRole("dialog")).toBeHidden();
  });
  await check(`${theme}: ? opens the keyboard map`, async () => {
    await dp.keyboard.press("?");
    const dialog = dp.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Keyboard shortcuts" })).toBeVisible();
    await axeOn(dp);
    await dp.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
  await check(`${theme}: ⌘K palette searches and navigates`, async () => {
    await dp.keyboard.press("Meta+k");
    const input = dp.getByRole("combobox", { name: /Search destinations/ });
    await expect(input).toBeVisible();
    await input.fill("bridge");
    await dp.waitForTimeout(200);
    await dp.screenshot({ path: join(out, `palette-${theme}.png`) });
    await axeOn(dp);
    await dp.keyboard.press("Enter");
    await dp.waitForURL(`${base}/bridge`);
  });
  await check(`${theme}: 1024 px shows the 88 px icon rail`, async () => {
    await dp.setViewportSize({ width: 1024, height: 768 });
    const rail = dp.getByRole("complementary", { name: "Mitoshi" });
    const box = (await rail.boundingBox())!;
    if (Math.round(box.width) !== 88) throw new Error(`rail width ${box.width}`);
    await expect(rail.getByText("Markets", { exact: true })).toBeHidden();
    await dp.screenshot({ path: join(out, `rail-compact-${theme}.png`) });
  });
  await desk.close();
}
await browser.close();
console.log(failures.length ? `${failures.length} failure(s)` : "all interactions pass");
process.exitCode = failures.length ? 1 : 0;
