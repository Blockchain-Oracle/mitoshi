/**
 * Visual A/B support (diagnosis, e.g. the Yosuku purge, D-071): screenshots a fixed set of routes and open overlays
 * at 390 and 1440 in both themes into --out, named stably, so two builds can be compared pixel for pixel.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/visual-snap.ts --base http://localhost:3102 --out <dir>
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { settle } from "./lib/settle";

const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1]! : d; };
const base = arg("base", "http://localhost:3102");
const out = arg("out", "visual-out");
mkdirSync(out, { recursive: true });
const ROUTES = ["/", "/markets", "/stocks", "/portfolio", "/settings/account", "/download", "/how-it-works", "/games", "/launch", "/nope"];

const browser = await chromium.launch();
for (const theme of ["dark", "light"] as const) {
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
    await ctx.addInitScript((t) => localStorage.setItem("cwf_theme", t), theme);
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(`${base}${route}`, { waitUntil: "load" });
      await settle(page);
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(out, `${theme}-${width}${route.replace(/\//g, "_") || "_"}.png`), fullPage: true, animations: "disabled" });
    }
    await page.goto(`${base}/markets`, { waitUntil: "load" });
    await settle(page);
    await page.waitForTimeout(600);
    if (width === 390) await page.getByRole("button", { name: /Everything in Mitoshi/ }).click();
    else await page.getByRole("button", { name: "Explore" }).click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(out, `${theme}-${width}-menu.png`), animations: "disabled" });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Sign in", exact: true }).first().click();
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(out, `${theme}-${width}-signin.png`), animations: "disabled" });
    await ctx.close();
  }
}
await browser.close();
