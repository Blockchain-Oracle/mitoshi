/** Writes `web/src/styles/tokens.generated.css`; `--check` fails when the file is stale (CI). */
import { readFileSync, writeFileSync } from "node:fs";
import { renderTokensCss } from "./css";
import { OUT } from "./generate-path";

const css = renderTokensCss();
if (process.argv.includes("--check")) {
  const current = readFileSync(OUT, "utf8");
  if (current !== css) {
    console.error(`${OUT} is stale: run pnpm --filter @cwf/tokens gen`);
    process.exit(1);
  }
} else {
  writeFileSync(OUT, css);
  console.log(`wrote ${OUT}`);
}
