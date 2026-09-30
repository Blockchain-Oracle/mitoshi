/**
 * Diagnosis for the lab gate's CLS (plan §3.1, not a gate): runs Lighthouse itself with `lighthouserc.json`'s settings
 * and `--save-assets`, then reads each run's trace for its LayoutShift events — when (ms after navigation), how much,
 * and every impacted node's old → new rect — the evidence LHCI's report drops (it keeps only the shifted elements).
 *
 *   node scripts/perf/lh-shifts.mjs http://localhost:3000/markets [--runs 4]
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const runs = args.includes("--runs") ? Number(args[args.indexOf("--runs") + 1]) : 4;
const urls = args.filter((a, i) => a.startsWith("http") && args[i - 1] !== "--runs");
const rc = JSON.parse(readFileSync("lighthouserc.json", "utf8"));
const dir = mkdtempSync(join(tmpdir(), "lh-shifts-"));
const config = join(dir, "config.cjs");
writeFileSync(config, `module.exports = ${JSON.stringify({ extends: "lighthouse:default", settings: { ...rc.ci.collect.settings } })};`);

let out = "";
for (const url of urls) {
  out += `#### ${new URL(url).pathname}: Lighthouse trace layout shifts, ${runs} runs\n`;
  for (let i = 0; i < runs; i++) {
    const base = join(dir, `run-${i}`);
    execFileSync("npx", ["-y", "lighthouse@12.6.1", url, `--config-path=${config}`, "--save-assets", "--output=json", `--output-path=${base}.json`, "--quiet", "--chrome-flags=--headless=new --no-sandbox"], { stdio: "ignore", timeout: 180_000 });
    const traceFile = readdirSync(dir).find((f) => f.startsWith(`run-${i}`) && f.endsWith(".trace.json"));
    const events = JSON.parse(readFileSync(join(dir, traceFile), "utf8")).traceEvents;
    const nav = events.find((e) => e.name === "navigationStart" && e.args?.data?.isLoadingMainFrame) ?? events.find((e) => e.name === "navigationStart");
    const lhr = JSON.parse(readFileSync(`${base}.json`, "utf8"));
    const cls = lhr.audits["cumulative-layout-shift"].numericValue;
    out += `- run ${i + 1}: CLS ${cls.toFixed(4)}\n`;
    for (const e of events.filter((x) => x.name === "LayoutShift" && x.args?.data)) {
      const d = e.args.data;
      if (d.had_recent_input) continue;
      const nodes = (d.impacted_nodes ?? []).map((n) => `[${n.old_rect.map(Math.round).join(",")}]→[${n.new_rect.map(Math.round).join(",")}]`).join(" ");
      out += `  - ${((e.ts - nav.ts) / 1000).toFixed(0)} ms score ${Number(d.score).toFixed(4)}: ${nodes}\n`;
    }
    const shifts = lhr.audits["layout-shifts"]?.details?.items ?? [];
    for (const s of shifts) out += `  - element ${Number(s.score).toFixed(4)} \`${s.node?.selector}\` now [${["left", "top", "width", "height"].map((k) => s.node?.boundingRect?.[k]).join(",")}]\n`;
  }
  out += "\n";
}
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `<details><summary>Lighthouse trace layout shifts (diagnosis)</summary>\n\n${out}\n</details>\n`);
