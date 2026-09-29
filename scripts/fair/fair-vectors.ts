/**
 * Writes the shared TS↔Solidity fair-value vectors (A.5.4):
 *
 *   tsx scripts/fair/fair-vectors.ts
 *
 * The builder lives in `packages/core/src/fair/fairVectors.ts`; `fair.test.ts` fails if the committed file drifts from
 * it, and `contracts/test/fair/FairValue.t.sol` replays every row on `FairValue.sol`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFairVectors } from "@cwf/core";

const out = join(import.meta.dirname, "..", "..", "packages", "core", "src", "fair", "fair.vectors.json");
const v = buildFairVectors();
writeFileSync(out, `${JSON.stringify(v)}\n`);
console.log(`wrote ${out}: ${v.spotE8.length} rows; max |ΔP| ${v.maxUpE6Diff} e-6, max |Δticks| ${v.maxTicksDiff} vs Agari`);
