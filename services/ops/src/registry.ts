/**
 * Every actor ops can run (plan C.5.2), by `OPS_ACTORS` name. `spot: true` asks main for the process's spot feed.
 * The default set is the venue (`all` = the default set plus any named extra); `house-taker` is opt-in only.
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
  // Opt-in (S3 soak): house-key trades so an unattended soak exercises fills and auto-pay; never in the default set.
  "house-taker": { start: (d) => startHouseTaker(d) },
};

export const DEFAULT_ACTORS = ["chain-head", "archive", "spot", "indexer", "roller", "price-relay", "settler", "seed-maker", "halt-watch", "earnings", "calendar", "funds-watch"] as const;
