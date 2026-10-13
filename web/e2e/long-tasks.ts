/**
 * Main-thread long tasks per route at 4× CPU (D-152): the page's own `longtask` entries over its first 12 s, their
 * blocking sum (Σ max(0, d − 50 ms)) and the cross-origin frames it mounted. Not Lighthouse's TBT (no simulation, no
 * TTI cut-off), but a like-for-like comparison of two builds back to back on the same host — e.g. the deployed site
 * against a local build — when a loaded workstation makes the lab's simulated TBT meaningless.
 *
 * Then the frame work (the S23 gate's ≤ 2 ms): every `requestAnimationFrame` callback is timed and summed per frame
 * (callbacks sharing a frame timestamp), over `--frames-s` seconds of steady state after the first 12 s, with the
 * first-visit tour dismissed — the terminal's live chart loop plus anything else animating. Reported as p50 / p95 / max
 * per frame at the same CPU rate.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/long-tasks.ts https://mitoshi.xyz / /markets /portfolio
 *   pnpm --filter @cwf/web exec tsx e2e/long-tasks.ts --base https://mitoshi.xyz --routes /trade/BTC [--cpu 1] [--out <dir>]
 *
 * `--profile` (with `--out`) also saves each route's first 12 s as a V8 CPU profile (`<route>.cpuprofile`, 100 µs
 * sampling) — against a local `ANALYZE_MAPS=1` build its frames map back to source through the chunks' `.map` files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const flagged = process.argv.some((a) => a.startsWith("--"));
const base = (flagged ? arg("base") : process.argv[2]) ?? "https://mitoshi.xyz";
const routes = flagged ? (arg("routes") ?? "/trade/BTC").split(",") : process.argv.slice(3);
const cpu = Number(arg("cpu") ?? "4");
const framesS = Number(arg("frames-s") ?? "10");
const out = arg("out");
const profile = process.argv.includes("--profile") && out !== undefined;
if (out) mkdirSync(out, { recursive: true });

const pct = (xs: number[], p: number) => xs.length ? xs[Math.min(xs.length - 1, Math.floor((p / 100) * xs.length))]! : 0;
const rows: Record<string, unknown>[] = [];
const browser = await chromium.launch();
for (const r of routes) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  await page.addInitScript(`window.__lt=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__lt.push([Math.round(e.startTime),Math.round(e.duration)])}).observe({type:"longtask",buffered:true});`);
  // One entry per frame: the summed duration of every rAF callback run with that frame's timestamp.
  await page.addInitScript(`(()=>{const raf=window.requestAnimationFrame.bind(window);window.__fw=[];let cur=null;
    window.requestAnimationFrame=(cb)=>raf((ts)=>{const t0=performance.now();try{cb(ts)}finally{const d=performance.now()-t0;
    if(cur&&cur.ts===ts)cur.ms+=d;else{cur={ts,at:t0,ms:d};window.__fw.push(cur)}}});})();`);
  if (profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
    await cdp.send("Profiler.start");
  }
  await page.goto(base + r, { waitUntil: "load" });
  await page.waitForTimeout(12000);
  if (profile) writeFileSync(join(out!, `${r.replace(/\W+/g, "_") || "root"}.cpuprofile`), JSON.stringify((await cdp.send("Profiler.stop")).profile));
  const lt = await page.evaluate(`window.__lt`) as [number, number][];
  const tbt = lt.reduce((s, [, d]) => s + Math.max(0, d - 50), 0);
  const frames = page.frames().map((f) => new URL(f.url() || "about:blank").host).filter(Boolean);
  const top = lt.sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(r, "longtasks", lt.length, "blocking>50", tbt, "top", JSON.stringify(top), "frames", frames.join(","));

  // Frame work is the live chart's cost, so the first-visit tour (whose scrim slows the chart to ~5 fps) goes first.
  const skip = page.getByRole("button", { name: "Skip" });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(2000);
  }
  const from = await page.evaluate(`performance.now()`) as number;
  await page.waitForTimeout(framesS * 1000);
  const fw = (await page.evaluate(`window.__fw`) as { at: number; ms: number }[]).filter((f) => f.at >= from).map((f) => f.ms).sort((a, b) => a - b);
  const frameWork = { frames: fw.length, fps: Math.round(fw.length / framesS), p50: +pct(fw, 50).toFixed(2), p95: +pct(fw, 95).toFixed(2), max: +(fw.at(-1) ?? 0).toFixed(2) };
  console.log(r, `frame work at ${cpu}× CPU over ${framesS} s`, JSON.stringify(frameWork));
  rows.push({ route: r, cpu, longtasks: lt.length, blocking: tbt, top, crossOriginFrames: frames, frameWork });
  if (out) await page.screenshot({ path: join(out, `${r.replace(/\W+/g, "_") || "root"}.png`) });
  await ctx.close();
}
await browser.close();
if (out) writeFileSync(join(out, "long-tasks.json"), JSON.stringify(rows, null, 2));
