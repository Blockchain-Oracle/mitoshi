/**
 * The gate's numbers per route from an `lhci upload --target=filesystem` directory (`lighthouse.yml`, plan §3.1): the
 * representative (median) run LHCI's `median-run` assertions use — LCP, CLS, TBT, script bytes — plus the shifting
 * elements, the longest main-thread tasks and the costliest scripts of that run, for diagnosis. Markdown to stdout and
 * to `$GITHUB_STEP_SUMMARY` when set.
 *
 *   node scripts/perf/lighthouse-summary.mjs [.lighthouseci] [title]
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? ".lighthouseci";
const title = process.argv[3];
const manifestPath = join(dir, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`no ${manifestPath}: run \`lhci upload --target=filesystem\` first`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const LIMITS = { lcp: 2500, cls: 0.05, tbt: 200 };
/** A manifest path, or the same file inside `dir` (a downloaded artifact keeps the runner's absolute paths). */
const lhrOf = (entry) => JSON.parse(readFileSync(existsSync(entry.jsonPath) ? entry.jsonPath : join(dir, entry.jsonPath.split("/").pop()), "utf8"));
const ms = (v) => `${Math.round(v).toLocaleString("en-US")} ms`;
const kb = (v) => `${Math.round(v / 1024).toLocaleString("en-US")} KB`;
const mark = (ok) => (ok ? "" : " ✗");
const path = (url) => {
  const u = new URL(url);
  return u.pathname.replace(/0x0{63}1\b/, "0x…01");
};
const short = (url) => (url ? url.replace(/^https?:\/\/[^/]+/, "").replace(/^(.{60}).+$/, "$1…") : "(page)");

const rows = [];
const details = [];
for (const entry of manifest.filter((e) => e.isRepresentativeRun)) {
  const lhr = lhrOf(entry);
  const a = lhr.audits;
  const lcp = a["largest-contentful-paint"].numericValue;
  const cls = a["cumulative-layout-shift"].numericValue;
  const tbt = a["total-blocking-time"].numericValue;
  const items = a["resource-summary"]?.details?.items ?? [];
  const script = items.find((i) => i.resourceType === "script")?.transferSize ?? 0;
  rows.push(`| \`${path(entry.url)}\` | ${ms(lcp)}${mark(lcp <= LIMITS.lcp)} | ${cls.toFixed(3)}${mark(cls <= LIMITS.cls)} | ${ms(tbt)}${mark(tbt <= LIMITS.tbt)} | ${kb(script)} |`);

  const lines = [];
  const shifts = a["layout-shifts"]?.details?.items ?? [];
  if (shifts.length) lines.push("Layout shifts:", ...shifts.slice(0, 6).map((s) => `- ${Number(s.score).toFixed(4)} \`${s.node?.selector ?? "?"}\` ${s.node?.nodeLabel ? `“${String(s.node.nodeLabel).slice(0, 60)}”` : ""}`));
  const tasks = a["long-tasks"]?.details?.items ?? [];
  if (tasks.length) lines.push("Long tasks (simulated):", ...tasks.slice(0, 8).map((t) => `- ${ms(t.duration)} @ ${ms(t.startTime)} ${short(t.url)}`));
  const boot = a["bootup-time"]?.details?.items ?? [];
  if (boot.length) lines.push("Script cost (scripting / total):", ...boot.slice(0, 8).map((b) => `- ${ms(b.scripting)} / ${ms(b.total)} ${short(b.url)}`));
  details.push(`<details><summary>${path(entry.url)}</summary>\n\n${lines.join("\n")}\n\n</details>`);
}

const bench = manifest.filter((e) => e.isRepresentativeRun).map((e) => lhrOf(e).environment?.benchmarkIndex ?? 0);
const out = [
  ...(title ? [`### ${title}`, ""] : []),
  `Host benchmark index (median runs): ${Math.min(...bench).toFixed(0)}–${Math.max(...bench).toFixed(0)} — TBT scales with it; compare runs on the same host.`,
  "",
  "| Route | LCP (≤ 2,500) | CLS (≤ 0.05) | TBT (≤ 200) | Script |",
  "|---|---|---|---|---|",
  ...rows.sort(),
  "",
  ...details,
  "",
].join("\n");
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${out}\n`);
