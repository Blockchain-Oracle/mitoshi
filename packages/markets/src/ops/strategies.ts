/**
 * The indexer's chain side for S9 (plan C.4.1): the StrategyRegistry's logs, and the ERC-8004 ReputationRegistry's
 * feedback, each one `eth_getLogs` per window, decoded into JSON-safe rows like the vault's (`vault.ts`). A `Published`
 * or `Updated` is enriched with the registry's `metadataOf` bytes as UTF-8 when — and only when — their keccak equals
 * the event's `metadataHash`: a later update has replaced them otherwise, and that update's own event carries them.
 */
import { decodeEventLog, getAddress, hexToString, keccak256, type Address, type Hex, type Log } from "viem";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { ERC8004 } from "@cwf/clients";
import { reputationRegistryAbi } from "../agents/erc8004-abi";
import { deploymentsWithHistory } from "../deployments";
import type { OpsClient } from "./client";
import { jsonSafe, type ChainEvent } from "./logs";

export interface StrategyRegistryVenue {
  registry: Address;
  deployBlock: bigint;
}

/** Every StrategyRegistry on the chain, the current first (a retired one's history stays indexed). */
export function strategyRegistriesOf(chainId: number): StrategyRegistryVenue[] {
  return deploymentsWithHistory("strategies", "StrategyRegistry", chainId).map((d) => ({ registry: getAddress(d.address), deployBlock: BigInt(d.deployBlock ?? 0) }));
}

/**
 * Where to read ERC-8004 feedback from: the chain's ReputationRegistry, from the first agent the product can name. On
 * Moderato that is house agent 6 (registered at block 37,372,338, S3.5); elsewhere, the registry's own deploy block —
 * every agent a strategy names is registered at or after publish (D-218.7). Null where neither exists.
 */
const FEEDBACK_FROM_BLOCK: Readonly<Record<number, bigint>> = { 42431: 37_372_338n };
export function feedbackSourceOf(chainId: number): { reputation: Address; fromBlock: bigint } | null {
  const reputation = (ERC8004 as Record<number, { reputation: Address } | undefined>)[chainId]?.reputation;
  const from = FEEDBACK_FROM_BLOCK[chainId] ?? strategyRegistriesOf(chainId).at(-1)?.deployBlock;
  return reputation && from !== undefined ? { reputation: getAddress(reputation), fromBlock: from } : null;
}

function decodeWith(abi: typeof strategyRegistryAbi | typeof reputationRegistryAbi, chainId: number, log: Log, blockTimeSec: number): ChainEvent | null {
  try {
    const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    return {
      chainId, address: log.address, txHash: log.transactionHash!, logIndex: Number(log.logIndex), blockNumber: Number(log.blockNumber), blockTimeSec,
      name: decoded.eventName as string, market: null, seq: null, data: jsonSafe(decoded.args ?? {}) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

async function logsWithTimes(client: OpsClient, address: Address, fromBlock: bigint, toBlock: bigint): Promise<{ logs: Log[]; times: Map<bigint, number> }> {
  const logs = await client.public.getLogs({ address, fromBlock, toBlock });
  const times = new Map<bigint, number>();
  for (const log of logs) {
    const stamped = (log as { blockTimestamp?: bigint | Hex | null }).blockTimestamp;
    if (stamped !== undefined && stamped !== null) times.set(log.blockNumber!, Number(stamped));
  }
  const missing = [...new Set(logs.map((l) => l.blockNumber!).filter((b) => !times.has(b)))];
  for (const b of await Promise.all(missing.map((n) => client.public.getBlock({ blockNumber: n })))) times.set(b.number!, Number(b.timestamp));
  return { logs, times };
}

/** The registry's logs in `[fromBlock, toBlock]`, decoded, block-timed, `Published`/`Updated` carrying matching metadata. */
export async function fetchStrategyEvents(client: OpsClient, registry: Address, fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
  const { logs, times } = await logsWithTimes(client, registry, fromBlock, toBlock);
  const events = logs.flatMap((log) => {
    const e = decodeWith(strategyRegistryAbi, client.chainId, log, times.get(log.blockNumber!) ?? 0);
    return e ? [e] : [];
  });
  for (const e of events) {
    if (e.name !== "Published" && e.name !== "Updated") continue;
    const hash = String(e.data.metadataHash ?? "").toLowerCase();
    if (/^0x0{64}$/.test(hash)) continue;
    const bytes = (await client.public.readContract({ address: registry, abi: strategyRegistryAbi, functionName: "metadataOf", args: [BigInt(String(e.data.strategyId))] })) as Hex;
    if (keccak256(bytes).toLowerCase() === hash) e.data = { ...e.data, metadata: hexToString(bytes) };
  }
  return events;
}

/** The ReputationRegistry's feedback logs in `[fromBlock, toBlock]` (every agent's; the board joins its own). */
export async function fetchFeedbackEvents(client: OpsClient, reputation: Address, fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
  const { logs, times } = await logsWithTimes(client, reputation, fromBlock, toBlock);
  return logs.flatMap((log) => {
    const e = decodeWith(reputationRegistryAbi, client.chainId, log, times.get(log.blockNumber!) ?? 0);
    return e && (e.name === "NewFeedback" || e.name === "FeedbackRevoked") ? [e] : [];
  });
}
