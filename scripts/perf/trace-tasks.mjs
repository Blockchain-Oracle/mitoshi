/**
 * Diagnosis for the lab gate (plan §3.1, not a gate itself): a DevTools timeline trace of each route at 4× CPU and
 * 390 px, then every main-thread task over 50 ms with what ran inside it — scripts evaluated or called (by chunk),
 * timers, animation frames, style, layout, paint — and the tasks' blocking sum. Run on the same host as Lighthouse
 * (`lighthouse.yml` branch mode runs it after the gate) so the breakdown matches the numbers.
 *
 *   WEB_DIR=web node scripts/perf/trace-tasks.mjs http://localhost:3000 /markets /portfolio [--seconds 12] [--chrome]
 */
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const [base, ...rest] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1] === "--seconds"));
const routes = rest.length ? rest : ["/markets"];
const seconds = Number(option("--seconds", "12"));
const require = createRequire(join(resolve(process.env.WEB_DIR ?? "web"), "package.json"));
const { chromium } = require("@playwright/test");

const WRAP = /^(ThreadControllerImpl::RunTask|BlinkScheduler_|RunTask|SequenceManager|TaskGraphRunner|v8\.callFunction|ProfileCall)/;
const short = (u) => (u ? u.replace(/^https?:\/\/[^/]+/, "").replace(/^\/_next\/static\/chunks\//, "") : "");

async function trace(route) {
  const browser = await chromium.launch(flag("--chrome") ? { channel: "chrome" } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
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
  for (const task of mine.filter((e) => e.name === "RunTask" && e.dur > 50_000)) {
    blocking += (task.dur - 50_000) / 1000;
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
  return `#### ${route}: ${lines.length} tasks over 50 ms, blocking ${blocking.toFixed(0)} ms (4× CPU, ${seconds} s)\n${lines.join("\n")}\n`;
}

let out = "";
for (const r of routes) out += `${await trace(r)}\n`;
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `<details><summary>Main-thread tasks (diagnosis)</summary>\n\n${out}\n</details>\n`);
