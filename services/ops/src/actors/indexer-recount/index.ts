/**
 * The hourly indexer recount (plan C.4.3): per event of each deployed contract on this network (`indexerSources`,
 * generated), the Tempo Indexer API / self-hosted tidx count against the chain's own `eth_getLogs` count over the same
 * closed range, stored in `indexer_recounts`; a mismatch is the why-string. Reads only — unless the indexer is reached
 * via MPP, where each query is a paid request (recorded in `mpp_receipts`), so that route honours DRY_RUN.
 */
import { NETWORKS } from "@cwf/core";
import { indexerSources } from "@cwf/clients";
import { insertMppReceipt, insertRecounts, type Sql } from "@cwf/db";
import { tempoReadClient } from "@cwf/markets";
import { indexerClientFromEnv, recount, rpcLogCounter, withReceiptScope, type RecountSource } from "@cwf/markets/server";
import type { OpsEnv, PassResult } from "../../runtime";

export const INDEXER_RECOUNT_EVERY_MS = 60 * 60_000;

export function indexerRecountPass(env: OpsEnv, sql: Sql): () => Promise<PassResult> {
  const chainId = NETWORKS[env.network];
  const rpc = tempoReadClient(env.network, env.tempoRpcUrl);
  const configured = indexerClientFromEnv(process.env, (row) => insertMppReceipt(sql, row).then(() => undefined));
  const sources = ((indexerSources as Record<string, readonly RecountSource[]>)[String(chainId)] ?? []) as readonly RecountSource[];
  return async () => {
    if (!configured.client) return { why: `idle: ${configured.reason}` };
    if (configured.client.via === "mpp" && env.dryRun) return { why: "DRY RUN: the indexer is paid per query via MPP; set DRY_RUN=0 to recount" };
    if (!sources.length) return { why: `no deployed contracts with events on ${chainId}` };
    const head = await rpc.getBlockNumber();
    const result = await withReceiptScope({ purpose: "indexer-recount" }, () =>
      recount({ chainId, indexer: configured.client!, sources, local: rpcLogCounter(rpc), headBlock: head }),
    );
    await insertRecounts(sql, result.rows.map((r) => ({ ...r, via: result.via })));
    const detail = { toBlock: Number(result.toBlock), via: result.via, events: result.rows.length, mismatches: result.mismatches.length, uncovered: result.uncovered.length };
    if (result.mismatches.length) {
      const first = result.mismatches.slice(0, 3).map((m) => `${m.contract}.${m.event} indexer ${m.indexerCount} vs chain ${m.localCount}`).join("; ");
      return { why: `MISMATCH at ≤${result.toBlock} via ${result.via}: ${first}`, detail };
    }
    const behind = result.uncovered.length ? `; ${result.uncovered.length} contract(s) not yet covered by the indexer` : "";
    return { why: `recount ok at ≤${result.toBlock} via ${result.via}: ${result.rows.length} events match${behind}`, detail };
  };
}
