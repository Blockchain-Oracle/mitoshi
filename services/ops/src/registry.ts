/**
 * Every actor ops can run (plan C.5.2), by `OPS_ACTORS` name. `spot: true` asks main for the process's spot feed.
 * The default set is the venue (`all` = the default set plus any named extra); `house-taker`, `launch-keeper` and
 * `reference-writer` are opt-in only.
 */
import { archivePass, ARCHIVE_EVERY_MS } from "./actors/archive";
import { chainHeadPass, CHAIN_HEAD_EVERY_MS } from "./actors/chain-head";
import { startIndexer } from "./actors/indexer";
import { startWindowRoller } from "./actors/window-roller";
import { startPriceRelay } from "./actors/price-relay";
import { startSettler } from "./actors/settler";
import { startSeedMaker } from "./actors/seed-maker";
import { startLeverageKeeper } from "./actors/leverage-keeper";
import { startExitKeeper } from "./actors/exit-keeper";
import { startStrategyRunner } from "./actors/strategy-runner";
import { startAgentRater } from "./actors/agent-rater";
import { startEarnQuoter } from "./actors/earn-quoter";
import { startHaltWatch } from "./actors/halt-watch";
import { startEarnings } from "./calendar/earnings";
import { startCalendar } from "./calendar";
import { startFundsWatch } from "./actors/funds-watch";
import { startHouseTaker } from "./actors/house-taker";
import { indexerRecountPass, INDEXER_RECOUNT_EVERY_MS } from "./actors/indexer-recount";
import { referenceWriterPass, REFERENCE_WRITER_EVERY_MS } from "./actors/reference-writer";
import { keeperDeps, launchKeeperPass, LAUNCH_KEEPER_EVERY_MS, type GraduateSender } from "./actors/launch-keeper";
import { moderationPass, MODERATION_EVERY_MS } from "./actors/moderation";
import { startBridgeWatch } from "./actors/bridge-watch";
import { startReserveWatch } from "./actors/reserve-watch";
import { startStockSync } from "./actors/stock-sync";
import { memeAddresses } from "@cwf/markets/launch";
import { tempoReadClient } from "@cwf/markets";
import { createOpsClient, OpsSendError, sendOps } from "@cwf/markets/ops";
import { roleKey, runActor, type VenueDeps } from "./runtime";

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
  // S10c: settles and knocks out Boost positions (both permissionless, both pay the owner); `keeper` role key.
  "leverage-keeper": { start: (d) => startLeverageKeeper(d) },
  // S24.3: Trail / take-profit / stop-loss with the app closed — sells through the owners' EXIT grants at the vault's
  // fair-value floor; `keeper` role key; trails step on the display feed (so it asks for the spot/display runtime).
  "exit-keeper": { start: (d) => startExitKeeper(d), spot: true },
  // S9.5: the house strategy runner — places for each live subscriber through their STRATEGY grant (`placeFor`) on the
  // opening print vs the RedStone spot; `strategy-runner` role key; opt-in (not in the default set).
  "strategy-runner": { start: (d) => startStrategyRunner(d), spot: true },
  // S9.6: rates each strategy's ERC-8004 agent once per completed UTC day (AG-15, D-218.6); `agent-rater` role key;
  // opt-in and dry unless AGENT_RATER_LIVE=1.
  "agent-rater": { start: (d) => startAgentRater(d) },
  // S8: the maker vault's quotes (the depth Range, Moonshot and Parlay price against) and its closed-Window settles,
  // on the FairValueGuard's model at the signed spot; `earn-quoter` role key, the vault's maker.
  "earn-quoter": { start: (d) => startEarnQuoter(d), spot: true },
  // S3.5: the hourly Tempo Indexer API / tidx recount. Reads only on an API key or self-hosted tidx (idles with the
  // reason until one is configured); a paid MPP route honours DRY_RUN inside the pass. Needs DATABASE_URL.
  "indexer-recount": {
    start: (d) => {
      if (!d.sql) throw new Error("indexer-recount needs DATABASE_URL");
      return runActor({ name: "indexer-recount", log: d.log, dryRun: d.env.dryRun, everyMs: INDEXER_RECOUNT_EVERY_MS, pass: indexerRecountPass(d.env, d.sql) });
    },
  },
  // S13 (D-043): the moderation queue in the heartbeat; signs nothing, needs DATABASE_URL.
  moderation: {
    start: (d) => {
      if (!d.sql) throw new Error("moderation needs DATABASE_URL");
      return runActor({ name: "moderation", log: d.log, dryRun: false, everyMs: MODERATION_EVERY_MS, pass: moderationPass(d.sql, d.log) });
    },
  },
  // S14 14o (R4-12, D-227): the bridge's watchers. bridge-watch follows recorded transfers leg by leg (LayerZero Scan +
  // receipts), re-runs a stored compose once its Base float can pay (stock-sync key; DRY_RUN never sends) and reports
  // the hop floats; reserve-watch snapshots every ticker's reserve and alerts; both need DATABASE_URL. stock-sync pushes
  // Robinhood multipliers through StockSyncSender (stock-sync key) and idles, saying why, until that is deployed.
  "bridge-watch": { start: (d) => startBridgeWatch(d) },
  "reserve-watch": { start: (d) => startReserveWatch(d) },
  "stock-sync": { start: (d) => startStockSync(d) },
  // Opt-in (S3 soak): house-key trades so an unattended soak exercises fills and auto-pay; never in the default set.
  "house-taker": { start: (d) => startHouseTaker(d) },
  // Opt-in (S17b): graduates Complete memecoins. R4-11 (D-227): its sender is `sendOps` (`sendBatch`, self-paid, an
  // expiring nonce so it shares the `keeper` key with reference-writer safely) from `LAUNCH_KEEPER_PRIVATE_KEY`, else the
  // `keeper` role's key; DRY_RUN / no key plans and simulates only. Add it to OPS_ACTORS to run it.
  "launch-keeper": {
    start: (d) => {
      const a = memeAddresses(d.env.network === "mainnet" ? 4217 : 42431);
      const key = roleKey("launch-keeper", d.env.network, process.env, d.env.keysDir) ?? roleKey("keeper", d.env.network, process.env, d.env.keysDir);
      const ops = createOpsClient({ network: d.env.network, rpcUrl: d.env.tempoRpcUrl, privateKey: key, tier: 2 });
      const dryRun = d.env.dryRun || !ops.address;
      if (!ops.address) d.log("LAUNCH_KEEPER_PRIVATE_KEY / KEEPER_PRIVATE_KEY missing: planning and simulating only");
      const account = (ops.address ?? process.env.LAUNCH_KEEPER_ADDRESS ?? a.launchpad) as `0x${string}`;
      const deps = keeperDeps(tempoReadClient(d.env.network, d.env.tempoRpcUrl), a, account);
      const sender: GraduateSender | undefined = ops.address
        ? {
            account: ops.address,
            send: async (calls) => {
              try {
                const sent = await sendOps(ops, calls);
                return { hash: sent.hash, status: "success" };
              } catch (error) {
                if (error instanceof OpsSendError && error.txHash) return { hash: error.txHash, status: "reverted" };
                throw error;
              }
            },
          }
        : undefined;
      return runActor({ name: "launch-keeper", log: d.log, dryRun, everyMs: LAUNCH_KEEPER_EVERY_MS, pass: launchKeeperPass({ deps, launchpad: a.launchpad, dryRun, sender }) });
    },
  },
  // Opt-in (S15b): keeps StockReference fresh — RedStone pushes + the keeper session flag, signed with
  // KEEPER_PRIVATE_KEY (pushRedStone + setSession). DRY_RUN / OPS_DRY_ACTORS log the batch and never sign.
  "reference-writer": { start: (d) => runActor({ name: "reference-writer", log: d.log, dryRun: d.env.dryRun, everyMs: REFERENCE_WRITER_EVERY_MS, pass: referenceWriterPass(d.env) }) },
};

export const DEFAULT_ACTORS = ["chain-head", "archive", "spot", "indexer", "roller", "price-relay", "settler", "seed-maker", "halt-watch", "earnings", "calendar", "funds-watch", "indexer-recount", "leverage-keeper", "exit-keeper", "earn-quoter", "moderation", "bridge-watch", "reserve-watch", "stock-sync"] as const;
