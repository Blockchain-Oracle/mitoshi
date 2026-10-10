// After `next build`: mark every client chunk for eager compilation (V8 explicit compile hints, Chrome 136+:
// https://v8.dev/blog/explicit-compile-hints). A `//# allFunctionsCalledOnLoad` first line makes V8 parse and compile the
// file's functions on a background thread while it streams, instead of on the main thread the first time each runs.
// Turbopack wraps every module in a function, so without it each module's first evaluation paid a full parse there:
// /trade/BTC at 4x CPU, main-thread V8.ParseFunction 265–291 → 26–32 ms and blocking 119–144 → 6–18 ms (F-S23-08).
// Every chunk is loaded only when a page needs it, and what it holds runs on load, so the hint costs background compile
// (~155 ms on /trade), not main-thread time. Idempotent; with ANALYZE_MAPS=1 each chunk's map is shifted one line.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HINT = "//# allFunctionsCalledOnLoad\n";
const chunks = join(dirname(fileURLToPath(import.meta.url)), "..", ".next", "static", "chunks");

function* jsFiles(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* jsFiles(p);
    else if (e.name.endsWith(".js")) yield p;
  }
}

/** The generated code moved down one line: a leading empty line in `mappings`, or one more line per section offset. */
function shiftMap(path) {
  const map = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(map.sections)) for (const s of map.sections) s.offset.line += 1;
  else map.mappings = `;${map.mappings}`;
  writeFileSync(path, JSON.stringify(map));
}

if (!existsSync(chunks)) {
  console.error(`compile-hints: ${chunks} is missing — run after next build`);
  process.exit(1);
}
let hinted = 0;
for (const file of jsFiles(chunks)) {
  const src = readFileSync(file, "utf8");
  if (src.startsWith(HINT)) continue;
  writeFileSync(file, HINT + src);
  hinted += 1;
  const ref = /\/\/# sourceMappingURL=(\S+)\s*$/.exec(src)?.[1];
  if (ref && !ref.startsWith("data:") && existsSync(join(dirname(file), ref))) shiftMap(join(dirname(file), ref));
}
console.log(`compile-hints: ${hinted} chunks marked for eager compilation`);
