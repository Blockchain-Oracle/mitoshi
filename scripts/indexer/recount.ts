/**
 * One recount pass by hand (plan C.4.3; the ops actor `indexer-recount` runs it hourly): the configured indexer
 * (TIDX_URL / TEMPO_INDEXER_API_KEY / INDEXER_VIA_MPP) against the chain's `eth_getLogs`, per event of every deployed
 * contract on NETWORK, stored in `indexer_recounts` when DATABASE_URL is set. Also runs one decoded query through
 * `signature=` to show the event columns.
 *
 *   NETWORK=testnet TIDX_URL=http://localhost:58080 DATABASE_URL=… tsx scripts/indexer/recount.ts [--from-block N]
 */
import { NETWORKS, networkFrom } from "@cwf/core";
import { indexerSources } from "@cwf/clients";
import { createSql, insertRecounts, runMigrations } from "@cwf/db";
import { tempoReadClient } from "@cwf/markets";
import { indexerClientFromEnv, indexerHead, recount, rpcLogCounter, type RecountSource } from "@cwf/markets/server";

const network = networkFrom(process.env.NETWORK);
const chainId = NETWORKS[network];
const configured = indexerClientFromEnv();
if (!configured.client) throw new Error(configured.reason);
const indexer = configured.client;
const rpc = tempoReadClient(network, process.env.TEMPO_RPC_HTTP_URL);
const floorArg = process.argv.includes("--from-block") ? BigInt(process.argv[process.argv.indexOf("--from-block") + 1]!) : undefined;
const sources = (indexerSources as Record<string, readonly RecountSource[]>)[String(chainId)] ?? [];

const head = await rpc.getBlockNumber();
console.log(`indexer ${indexer.via} ${indexer.baseUrl} · chain ${chainId} · rpc head ${head} · indexer head ${await indexerHead(indexer)}`);

const launch = sources.find((s) => s.contract === "LaunchRegistry");
if (launch) {
  const ev = launch.events.find((e) => e.name === "StablecoinRecorded")!;
  const { rows } = await indexer.query({ sql: `SELECT block_num, tx_hash, token, creator, "index", "metadataURI" FROM StablecoinRecorded WHERE address = '${launch.address.toLowerCase()}' ORDER BY block_num`, signatures: [ev.signature] });
  console.log(`decoded StablecoinRecorded via signature= (${rows.length}):`);
  for (const r of rows) console.log(`  block ${r.block_num} tx ${r.tx_hash} token ${r.token} creator ${r.creator} index ${r.index} ${r.metadataURI}`);
}

const result = await recount({ chainId, indexer, sources, local: rpcLogCounter(rpc), headBlock: head, ...(floorArg !== undefined ? { fromBlockFloor: floorArg } : {}) });
console.log(`recount ≤ ${result.toBlock}: ${result.rows.length} events, ${result.mismatches.length} mismatches, ${result.uncovered.length} uncovered`);
for (const r of result.rows) console.log(`  ${r.match ? "=" : "≠"} ${r.contract}.${r.event} [${r.fromBlock}, ${r.toBlock}] indexer ${r.indexerCount} · chain ${r.localCount}`);
for (const u of result.uncovered) console.log(`  … ${u.contract} [${u.fromBlock}, ${u.toBlock}] not yet covered by the indexer`);

if (process.env.DATABASE_URL) {
  const sql = createSql();
  await runMigrations(sql);
  console.log(`stored ${await insertRecounts(sql, result.rows.map((r) => ({ ...r, via: result.via })))} indexer_recounts rows`);
  await sql.end();
}
if (result.mismatches.length) process.exitCode = 1;
