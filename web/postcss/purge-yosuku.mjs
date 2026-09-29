/**
 * Production-only PostCSS step (plan §3.1 "CSS per route", D-071): Masayume's Yosuku sheet (`src/styles/yosuku/part-*`,
 * byte-identical to the reference, 265 KB raw) styles every Masayume surface, most of which S1 does not render yet.
 * After Tailwind, drop the selectors that name a class Yosuku defines and the app's source never mentions. Next inlines
 * the imports before PostCSS, so rules can't be told apart by file; they are told apart by class ownership: a class no
 * Yosuku part defines (our sheets, Tailwind's utilities) is never considered, and element/attribute/keyframe selectors
 * pass through untouched. A stage that ports a
 * Masayume surface brings its class names into `src/`, so its Yosuku rules come back automatically; dev keeps the
 * whole sheet (no stale purge between edits).
 *
 * Tokens are every identifier-like string in `src/**` (.ts/.tsx/.mdx). A string prefix directly followed by a template
 * interpolation (`nav-menu-popup--${id}`) keeps every class starting with that prefix.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Builds run from `web/` (Turbopack evaluates PostCSS config and plugins without import.meta.dirname).
const SRC = join(process.cwd(), "src");

function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(tsx?|mdx)$/.test(name)) out.push(readFileSync(p, "utf8"));
  }
  return out;
}

/** Every class a Yosuku part defines (read from disk, the byte-identical split). */
function yosukuClasses() {
  const dir = join(SRC, "styles", "yosuku");
  const out = new Set();
  for (const name of readdirSync(dir).filter((n) => /^part-\d+\.css$/.test(n))) {
    const css = readFileSync(join(dir, name), "utf8").replace(/url\([^)]*\)/g, "");
    for (const m of css.matchAll(/\.(-?[_a-zA-Z](?:\\.|[\w-])*)/g)) out.add(m[1].replace(/\\(.)/g, "$1"));
  }
  return out;
}

function vocabulary() {
  const text = sources(SRC).join("\n");
  const tokens = new Set(text.match(/[A-Za-z0-9_-]+/g) ?? []);
  const prefixes = [...text.matchAll(/([A-Za-z][A-Za-z0-9_-]*-)\$\{/g)].map((m) => m[1]);
  return { tokens, prefixes };
}

const unescape = (s) => s.replace(/\\(.)/g, "$1");

/** @type {import('postcss').PluginCreator<{}>} */
const purgeYosuku = () => ({
  postcssPlugin: "purge-yosuku",
  OnceExit(root) {
    if (process.env.NODE_ENV !== "production" || process.env.PURGE_YOSUKU === "off") return;
    const { tokens, prefixes } = vocabulary();
    const owned = yosukuClasses();
    const known = (cls) => !owned.has(cls) || tokens.has(cls) || prefixes.some((p) => cls.startsWith(p));
    let dropped = 0;
    root.walkRules((rule) => {
      if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
      const keep = rule.selectors.filter((sel) => [...sel.matchAll(/\.(-?[_a-zA-Z](?:\\.|[\w-])*)/g)].every((m) => known(unescape(m[1]))));
      if (keep.length === rule.selectors.length) return;
      if (keep.length === 0) {
        rule.remove();
        dropped += 1;
      } else rule.selectors = keep;
    });
    // At-rules left empty by the purge (a @media whose every rule went).
    root.walkAtRules((at) => {
      if (at.nodes && at.nodes.length === 0 && at.name !== "layer") at.remove();
    });
    if (process.env.PURGE_YOSUKU_DEBUG) console.log(`[purge-yosuku] dropped ${dropped} rules`);
  },
});
purgeYosuku.postcss = true;
export default purgeYosuku;
