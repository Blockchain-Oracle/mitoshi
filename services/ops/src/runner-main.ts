// Ported from Agari 03b30ab:services/ops/src/runner-main.ts — on Tempo, with the process's own RedStone spot and the
// runner's own database (its attempts, fills and heartbeats).
/**
 * The strategy runner on its own (L-55 "self-host"): the entry point for a creator who hosts their bot — the same actor
 * the house runs, over the key `RUNNER_PRIVATE_KEY` (or `STRATEGY_RUNNER_PRIVATE_KEY`) names, for the strategies in
 * `STRATEGY_IDS` (or every strategy naming that key). Nothing else of the ops service starts. Needs `DATABASE_URL`
 * (its own Postgres: migrations run here) with the index the runner reads (run `OPS_ACTORS=indexer` beside it or point
 * at a database that has one). Dry unless `DRY_RUN=0` — a runner never trades by default.
 *
 *   NETWORK=testnet RUNNER_PRIVATE_KEY=0x… DATABASE_URL=… DRY_RUN=0 pnpm --filter @cwf/ops exec tsx src/runner-main.ts
 */
import { createSql, runMigrations } from "@cwf/db";
import { startStrategyRunner } from "./actors/strategy-runner";
import { loadRedstoneSources } from "./prices/redstone-gateway";
import { createSpotFeed } from "./prices/spot";
import { createBus, errorText, readOpsEnv, redact } from "./runtime";

const line = (actor: string, why: string) => console.log(JSON.stringify({ t: new Date().toISOString(), actor, why: redact(why) }));

async function main(): Promise<void> {
  if (!process.env.STRATEGY_RUNNER_PRIVATE_KEY && process.env.RUNNER_PRIVATE_KEY) process.env.STRATEGY_RUNNER_PRIVATE_KEY = process.env.RUNNER_PRIVATE_KEY;
  const env = readOpsEnv();
  if (!process.env.DATABASE_URL) throw new Error("the runner needs DATABASE_URL (its attempts, fills and the index it reads)");
  const sql = createSql();
  const applied = await runMigrations(sql);
  line("runner", `migrations: ${applied.length ? applied.join(", ") : "up to date"}`);
  const spot = createSpotFeed({ sources: loadRedstoneSources(), log: (why) => line("spot-feed", why) });
  spot.start();
  startStrategyRunner({ env, log: (why) => line("strategy-runner", why), sql, spot, bus: createBus() });
}

main().catch((error: unknown) => {
  line("runner", `start failed: ${errorText(error)}`);
  process.exit(78);
});
