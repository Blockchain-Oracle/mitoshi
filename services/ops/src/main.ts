/** Ops entry: one process per network on Fly, every actor on `runActor`, one HTTP server (plan D-032, C.5). */
import { startHttp } from "./http/server";
import { readOpsEnv, runActor, heartbeats, errorText } from "./runtime";
import { chainHeadPass, CHAIN_HEAD_EVERY_MS } from "./actors/chain-head";
import { archivePass, ARCHIVE_EVERY_MS } from "./actors/archive";
import { referenceWriterPass, REFERENCE_WRITER_EVERY_MS } from "./actors/reference-writer";
import { keeperDeps, launchKeeperPass, LAUNCH_KEEPER_EVERY_MS } from "./actors/launch-keeper";
import { memeAddresses } from "@cwf/markets/launch";
import { tempoReadClient } from "@cwf/markets";
import { createSql, runMigrations } from "@cwf/db";

const env = readOpsEnv();
const log = (actor: string) => (why: string) => console.log(JSON.stringify({ t: new Date().toISOString(), actor, why }));

const registry: Record<string, () => void> = {
  "chain-head": () => runActor({ name: "chain-head", log: log("chain-head"), dryRun: env.dryRun, everyMs: CHAIN_HEAD_EVERY_MS, pass: chainHeadPass(env) }),
  // Signs nothing, so it runs regardless of DRY_RUN; it only needs DATABASE_URL.
  archive: () => runActor({ name: "archive", log: log("archive"), dryRun: false, everyMs: ARCHIVE_EVERY_MS, pass: archivePass(createSql()) }),
  // Opt-in: signs with KEEPER_PRIVATE_KEY (pushRedStone + setSession on StockReference, S15b).
  "reference-writer": () => runActor({ name: "reference-writer", log: log("reference-writer"), dryRun: env.dryRun, everyMs: REFERENCE_WRITER_EVERY_MS, pass: referenceWriterPass(env) }),
  // Opt-in (not in the default set): graduates Complete memecoins. Until S1's `tx/send.ts` is wired as its sender it
  // plans and simulates only (dry), from the keeper role's address.
  "launch-keeper": () => {
    const a = memeAddresses(env.network === "mainnet" ? 4217 : 42431);
    const account = (process.env.LAUNCH_KEEPER_ADDRESS ?? a.launchpad) as `0x${string}`;
    const deps = keeperDeps(tempoReadClient(env.network, env.tempoRpcUrl), a, account);
    runActor({ name: "launch-keeper", log: log("launch-keeper"), dryRun: true, everyMs: LAUNCH_KEEPER_EVERY_MS, pass: launchKeeperPass({ deps, launchpad: a.launchpad, dryRun: true }) });
  },
};

/** Actors that start only when named in `OPS_ACTORS` (the S3 lane owns the deployed set). */
const OPT_IN = new Set(["launch-keeper", "reference-writer"]);

try {
  if (process.env.DATABASE_URL) {
    const sql = createSql();
    const applied = await runMigrations(sql);
    await sql.end();
    console.log(`[ops] migrations: ${applied.length ? applied.join(", ") : "up to date"}`);
  }
  const wanted = env.actors.length ? env.actors : Object.keys(registry).filter((name) => !OPT_IN.has(name));
  for (const name of wanted) {
    const start = registry[name];
    if (!start) throw new Error(`unknown actor "${name}" (known: ${Object.keys(registry).join(", ")})`);
    start();
  }
  startHttp(env.httpPort);
  console.log(`[ops] network=${env.network} dryRun=${env.dryRun} actors=${wanted.join(",")}`);
} catch (error) {
  console.error(`[ops] start failed: ${errorText(error)}`);
  process.exit(78);
}

setInterval(() => {
  for (const beat of heartbeats()) {
    if (beat.passStartedMs !== null && Date.now() - beat.passStartedMs > env.stuckPassMs) {
      console.error(`[ops] ${beat.actor} pass stuck for ${Date.now() - beat.passStartedMs} ms; exiting`);
      process.exit(70);
    }
  }
}, 30_000).unref();
