/**
 * R4-11 (D-227): one pass of ops' `reference-writer` on Moderato, run here — the RedStone gateway's signed spots for
 * every mirror with a signed source (pushRedStone, verified on chain) and the keeper session flag from RedStone's
 * signed NY_MARKET_NEXT_CHANGE_TIME (setSession), one batch from the keeper role. Dry by default (prints the plan);
 * `--send` signs with the `keeper` role key read from ~/.config/cwf/testnet (never printed).
 *
 *   tsx scripts/drive/r4-11-reference-pass.ts [--send]
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readOpsEnv } from "../../services/ops/src/runtime/env";
import { referenceWriterPass } from "../../services/ops/src/actors/reference-writer/index";

const send = process.argv.includes("--send");
if (send) process.env.KEEPER_PRIVATE_KEY = (JSON.parse(readFileSync(join(homedir(), ".config", "cwf", "testnet", "keeper.json"), "utf8")) as { privateKey: string }).privateKey;
const env = { ...readOpsEnv({ ...process.env, NETWORK: "testnet", DRY_RUN: send ? "0" : "1" }), network: "testnet" as const };
const r = await referenceWriterPass(env)();
console.log(`pass: ${r.why}`);
console.log(JSON.stringify(r.detail ?? {}));
process.exit(0);
