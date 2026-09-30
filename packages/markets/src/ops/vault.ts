/**
 * The ops side of the EventVault (plan C.4.1 sources, C.5.2 settler "`EventVault.crankSettle` worklist"; S7): its logs
 * for the indexer — decoded like the engine's but stored with no `market`/`seq` (a vault event is applied exactly once
 * and never replayed by a Window rebuild; the Window id stays in `data.marketId`) — and the crank plan: which owners of
 * a settled Window still hold vault positions or a grant tag on it, read head-fresh on chain before any send.
 * `crankSettle(owner, m)` credits the owner's Trading Balance; anyone may call it (the settler key pays its fee).
 */
import { decodeEventLog, encodeFunctionData, getAddress, type Address, type Hex, type Log } from "viem";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { deploymentOf } from "../deployments";
import { vaultOutcomeId } from "../vault/read";
import type { Call } from "../tx/batch";
import type { OpsClient } from "./client";
import { jsonSafe, type ChainEvent } from "./logs";

export interface VaultVenue {
  vault: Address;
  deployBlock: bigint;
}

export function vaultVenueOf(chainId: number): VaultVenue | null {
  const v = deploymentOf("vault", chainId)?.EventVault;
  return v ? { vault: getAddress(v.address), deployBlock: BigInt(v.deployBlock ?? 0) } : null;
}

/** One vault log as the index stores it; null for a log that is not a vault event. */
export function decodeVaultLog(chainId: number, log: Log, blockTimeSec: number): ChainEvent | null {
  try {
    const decoded = decodeEventLog({ abi: eventVaultAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    return {
      chainId, address: log.address, txHash: log.transactionHash!, logIndex: Number(log.logIndex), blockNumber: Number(log.blockNumber), blockTimeSec,
      name: decoded.eventName as string, market: null, seq: null, data: jsonSafe(decoded.args ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/** The vault's logs in `[fromBlock, toBlock]`, decoded, with block times (one `eth_getLogs`, as the engine's). */
export async function fetchVaultEvents(client: OpsClient, vault: Address, fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
  const logs = await client.public.getLogs({ address: vault, fromBlock, toBlock });
  const times = new Map<bigint, number>();
  for (const log of logs) {
    const stamped = (log as { blockTimestamp?: bigint | Hex | null }).blockTimestamp;
    if (stamped !== undefined && stamped !== null) times.set(log.blockNumber!, Number(stamped));
  }
  const missing = [...new Set(logs.map((l) => l.blockNumber!).filter((b) => !times.has(b)))];
  for (const b of await Promise.all(missing.map((n) => client.public.getBlock({ blockNumber: n })))) times.set(b.number!, Number(b.timestamp));
  return logs.flatMap((log) => {
    const e = decodeVaultLog(client.chainId, log, times.get(log.blockNumber!) ?? 0);
    return e ? [e] : [];
  });
}

export const vaultCrankSettleCall = (vault: Address, owner: Address, marketId: Hex): Call => ({
  to: vault,
  data: encodeFunctionData({ abi: eventVaultAbi, functionName: "crankSettle", args: [owner, marketId] }),
});

/**
 * Of `owners`, those the vault still holds something for on `marketId`: a position on either side, or a grant tag
 * (`positionGrantOf`) a crank would release (D-062). Head-fresh, one multicall; an owner with neither would revert
 * `NothingToSettle`, so it is never sent.
 */
export async function ownersToCrank(client: OpsClient, venue: VaultVenue, marketId: Hex, owners: readonly Address[]): Promise<Address[]> {
  if (owners.length === 0) return [];
  const yes = vaultOutcomeId(marketId, 0);
  const no = vaultOutcomeId(marketId, 1);
  const contract = { address: venue.vault, abi: eventVaultAbi } as const;
  const reads = owners.flatMap((o) => [
    { ...contract, functionName: "positionOf" as const, args: [o, yes] as const },
    { ...contract, functionName: "positionOf" as const, args: [o, no] as const },
    { ...contract, functionName: "positionGrantOf" as const, args: [o, yes] as const },
    { ...contract, functionName: "positionGrantOf" as const, args: [o, no] as const },
  ]);
  const res = (await client.public.multicall({ contracts: reads, allowFailure: false })) as bigint[];
  return owners.filter((_, i) => res.slice(4 * i, 4 * i + 4).some((v) => v !== 0n));
}
