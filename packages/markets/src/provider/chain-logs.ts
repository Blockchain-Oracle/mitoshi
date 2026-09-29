/**
 * The chain-side fallback for wallet discovery (D-049: "chain WebSocket logs for the user's own events"): the engine's
 * `Fill` logs where the wallet is maker or taker (both indexed), read in ≤ 100k-block windows (D-030). Used when our
 * index can't answer, so a portfolio is never shown empty for want of an indexer. Bounded to `lookbackBlocks`; the
 * reading says `complete: false` when the engine is older than the lookback.
 */
import { getAbiItem, type Address } from "viem";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { toMarketId } from "@cwf/core";
import { getLogClient, getPublicClient } from "../runtime/read-runtime";
import { engineVenue } from "../engine/lens";
import type { IndexedFill } from "./index-api";

export const LOG_WINDOW = 100_000n;
/** About two days of Moderato blocks (≈ 0.5 s each). */
export const DEFAULT_LOOKBACK_BLOCKS = 350_000n;

const FILL = getAbiItem({ abi: eventsEngineAbi, name: "Fill" });

export async function chainWalletFills(wallet: Address, lookbackBlocks = DEFAULT_LOOKBACK_BLOCKS): Promise<{ fills: IndexedFill[]; complete: boolean }> {
  const [client, venue] = await Promise.all([getLogClient(), engineVenue()]);
  const head = await client.getBlockNumber();
  const floor = head > lookbackBlocks ? head - lookbackBlocks : 0n;
  const from = floor > venue.deployBlock ? floor : venue.deployBlock;
  const fills: IndexedFill[] = [];
  const seen = new Set<string>();
  const times = new Map<bigint, number>();
  const timeOf = async (n: bigint) => times.get(n) ?? times.set(n, Number((await client.getBlock({ blockNumber: n })).timestamp)).get(n)!;
  for (let start = from; start <= head; start += LOG_WINDOW) {
    const end = start + LOG_WINDOW - 1n < head ? start + LOG_WINDOW - 1n : head;
    const [asMaker, asTaker] = await Promise.all(
      (["maker", "taker"] as const).map((role) => client.getLogs({ address: venue.engine, event: FILL, args: { [role]: wallet }, fromBlock: start, toBlock: end })),
    );
    for (const log of [...asMaker!, ...asTaker!]) {
      const key = `${log.transactionHash}:${log.logIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = log.args as { marketId: `0x${string}`; maker: Address; taker: Address; makerKind: number; takerKind: number; priceTicks: number; lots: bigint };
      fills.push({
        marketId: toMarketId(a.marketId), txHash: log.transactionHash!, logIndex: log.logIndex!, tsSec: await timeOf(log.blockNumber!), taker: a.taker, takerKind: a.takerKind,
        maker: a.maker, makerKind: a.makerKind, priceTicks: a.priceTicks, lots: a.lots,
      });
    }
  }
  fills.sort((x, y) => y.tsSec - x.tsSec);
  return { fills, complete: from === venue.deployBlock };
}
