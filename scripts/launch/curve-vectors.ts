/**
 * Writes the shared TS↔Solidity curve vectors (plan B.6 `CurveMath.t.sol`):
 *
 *   tsx scripts/launch/curve-vectors.ts
 *
 * The builder lives in `packages/core/src/launch/curveVectors.ts`; `curve.test.ts` fails if the committed file drifts
 * from it, and `contracts/test/tempo/launch/CurveMath.t.sol` replays every vector on `CurveMath.sol`.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCurveVectors } from "@cwf/core";

const out = join(import.meta.dirname, "..", "..", "packages", "core", "src", "launch", "curve.vectors.json");
const vectors = buildCurveVectors();
writeFileSync(out, `${JSON.stringify(vectors, null, 1)}\n`);
console.log(`wrote ${out}: ${vectors.curves.length} curves, ${vectors.curves.reduce((n, c) => n + c.steps.length, 0)} steps, ${vectors.fees.length} fee and ${vectors.gross.length} gross vectors`);
