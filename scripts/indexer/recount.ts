/**
 * The recount by hand (plan C.4.3; R6; the ops actor `indexer-recount` runs it hourly): the configured indexer
 * (TIDX_URL / TEMPO_INDEXER_API_KEY / INDEXER_VIA_MPP) against the chain's `eth_getLogs`, per contract and topic0, over
 * the blocks the index holds, paced under the key's rate limit. Prints the index's gaps and every compared item.
 *
 * Without DATABASE_URL it starts from nothing and runs passes until history is compared (or --passes N). With it,
 * it resumes from and records to the same tables as ops (`indexer_recount_tiles`, `indexer_recounts`) — run it
 * against a database ops doesn't use, or stop the actor first. --from-block N narrows the history (a quick check).
 *
 *   NETWORK=testnet TEMPO_INDEXER_API_KEY=… TEMPO_RPC_HTTP_URL=… tsx scripts/indexer/recount.ts [--from-block N] [--passes N]
 */
import { NETWORKS, networkFrom } from "@cwf/core";
import { indexerSources } from "@cwf/clients";
import { commitRecount, createSql, loadRecountTiles, runMigrations } from "@cwf/db";
import { tempoReadClient } from "@cwf/markets";
import { formatRange, indexerClientFromEnv, recountPass, rpcLogWalk, type RecountSource, type TileState } from "@cwf/markets/server";

const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
const network = networkFrom(process.env.NETWORK);
const chainId = NETWORKS[network];
const configured = indexerClientFromEnv();
if (!configured.client) throw new Error(configured.reason);
const indexer = configured.client;
const rpc = tempoReadClient(network, process.env.TEMPO_RPC_HTTP_URL);
const walk = rpcLogWalk(rpc, { initialBlocks: 10_000n, maxBlocks: 10_000n, onRefused: (a, b, why) => console.log(`  rpc refused ${a}-${b}: ${why.split("\n")[0]}`) });
const floor = arg("--from-block") ? BigInt(arg("--from-block")!) : null;
const passes = Number(arg("--passes") ?? 50);
const all = (indexerSources as Record<string, readonly RecountSource[]>)[String(chainId)] ?? [];
// A floor clips every deploy block up to it: history before it is left alone.
const sources = floor === null ? all : all.map((s) => ({ ...s, deployBlock: s.deployBlock === null ? null : Math.max(s.deployBlock, Number(floor)) }));

const sql = process.env.DATABASE_URL ? createSql() : null;
if (sql) await runMigrations(sql);
const tiles = new Map<bigint, TileState>(sql ? (await loadRecountTiles(sql, chainId, indexer.via)).map((t) => [t.tileFrom, t]) : []);
let mismatches = 0;

for (let pass = 1; pass <= passes; pass++) {
  const headBlock = await rpc.getBlockNumber();
  const result = await recountPass({
    chainId,
    indexer,
    sources,
    walk,
    headBlock,
    tiles: [...tiles.values()],
    commit: async ({ tile, rows }) => {
      if (sql) await commitRecount(sql, { chainId, via: indexer.via, tile, rows });
      if (tile) tiles.set(tile.tileFrom, tile);
      const first = rows[0];
      const span = first ? `[${first.fromBlock}, ${first.toBlock}] held ${first.heldBlocks} skipped ${first.gapBlocks}` : "no logs";
      console.log(`  ${tile ? "=" : "≠"} ${first?.kind ?? "item"} ${span}: ${rows.length} contract·topic rows`);
      for (const r of rows.filter((x) => !x.match)) console.log(`    ≠ ${r.contract}.${r.event} indexer ${r.indexerCount} · chain ${r.localCount}`);
    },
  });
  mismatches += result.mismatches.length;
  const rate = indexer.pacer?.stats();
  console.log(`pass ${pass} via ${result.via} ≤ ${result.toBlock}: ${result.items.done} items, ${result.items.left} left, ${result.logs} logs, ${result.mismatches.length} mismatches · compared ${result.compared.blocks}/${result.compared.of} blocks · ${result.gaps.length} index gaps (${result.gaps.slice(0, 5).map(formatRange).join(", ")}${result.gaps.length > 5 ? ", …" : ""})${rate ? ` · ${rate.requests} queries, ${rate.limited} × 429, limit ${rate.last?.limit ?? "?"}` : ""}${result.stopped ? ` · stopped by ${result.stopped.by}` : ""}`);
  if (result.stopped?.by === "rate-limit") await new Promise((r) => setTimeout(r, result.stopped && "retryAfterMs" in result.stopped ? result.stopped.retryAfterMs + 1_000 : 60_000));
  else if (!result.items.left) break;
}

await sql?.end();
if (mismatches) process.exitCode = 1;
