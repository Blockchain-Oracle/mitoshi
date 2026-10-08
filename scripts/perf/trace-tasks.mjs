/**
 * Diagnosis for the lab gate (plan §3.1, not a gate itself): a DevTools timeline trace of each route at 4× CPU and
 * 390 px, then every main-thread task over 50 ms with what ran inside it — scripts evaluated or called (by chunk),
 * timers, animation frames, style, layout, paint — and the tasks' blocking sum. Run on the same host as Lighthouse
 * (`lighthouse.yml` branch mode runs it after the gate) so the breakdown matches the numbers.
 *
 * `--shifts N` also loads each route N times unthrottled (as Lighthouse's simulated runs load) and lists every
 * layout shift with its sources' rects, next to when the late fonts (`html.wf-late`) and the hero chart arrived.
 *
 *   WEB_DIR=web node scripts/perf/trace-tasks.mjs http://localhost:3000 /markets /portfolio [--seconds 12] [--shifts 3] [--chrome]
 */
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const VALUED = new Set(["--seconds", "--shifts", "--cpu", "--min"]);
const [base, ...rest] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && VALUED.has(args[i - 1])));
const shiftRuns = Number(option("--shifts", "0"));
const routes = rest.length ? rest : ["/markets"];
const seconds = Number(option("--seconds", "12"));
// `--cpu 1 --min 12.5` lists the tasks Lighthouse's simulation (observed × 4) would count as long.
const cpu = Number(option("--cpu", "4"));
const minMs = Number(option("--min", "50"));
const require = createRequire(join(resolve(process.env.WEB_DIR ?? "web"), "package.json"));
const { chromium } = require("@playwright/test");

const WRAP = /^(ThreadControllerImpl::RunTask|BlinkScheduler_|RunTask|SequenceManager|TaskGraphRunner|v8\.callFunction|ProfileCall)/;
const short = (u) => (u ? u.replace(/^https?:\/\/[^/]+/, "").replace(/^\/_next\/static\/chunks\//, "") : "");

async function trace(route) {
  const browser = await chromium.launch(flag("--chrome") ? { channel: "chrome" } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const events = [];
  cdp.on("Tracing.dataCollected", (e) => events.push(...e.value));
  const done = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.start", { traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8.execute", "loading", "toplevel"] } });
  await page.goto(base + route, { waitUntil: "load" });
  await page.waitForTimeout(seconds * 1000);
  await cdp.send("Tracing.end");
  await done;
  await browser.close();

  const main = events.find((e) => e.name === "thread_name" && e.args?.name === "CrRendererMain" && events.some((x) => x.pid === e.pid && x.name === "ParseHTML"));
  const mine = events.filter((e) => e.pid === main.pid && e.tid === main.tid && e.ph === "X" && e.dur !== undefined).sort((a, b) => a.ts - b.ts);
  const t0 = (events.find((e) => e.pid === main.pid && e.name === "navigationStart") ?? mine[0]).ts;
  const lines = [];
  let blocking = 0;
  for (const task of mine.filter((e) => e.name === "RunTask" && e.dur > minMs * 1000)) {
    blocking += (task.dur - minMs * 1000) / 1000;
    const inner = mine.filter((e) => e !== task && !WRAP.test(e.name) && e.ts >= task.ts && e.ts + e.dur <= task.ts + task.dur);
    const top = inner.filter((e) => !inner.some((p) => p !== e && p.ts <= e.ts && p.ts + p.dur >= e.ts + e.dur && p.dur > e.dur));
    const groups = new Map();
    for (const e of top) {
      const d = e.args?.data ?? {};
      const key = `${e.name}${d.url ? ` ${short(d.url)}` : d.type ? ` ${d.type}` : ""}`;
      groups.set(key, (groups.get(key) ?? 0) + e.dur / 1000);
    }
    const what = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${v.toFixed(0)} ${k}`).join(" · ");
    lines.push(`- ${((task.ts - t0) / 1000).toFixed(0)} ms: **${(task.dur / 1000).toFixed(0)} ms** — ${what}`);
  }
  return `#### ${route}: ${lines.length} tasks over ${minMs} ms, blocking ${blocking.toFixed(0)} ms (${cpu}× CPU, ${seconds} s)\n${lines.join("\n")}\n`;
}

const PROBE = `window.__ls=[];window.__marks={};new PerformanceObserver(l=>{for(const e of l.getEntries())window.__ls.push({t:Math.round(e.startTime),v:e.value,src:(e.sources||[]).map(s=>{const n=s.node;const d=n&&n.nodeType===1?n.tagName.toLowerCase()+(typeof n.className==="string"&&n.className?"."+n.className.split(" ").slice(0,2).join("."):""):(n?n.nodeName:"?");return d+" y "+Math.round(s.previousRect.y)+"→"+Math.round(s.currentRect.y)+" h "+Math.round(s.previousRect.height)+"→"+Math.round(s.currentRect.height)})})}).observe({type:"layout-shift",buffered:true});new MutationObserver(()=>{const m=window.__marks;if(!m.wf&&document.documentElement.classList.contains("wf-late"))m.wf=Math.round(performance.now());if(!m.chart&&document.querySelector(".hero-chart canvas"))m.chart=Math.round(performance.now());if(!m.hero&&document.querySelector(".hero-chart-head"))m.hero=Math.round(performance.now());}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:["class"]});`;

async function shifts(route) {
  const lines = [];
  for (let i = 0; i < shiftRuns; i++) {
    const browser = await chromium.launch(flag("--chrome") ? { channel: "chrome" } : {});
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
    const page = await ctx.newPage();
    await page.addInitScript(PROBE);
    await page.goto(base + route, { waitUntil: "load" });
    await page.waitForTimeout(8000);
    const [ls, marks] = await page.evaluate("[window.__ls, window.__marks]");
    await browser.close();
    lines.push(`- run ${i + 1}: Σ ${ls.reduce((a, e) => a + e.v, 0).toFixed(4)} · hero ${marks.hero ?? "–"} ms · chart ${marks.chart ?? "–"} ms · wf-late ${marks.wf ?? "–"} ms`);
    for (const e of ls) lines.push(`  - ${e.t} ms ${e.v.toFixed(4)}: ${e.src.join(" · ")}`);
  }
  return `#### ${route}: layout shifts, ${shiftRuns} unthrottled loads\n${lines.join("\n")}\n`;
}

let out = "";
for (const r of routes) out += `${await trace(r)}\n`;
if (shiftRuns > 0) for (const r of routes) out += `${await shifts(r)}\n`;
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `<details><summary>Main-thread tasks (diagnosis)</summary>\n\n${out}\n</details>\n`);
