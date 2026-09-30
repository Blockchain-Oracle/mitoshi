/**
 * Main-thread long tasks per route at 4× CPU (D-152): the page's own `longtask` entries over its first 12 s, their
 * blocking sum (Σ max(0, d − 50 ms)) and the cross-origin frames it mounted. Not Lighthouse's TBT (no simulation, no
 * TTI cut-off), but a like-for-like comparison of two builds back to back on the same host — e.g. the deployed site
 * against a local build — when a loaded workstation makes the lab's simulated TBT meaningless.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/long-tasks.ts https://testnet.mitoshi.xyz / /markets /portfolio
 */
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "https://testnet.mitoshi.xyz";
const routes = process.argv.slice(3);
const browser = await chromium.launch();
for (const r of routes) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(`window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:"longtask",buffered:true});`);
  await page.goto(base + r, { waitUntil: "load" });
  await page.waitForTimeout(12000);
  const lt = await page.evaluate(`window.__lt`) as [number, number][];
  const tbt = lt.reduce((s, [, d]) => s + Math.max(0, d - 50), 0);
  const frames = page.frames().map((f) => new URL(f.url() || "about:blank").host).filter(Boolean);
  console.log(r, "longtasks", lt.length, "blocking>50", tbt, "top", JSON.stringify(lt.sort((a, b) => b[1] - a[1]).slice(0, 6)), "frames", frames.join(","));
  await ctx.close();
}
await browser.close();
