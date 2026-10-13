/**
 * The indexer's bridge source (R4-12, D-227; index/0007): each TIP20MintBurnAdapter on this chain from its deploy
 * block, and its logs in a window decoded with the generated ABI — only the events that move a mirror (sent out,
 * received, held, claimed, sent back).
 */
import { decodeEventLog, getAddress, type Address, type Hex } from "viem";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import { BRIDGE_TICKERS } from "@cwf/core";
import { deploymentOf } from "../deployments";
import type { OpsClient } from "./client";
import { jsonSafe, type ChainEvent } from "./logs";

const MOVES = new Set(["OFTSent", "OFTReceived", "CreditDeferred", "DeferredClaimed", "DeferredSent"]);

export interface BridgeAdapterSource {
  ticker: string;
  adapter: Address;
  deployBlock: bigint;
}

export function bridgeAdaptersOf(chainId: number): BridgeAdapterSource[] {
  const d = deploymentOf("stocks", chainId);
  return BRIDGE_TICKERS.flatMap((t) => {
    const c = d?.[`Adapter${t}`];
    return c ? [{ ticker: t, adapter: getAddress(c.address), deployBlock: BigInt(c.deployBlock ?? 0) }] : [];
  });
}

export async function fetchAdapterEvents(client: OpsClient, adapter: Address, fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
  const logs = await client.public.getLogs({ address: adapter, fromBlock, toBlock });
  const out: ChainEvent[] = [];
  const times = new Map<bigint, number>();
  for (const log of logs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: tIP20MintBurnAdapterAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
    } catch {
      continue;
    }
    if (!MOVES.has(decoded.eventName)) continue;
    if (!times.has(log.blockNumber!)) times.set(log.blockNumber!, Number((await client.public.getBlock({ blockNumber: log.blockNumber! })).timestamp));
    out.push({
      chainId: client.chainId, address: log.address, txHash: log.transactionHash!, logIndex: Number(log.logIndex), blockNumber: Number(log.blockNumber),
      blockTimeSec: times.get(log.blockNumber!)!, name: decoded.eventName, market: null, seq: null, data: jsonSafe(decoded.args ?? {}) as Record<string, unknown>,
    });
  }
  return out;
}
