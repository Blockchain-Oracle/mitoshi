/**
 * Regenerates `packages/db/src/idx/fixtures/moderato-s7-vault.json`: every EventVault log on Moderato from its deploy
 * block to `TO_BLOCK` (default: head), decoded by `@cwf/markets/ops` `fetchVaultEvents` exactly as the indexer stores
 * them, plus what the chain itself says at that block for every owner (`accountOf`) and grant (`grantOf`) — the
 * projection test asserts the index agrees with the chain. Read-only.
 *
 *   pnpm --filter @cwf/scripts exec tsx fixtures/vault-index.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Address } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { createOpsClient, fetchVaultEvents, vaultVenueOf } from "@cwf/markets/ops";

const client = createOpsClient({ network: "testnet", rpcUrl: process.env.TEMPO_RPC_HTTP_URL });
const venue = vaultVenueOf(client.chainId)!;
const to = process.env.TO_BLOCK ? BigInt(process.env.TO_BLOCK) : await client.public.getBlockNumber();
const events = [];
for (let from = venue.deployBlock; from <= to; from += 100_000n) events.push(...(await fetchVaultEvents(client, venue.vault, from, from + 99_999n < to ? from + 99_999n : to)));
const owners = [...new Set(events.flatMap((e) => (typeof e.data.owner === "string" ? [(e.data.owner as string).toLowerCase()] : [])))] as Address[];
const grants = [...new Set(events.filter((e) => e.name === "GrantCreated").map((e) => String(e.data.grantId)))];
const contract = { address: venue.vault, abi: eventVaultAbi } as const;
const accounts = Object.fromEntries(
  await Promise.all(owners.map(async (o) => {
    const a = (await client.public.readContract({ ...contract, functionName: "accountOf", args: [o], blockNumber: to })) as { available: bigint; privateAvailable: bigint; totalDeposited: bigint; totalWithdrawn: bigint };
    return [o, { available: String(a.available), privateAvailable: String(a.privateAvailable), totalDeposited: String(a.totalDeposited), totalWithdrawn: String(a.totalWithdrawn) }];
  })),
);
const grantState = Object.fromEntries(
  await Promise.all(grants.map(async (id) => {
    const g = (await client.public.readContract({ ...contract, functionName: "grantOf", args: [BigInt(id)], blockNumber: to })) as { revoked: boolean; budget: bigint; owner: Address };
    return [id, { revoked: g.revoked, budget: String(g.budget), owner: g.owner.toLowerCase() }];
  })),
);
const file = join(import.meta.dirname, "..", "..", "packages", "db", "src", "idx", "fixtures", "moderato-s7-vault.json");
writeFileSync(file, `${JSON.stringify({ _doc: `Every EventVault log on Moderato (vault ${venue.vault}, blocks ${venue.deployBlock}–${to}), decoded by @cwf/markets/ops fetchVaultEvents, and the chain's own accountOf/grantOf at block ${to}. Fixture for the vault projection test.`, toBlock: String(to), vault: venue.vault.toLowerCase(), events, chain: { accounts, grants: grantState } }, null, 1)}\n`);
console.log(JSON.stringify({ file, events: events.length, owners: owners.length, grants: grants.length, toBlock: String(to) }));
