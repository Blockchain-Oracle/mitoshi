/**
 * CLS on a route as the browser records it (layout-shift entries without recent input, summed over session windows as
 * web-vitals does: ≤ 1 s gaps, ≤ 5 s windows, the largest window counts). A load-independent check for §3.1's ≤ 0.05
 * when the lab (Lighthouse's simulated CPU) is unreliable on a loaded host.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/cls.ts --base http://localhost:3104 /markets /portfolio
 */
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const i = args.indexOf("--base");
const base = i >= 0 ? args.splice(i, 2)[1]! : "http://localhost:3104";
const browser = await chromium.launch();
let worst = 0;
for (const route of args.length ? args : ["/markets"]) {
  for (const width of [390, 1440]) {
    const page = await (await browser.newContext({ viewport: { width, height: width < 768 ? 844 : 900 } })).newPage();
    await page.addInitScript(() => {
      (window as unknown as { __shifts: { t: number; v: number }[] }).__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { hadRecentInput: boolean; value: number; startTime: number }[]) if (!e.hadRecentInput) (window as unknown as { __shifts: { t: number; v: number }[] }).__shifts.push({ t: e.startTime, v: e.value });
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`${base}${route}`, { waitUntil: "load" });
    await page.waitForTimeout(25_000);
    const shifts = await page.evaluate(() => (window as unknown as { __shifts: { t: number; v: number }[] }).__shifts);
    let best = 0, cur = 0, start = 0, last = -Infinity;
    for (const s of shifts) {
      if (s.t - last > 1000 || s.t - start > 5000) { cur = 0; start = s.t; }
      cur += s.v; last = s.t; best = Math.max(best, cur);
    }
    worst = Math.max(worst, best);
    console.log(JSON.stringify({ route, width, cls: Number(best.toFixed(4)), shifts: shifts.length }));
    await page.close();
  }
}
await browser.close();
process.exit(worst <= 0.05 ? 0 : 1);
