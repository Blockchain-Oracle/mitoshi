// Ported from Masayume 68f7a09:scripts/invariants/lib/walk.mjs (ignore list extended for this repo).
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const IGNORED_DIR_NAMES = new Set(["node_modules", ".next", "dist", "out", ".git", "coverage", ".turbo", "cache", "broadcast", ".expo", "ios", "android"]);
const IGNORED_REL_PATHS = new Set(["reference", "contracts/lib", "contracts/node_modules", "context", "data"]);

function toPosix(path) {
  return path.split(sep).join("/");
}

/** Recursively lists files under `scope` (relative to root) whose extension is in `exts`, skipping build output and vendored trees. */
export function walkFiles(root, scope, exts, exclude = []) {
  const start = join(root, scope);
  if (!existsSync(start)) return [];
  const found = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = toPosix(relative(root, abs));
      if (IGNORED_REL_PATHS.has(rel) || exclude.some((prefix) => rel === prefix || rel.startsWith(`${prefix}/`))) continue;
      if (statSync(abs).isDirectory()) {
        if (!IGNORED_DIR_NAMES.has(name)) visit(abs);
      } else if (exts.some((ext) => name.endsWith(ext))) {
        found.push({ rel, abs });
      }
    }
  };
  visit(start);
  return found;
}

export function readText(abs) {
  return readFileSync(abs, "utf8");
}

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

/** Yields `[lineNumber, line]` for non-comment lines so prose in comments never trips a code rule. */
export function* codeLines(text) {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!COMMENT_LINE.test(line)) yield [i + 1, line];
  }
}
