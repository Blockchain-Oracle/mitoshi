/**
 * The launchpads' index, proved against the chain (R6 money, S02 + S08; D-230): runs only the indexer's four launch
 * followers (`services/ops/src/actors/indexer/launch.ts`) from the launch area's deploy block to head into
 * DATABASE_URL, then checks each launch's holders against the chain: the indexed balances sum to the supply, and the
 * top holder's matches `balanceOf`. Reads only on chain; writes only the index tables (run `pnpm db:migrate` first).
 *   DATABASE_URL=postgres://… pnpm --filter @cwf/scripts exec tsx drive/r7-launch-index.ts
 */
import { createSql } from "@cwf/db";
import { indexWriter, readLaunchFeed } from "@cwf/db/idx";
import { createOpsClient, launchOpsVenueOf } from "@cwf/markets/ops";
import { erc20Abi, type Address } from "viem";
import { launchCursorKeys, launchFollowers } from "../../services/ops/src/actors/indexer/launch";

const sql = createSql();
const client = createOpsClient({ network: "testnet", tier: 2 });
const writer = indexWriter(sql);
const bus = { publish: () => undefined } as never;
const venue = launchOpsVenueOf(client.chainId);
if (!venue) throw new Error("no launch area on this chain");
const followers = launchFollowers({ bus, sql }, client, writer);
const head = Number(await client.public.getBlockNumber());
for (let pass = 0; pass < 400; pass++) {
  const lines: string[] = [];
  for (const f of followers) lines.push(await f.pass(head));
  console.log(lines.join(" · "));
  if (lines.every((l) => l.includes("caught up"))) break;
}

const keys = launchCursorKeys(venue);
const special = { curve: venue.launchpad, pool: venue.poolManager, locker: venue.locker, cursors: [venue.launchpad, venue.registry, keys.transfers, keys.swaps] };
const tokens = await sql<{ token: Address; total_supply: string | null }[]>`select token, total_supply::text from idx_launches order by created_sec`;
for (const { token, total_supply } of tokens) {
  const feed = await readLaunchFeed(sql, token, special);
  const [sum] = await sql<{ s: string }[]>`select coalesce(sum(balance_raw), 0)::text as s from idx_launch_balances where token = ${token}`;
  const top = feed.holders.top[0];
  const chain = top ? await client.public.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [top.holder as Address] }) : null;
  console.log(JSON.stringify({
    token, name: feed.launch?.name, stage: feed.launch?.stage, trades: feed.trades.length, holders: feed.holders.count,
    supplyIndexed: sum?.s, supply: total_supply, topHolder: top?.holder, topLabel: top?.label, topIndexed: top?.balanceRaw, topChain: chain?.toString(), indexedTo: feed.indexedTo,
  }));
}
await sql.end();
