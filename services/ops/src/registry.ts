/**
 * Every actor ops can run (plan C.5.2), by `OPS_ACTORS` name. `spot: true` asks main for the process's spot feed.
 * The default set is the venue (`all` = the default set plus any named extra); `house-taker` and `launch-keeper` are
 * opt-in only.
 */
import { archivePass, ARCHIVE_EVERY_MS } from "./actors/archive";
import { chainHeadPass, CHAIN_HEAD_EVERY_MS } from "./actors/chain-head";
import { startIndexer } from "./actors/indexer";
import { startWindowRoller } from "./actors/window-roller";
import { startPriceRelay } from "./actors/price-relay";
import { startSettler } from "./actors/settler";
import { startSeedMaker } from "./actors/seed-maker";
import { startHaltWatch } from "./actors/halt-watch";
import { startEarnings } from "./calendar/earnings";
import { startCalendar } from "./calendar";
import { startFundsWatch } from "./actors/funds-watch";
import { startHouseTaker } from "./actors/house-taker";
import { indexerRecountPass, INDEXER_RECOUNT_EVERY_MS } from "./actors/indexer-recount";
import { keeperDeps, launchKeeperPass, LAUNCH_KEEPER_EVERY_MS } from "./actors/launch-keeper";
import { memeAddresses } from "@cwf/markets/launch";
import { tempoReadClient } from "@cwf/markets";
import { runActor, type VenueDeps } from "./runtime";

export interface ActorEntry {
  start(deps: VenueDeps): Promise<unknown> | unknown;
  spot?: boolean;
}

export const ACTORS: Record<string, ActorEntry> = {
  "chain-head": { start: (d) => runActor({ name: "chain-head", log: d.log, dryRun: d.env.dryRun, everyMs: CHAIN_HEAD_EVERY_MS, pass: chainHeadPass(d.env) }) },
  // Signs nothing, so it runs regardless of DRY_RUN; it needs DATABASE_URL.
  archive: {
    start: (d) => {
      if (!d.sql) throw new Error("archive needs DATABASE_URL");
      return runActor({ name: "archive", log: d.log, dryRun: false, everyMs: ARCHIVE_EVERY_MS, pass: archivePass(d.sql) });
    },
  },
  spot: { start: () => undefined, spot: true },
  indexer: { start: (d) => startIndexer(d) },
  roller: { start: (d) => startWindowRoller(d) },
  "price-relay": { start: (d) => startPriceRelay(d) },
  settler: { start: (d) => startSettler(d) },
  "seed-maker": { start: (d) => startSeedMaker(d), spot: true },
  "halt-watch": { start: (d) => startHaltWatch(d), spot: true },
  earnings: { start: (d) => startEarnings(d) },
  calendar: { start: (d) => startCalendar(d) },
  "funds-watch": { start: (d) => startFundsWatch(d) },
  // S3.5: the hourly Tempo Indexer API / tidx recount. Reads only on an API key or self-hosted tidx (idles with the
  // reason until one is configured); a paid MPP route honours DRY_RUN inside the pass. Needs DATABASE_URL.
  "indexer-recount": {
    start: (d) => {
      if (!d.sql) throw new Error("indexer-recount needs DATABASE_URL");
      return runActor({ name: "indexer-recount", log: d.log, dryRun: d.env.dryRun, everyMs: INDEXER_RECOUNT_EVERY_MS, pass: indexerRecountPass(d.env, d.sql) });
    },
  },
  // Opt-in (S3 soak): house-key trades so an unattended soak exercises fills and auto-pay; never in the default set.
  "house-taker": { start: (d) => startHouseTaker(d) },
  // Opt-in (S17b): graduates Complete memecoins. Until `tx/send.ts` is wired as its sender (D-098) it plans and
  // simulates only (dry), from the keeper role's address.
  "launch-keeper": {
    start: (d) => {
      const a = memeAddresses(d.env.network === "mainnet" ? 4217 : 42431);
      const account = (process.env.LAUNCH_KEEPER_ADDRESS ?? a.launchpad) as `0x${string}`;
      const deps = keeperDeps(tempoReadClient(d.env.network, d.env.tempoRpcUrl), a, account);
      return runActor({ name: "launch-keeper", log: d.log, dryRun: true, everyMs: LAUNCH_KEEPER_EVERY_MS, pass: launchKeeperPass({ deps, launchpad: a.launchpad, dryRun: true }) });
    },
  },
};

export const DEFAULT_ACTORS = ["chain-head", "archive", "spot", "indexer", "roller", "price-relay", "settler", "seed-maker", "halt-watch", "earnings", "calendar", "funds-watch", "indexer-recount"] as const;
