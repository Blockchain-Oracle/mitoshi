/**
 * The indexer recount (plan C.4.3; R6, D-230): the logs the Tempo Indexer API / self-hosted tidx holds for each
 * deployed contract on this network (`indexerSources`, generated), per topic0, against the chain's own `eth_getLogs`
 * over the same blocks — only the blocks the index holds, tile by tile (`recountPass`). The index's gaps are reported
 * and compared once it backfills them. Results go to `indexer_recounts`, progress to `indexer_recount_tiles`.
 *
 * Hourly once history is compared; every minute while it catches up or after the key's rate limit cut a pass short.
 * Indexer queries are paced under the key's limit; the chain walk rides the shared RPC budget as bookkeeping (tier 2).
 * Reads only — unless the indexer is reached via MPP, where each query is a paid request (recorded in
 * `mpp_receipts`), so that route honours DRY_RUN.
 */
import { NETWORKS } from "@cwf/core";
import { indexerSources } from "@cwf/clients";
import { commitRecount, insertMppReceipt, loadRecountTiles, type Sql } from "@cwf/db";
import { createOpsClient } from "@cwf/markets/ops";
import { indexerClientFromEnv, recountPass, rpcLogWalk, withReceiptScope, type RecountSource } from "@cwf/markets/server";
import type { OpsEnv, PassResult } from "../../runtime";
import { recountReport } from "./report";

export const INDEXER_RECOUNT_EVERY_MS = 60 * 60_000;

/** One `eth_getLogs` per 10,000 blocks: Alchemy's range cap, and under the public RPC's 20,000-log cap on Moderato. */
const WALK_BLOCKS = 10_000n;

export function indexerRecountPass(env: OpsEnv, sql: Sql): () => Promise<PassResult> {
  const chainId = NETWORKS[env.network];
  const rpc = createOpsClient({ network: env.network, rpcUrl: env.tempoRpcUrl, tier: 2 }).public;
  const walk = rpcLogWalk(rpc, { initialBlocks: WALK_BLOCKS, maxBlocks: WALK_BLOCKS });
  const configured = indexerClientFromEnv(process.env, (row) => insertMppReceipt(sql, row).then(() => undefined));
  const sources = ((indexerSources as Record<string, readonly RecountSource[]>)[String(chainId)] ?? []) as readonly RecountSource[];
  return async () => {
    if (!configured.client) return { why: `idle: ${configured.reason}` };
    const indexer = configured.client;
    if (indexer.via === "mpp" && env.dryRun) return { why: "DRY RUN: the indexer is paid per query via MPP; set DRY_RUN=0 to recount" };
    if (!sources.length) return { why: `no deployed contracts with events on ${chainId}` };
    const headBlock = await rpc.getBlockNumber();
    const tiles = await loadRecountTiles(sql, chainId, indexer.via);
    const result = await withReceiptScope({ purpose: "indexer-recount" }, () =>
      recountPass({ chainId, indexer, sources, walk, headBlock, tiles, commit: ({ tile, rows }) => commitRecount(sql, { chainId, via: indexer.via, tile, rows }) }),
    );
    return recountReport(result, indexer.pacer?.stats() ?? null, INDEXER_RECOUNT_EVERY_MS);
  };
}
