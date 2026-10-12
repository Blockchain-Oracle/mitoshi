/**
 * Route budgets (plan §3.1, D42), gating CI. For every app-router page in the production build, first-load JS is the
 * union of the build's `rootMainFiles` and every `entryJSFiles` entry in the page's client-reference manifest (root
 * layout, group layout, boundaries, loading, page) — the chunks the browser fetches before the route is interactive.
 * Each file is gzipped (level 9) and summed. Lazy islands (`import()`) are not in these lists, which is the point.
 * CSS per route is gated too (only the route's CSS, never a 650 KB global sheet).
 *
 * D-071: Next 16 + React 19.2's own runtime (`rootMainFiles`) is 127.6 KB gzip — above §3.1's 120 KB site figure by
 * itself — so site pages are gated on what they OWN (first load minus that framework floor), and the floor has its own
 * ceiling so a framework upgrade that grows it fails loudly. App routes keep the §3.1 total.
 *
 *   pnpm perf:budgets            # after `pnpm build`; exits 1 when any route is over budget
 *   pnpm perf:budgets --json     # machine-readable
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";
import vm from "node:vm";

const KB = 1024;
/** §3.1 as amended by D-071 (gzip): site-owned JS ≤ 35 KB over the framework floor; app routes ≤ 250 KB total. */
export const BUDGETS = { site: 35 * KB, app: 250 * KB } as const;
/** D-071: the framework floor's own ceiling, and the per-route CSS ceiling (both ratchets). */
export const FRAMEWORK_FLOOR_MAX = 130 * KB;
export const CSS_MAX = 55 * KB;

const root = join(import.meta.dirname, "..", "..", "web", ".next");
const appDir = join(root, "server", "app");

function manifests(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...manifests(p));
    else if (name === "page_client-reference-manifest.js") out.push(p);
  }
  return out;
}

function readManifest(file: string): { entryJSFiles: Record<string, string[]>; entryCSSFiles: Record<string, { path: string }[]> } {
  const sandbox: { self: Record<string, unknown>; globalThis?: unknown } = { self: {} };
  sandbox.globalThis = sandbox.self;
  vm.runInNewContext(readFileSync(file, "utf8"), sandbox);
  const all = (sandbox.self as { __RSC_MANIFEST: Record<string, never> }).__RSC_MANIFEST;
  return Object.values(all)[0]!;
}

const gz = new Map<string, number>();
function gzipped(path: string): number {
  let size = gz.get(path);
  if (size === undefined) gz.set(path, (size = gzipSync(readFileSync(join(root, path)), { level: 9 }).length));
  return size;
}

/** `(app)/markets/[id]` → route `/markets/[id]`, group from the route group. Since D-226 only `/` and `/pitch` are in the
 *  site group; docs, proof, news, stats and status render in the app shell and take the app budget. */
function classify(dirRel: string): { route: string; kind: keyof typeof BUDGETS } {
  const parts = dirRel.split(sep).filter(Boolean);
  const group = parts.find((p) => p.startsWith("("));
  const route = `/${parts.filter((p) => !p.startsWith("(")).join("/")}`;
  const site = group === "(site)";
  return { route, kind: site ? "site" : "app" };
}

export interface RouteReport {
  route: string;
  kind: keyof typeof BUDGETS;
  jsBytes: number;
  /** What the budget is checked against: site = jsBytes − framework floor; app = jsBytes. */
  gatedBytes: number;
  cssBytes: number;
  budget: number;
  files: number;
  over: boolean;
}

/** The first-load chunk files of one route (e.g. "/markets"), as paths under `.next`. */
export function routeChunks(route: string): string[] {
  const build = JSON.parse(readFileSync(join(root, "build-manifest.json"), "utf8")) as { rootMainFiles: string[] };
  const file = manifests(appDir).find((f) => classify(relative(appDir, join(f, ".."))).route === route);
  if (!file) throw new Error(`no page manifest for ${route}`);
  return [...new Set([...build.rootMainFiles, ...Object.values(readManifest(file).entryJSFiles).flat()])];
}

export function frameworkFloor(): number {
  const build = JSON.parse(readFileSync(join(root, "build-manifest.json"), "utf8")) as { rootMainFiles: string[] };
  return build.rootMainFiles.reduce((n, f) => n + gzipped(f), 0);
}

export function measure(): RouteReport[] {
  const build = JSON.parse(readFileSync(join(root, "build-manifest.json"), "utf8")) as { rootMainFiles: string[] };
  const floor = frameworkFloor();
  return manifests(appDir)
    .map((file) => {
      const dirRel = relative(appDir, join(file, ".."));
      const { route, kind } = classify(dirRel);
      const m = readManifest(file);
      const js = new Set([...build.rootMainFiles, ...Object.values(m.entryJSFiles).flat()]);
      const css = new Set(Object.values(m.entryCSSFiles ?? {}).flat().map((c) => c.path));
      const jsBytes = [...js].reduce((n, f) => n + gzipped(f), 0);
      const cssBytes = [...css].reduce((n, f) => n + gzipped(f), 0);
      const gatedBytes = kind === "site" ? jsBytes - floor : jsBytes;
      return { route, kind, jsBytes, gatedBytes, cssBytes, budget: BUDGETS[kind], files: js.size, over: gatedBytes > BUDGETS[kind] || cssBytes > CSS_MAX };
    })
    .filter((r) => !r.route.startsWith("/_"))
    .sort((a, b) => b.gatedBytes / b.budget - a.gatedBytes / a.budget);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = measure();
  const floor = frameworkFloor();
  const k = (n: number) => `${(n / KB).toFixed(1)} KB`;
  if (process.argv.includes("--json")) console.log(JSON.stringify({ frameworkFloor: floor, rows }, null, 2));
  else {
    console.log(`framework floor (rootMainFiles) ${k(floor)} / ${k(FRAMEWORK_FLOOR_MAX)}\n`);
    for (const r of rows) {
      const gated = r.kind === "site" ? `owned ${k(r.gatedBytes).padStart(8)} / ${k(r.budget)} (total ${k(r.jsBytes)})` : `total ${k(r.gatedBytes).padStart(8)} / ${k(r.budget)}`;
      console.log(`${r.over ? "OVER" : "ok  "}  ${r.route.padEnd(26)} ${r.kind.padEnd(4)} ${gated}  css ${k(r.cssBytes)} / ${k(CSS_MAX)}  (${r.files} chunks)`);
    }
  }
  const over = rows.filter((r) => r.over);
  const floorOver = floor > FRAMEWORK_FLOOR_MAX;
  console.log(over.length || floorOver ? `\n${over.length} route(s) over budget${floorOver ? "; framework floor over its ceiling" : ""}` : `\n${rows.length} routes within budget`);
  process.exit(over.length || floorOver ? 1 : 0);
}
