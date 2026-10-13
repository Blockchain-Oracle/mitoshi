/**
 * Lab LCP / TBT / CLS per route, plan §3.1's settings (the ones `lighthouserc.json` and `.github/workflows/lighthouse.yml`
 * use): Lighthouse mobile, 390 px, 4× CPU, simulated 4G, `--runs` runs, the median run. For a deployed build prefer the
 * CI workflow (a quiet host: `gh workflow run lighthouse.yml -f url=<base>`); on a loaded workstation the simulated CPU
 * scales the host's own load into TBT, so compare builds back to back on the same host rather than against budgets.
 *
 *   pnpm --filter @cwf/web exec tsx e2e/lab-vitals.ts --base https://mitoshi.xyz --runs 3 / /markets /markets/<id> /portfolio
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const take = (n: string, d: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args.splice(i, 2)[1]! : d; };
const base = take("base", "http://localhost:3104").replace(/\/$/, "");
const runs = Number(take("runs", "3"));
const routes = args.length ? args : ["/", "/markets", "/portfolio"];
const dir = mkdtempSync(join(tmpdir(), "lab-vitals-"));
const BUDGET = { lcp: 2500, tbt: 200, cls: 0.05 };

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
for (const route of routes) {
  const rows: { lcp: number; tbt: number; cls: number; score: number }[] = [];
  for (let r = 0; r < runs; r++) {
    const out = join(dir, `${route.replace(/\W+/g, "_")}-${r}.json`);
    execFileSync("npx", ["-y", "lighthouse@12.8.2", `${base}${route}`, "--quiet", "--chrome-flags=--headless=new", "--only-categories=performance", "--form-factor=mobile",
      "--screenEmulation.mobile", "--screenEmulation.width=390", "--screenEmulation.height=844", "--screenEmulation.deviceScaleFactor=3", "--throttling-method=simulate",
      "--throttling.cpuSlowdownMultiplier=4", "--throttling.rttMs=150", "--throttling.throughputKbps=1638.4", "--output=json", `--output-path=${out}`], { stdio: "ignore" });
    const a = (JSON.parse(readFileSync(out, "utf8")) as { audits: Record<string, { numericValue: number }>; categories: { performance: { score: number } } });
    rows.push({ lcp: a.audits["largest-contentful-paint"]!.numericValue, tbt: a.audits["total-blocking-time"]!.numericValue, cls: a.audits["cumulative-layout-shift"]!.numericValue, score: a.categories.performance.score });
  }
  // The median run is the run with the median LCP (Lighthouse CI's `median-run`); the per-metric medians are shown too.
  const mid = [...rows].sort((x, y) => x.lcp - y.lcp)[Math.floor(rows.length / 2)]!;
  const lcp = median(rows.map((x) => x.lcp)), tbt = median(rows.map((x) => x.tbt)), cls = median(rows.map((x) => x.cls));
  console.log(JSON.stringify({
    route, runs, medianRun: { lcpMs: Math.round(mid.lcp), tbtMs: Math.round(mid.tbt), cls: +mid.cls.toFixed(4) },
    median: { lcpMs: Math.round(lcp), tbtMs: Math.round(tbt), cls: +cls.toFixed(4) },
    all: rows.map((x) => [Math.round(x.lcp), Math.round(x.tbt), +x.cls.toFixed(4)]),
    pass: { lcp: mid.lcp <= BUDGET.lcp, tbt: mid.tbt <= BUDGET.tbt, cls: mid.cls <= BUDGET.cls },
  }));
}
