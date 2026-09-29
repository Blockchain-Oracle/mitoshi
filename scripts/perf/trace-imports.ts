/**
 * Diagnosis for §3.1 (not a gate): follows STATIC imports (not `import()`, not `import type`) from an entry file through
 * `web/src` and the workspace packages, and prints the shortest chain that reaches each heavy module — so a lazy
 * island that leaked into first load can be traced to the import that pulls it.
 *
 *   pnpm --filter @cwf/scripts exec tsx perf/trace-imports.ts "web/src/app/(app)/layout.tsx" viem/tempo wagmi zod
 *   … --all   also lists every reachable module that imports each target
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..", "..");
const ALL = process.argv.includes("--all");
const [entry, ...targets] = process.argv.slice(2).filter((a) => a !== "--all");
if (!entry || targets.length === 0) throw new Error("usage: trace-imports <entry> <module>...");

const EXT = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];
function file(base: string): string | null {
  for (const e of EXT) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

const pkgExports = new Map<string, Record<string, string>>();
function workspace(spec: string): string | null {
  const m = /^@cwf\/([^/]+)(\/.*)?$/.exec(spec);
  if (!m) return null;
  const dir = join(repo, "packages", m[1]!);
  if (!pkgExports.has(dir)) pkgExports.set(dir, (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { exports: Record<string, string> }).exports);
  const exp = pkgExports.get(dir)!;
  const sub = `.${m[2] ?? ""}`;
  if (exp[sub]) return file(join(dir, exp[sub]!));
  if (exp["./*"] && m[2]) return file(join(dir, exp["./*"]!.replace("*", m[2].slice(1))));
  return null;
}

function resolveSpec(from: string, spec: string): string | { external: string } {
  if (spec.startsWith("@/")) return file(join(repo, "web/src", spec.slice(2))) ?? { external: spec };
  if (spec.startsWith(".")) return file(resolve(dirname(from), spec)) ?? { external: spec };
  return workspace(spec) ?? { external: spec };
}

const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/g;
const seen = new Map<string, string[]>();
const queue: string[][] = [[resolve(repo, entry)]];
const found = new Map<string, string[]>();
const importers = new Set<string>();
while (queue.length) {
  const path = queue.shift()!;
  const cur = path.at(-1)!;
  if (seen.has(cur)) continue;
  seen.set(cur, path);
  const src = readFileSync(cur, "utf8");
  for (const m of src.matchAll(IMPORT)) {
    const r = resolveSpec(cur, m[1]!);
    if (typeof r === "string") queue.push([...path, r]);
    else
      for (const t of targets) {
        if (r.external !== t && !r.external.startsWith(`${t}/`)) continue;
        if (ALL) importers.add(`${t} ← ${cur.replace(`${repo}/`, "")}`);
        if (!found.has(t)) found.set(t, [...path, r.external]);
      }
  }
}
for (const t of targets) {
  const chain = found.get(t);
  console.log(`\n${t}: ${chain ? "" : "not reached"}`);
  if (chain) for (const step of chain) console.log(`  → ${step.replace(`${repo}/`, "")}`);
}
if (ALL) for (const line of [...importers].sort()) console.log(line);
