/**
 * The launchpads for the indexer (R6 money, S02 + S08; D-230) — chain I/O stays here: the CurveLaunchpad's logs
 * (LaunchCreated, Trade, Completed, and the graduation library's Graduated, which the launchpad emits), the
 * LaunchRegistry's records with each new token's metadata read once (name, symbol, decimals, supply, logo; a memecoin's
 * template and graduation threshold), every launched token's Transfer logs in one `eth_getLogs` over the address list,
 * and the graduated pools' Uniswap v4 `Swap`s filtered by pool id. Each comes back as the index's `ChainEvent`, stored
 * with no `market`, so the projections apply it once. A pool swap is folded to the curve's shape (pathUSD in, coin out,
 * the trader, pathUSD per coin at 1e18) so a graduated coin's trades and price continue its curve's.
 */
import { decodeEventLog, erc20Abi, getAddress, parseAbiItem, type Address, type Hex, type Log } from "viem";
import { Abis } from "viem/tempo";
import { curveGraduationLibAbi } from "@cwf/clients/abis/CurveGraduationLib";
import { curveLaunchpadAbi } from "@cwf/clients/abis/CurveLaunchpad";
import { launchRegistryAbi } from "@cwf/clients/abis/LaunchRegistry";
import { UNISWAP_V4 } from "@cwf/clients";
import { priceE18 } from "@cwf/core";
import { deploymentOf } from "../deployments";
import { memeAddresses, memePoolKey, PATH_USD } from "../launch/meme";
import { poolId } from "../v4/encode";
import type { OpsClient } from "./client";
import { jsonSafe, type ChainEvent } from "./logs";

export interface LaunchOpsVenue {
  launchpad: Address;
  registry: Address;
  locker: Address;
  poolManager: Address;
  launchpadBlock: bigint;
  registryBlock: bigint;
}

/** The launch area on this chain, for the indexer; null where it isn't deployed. */
export function launchOpsVenueOf(chainId: number): LaunchOpsVenue | null {
  const area = deploymentOf("launch", chainId);
  if (!area?.CurveLaunchpad || !area.LaunchRegistry || (chainId !== 42431 && chainId !== 4217)) return null;
  const a = memeAddresses(chainId);
  return { launchpad: a.launchpad, registry: a.registry, locker: a.locker, poolManager: getAddress(UNISWAP_V4.poolManager), launchpadBlock: a.deployBlock, registryBlock: BigInt(area.LaunchRegistry.deployBlock ?? 0) };
}

/** The cursor keys (idx_cursor rows) of the indexer's two set followers — the tokens' transfers and the pools' swaps. */
export const launchCursorKeys = (v: Pick<LaunchOpsVenue, "registry" | "poolManager">) => ({ transfers: `launch-transfers:${v.registry.toLowerCase()}`, swaps: `launch-swaps:${v.poolManager.toLowerCase()}` });

const LAUNCHPAD_LOGS = [...curveLaunchpadAbi, ...curveGraduationLibAbi] as const;
const LAUNCHPAD_EVENTS = new Set(["LaunchCreated", "Trade", "Completed", "Graduated"]);
const REGISTRY_EVENTS = new Set(["MemecoinRecorded", "StablecoinRecorded"]);
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 amount)");
const SWAP = parseAbiItem("event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)");
const E36 = 10n ** 36n;

/** Each log's block time: the log's own `blockTimestamp` where the node sends it, else the block's. */
async function blockTimes(client: OpsClient, logs: readonly Log[]): Promise<Map<bigint, number>> {
  const times = new Map<bigint, number>();
  for (const log of logs) {
    const stamped = (log as { blockTimestamp?: bigint | Hex | null }).blockTimestamp;
    if (stamped !== undefined && stamped !== null) times.set(log.blockNumber!, Number(stamped));
  }
  const missing = [...new Set(logs.map((l) => l.blockNumber!).filter((b) => !times.has(b)))];
  for (const b of await Promise.all(missing.map((n) => client.public.getBlock({ blockNumber: n })))) times.set(b.number!, Number(b.timestamp));
  return times;
}

const event = (client: OpsClient, log: Log, time: number, name: string, data: Record<string, unknown>): ChainEvent => ({
  chainId: client.chainId, address: log.address, txHash: log.transactionHash!, logIndex: Number(log.logIndex), blockNumber: Number(log.blockNumber),
  blockTimeSec: time, name, market: null, seq: null, data: jsonSafe(data) as Record<string, unknown>,
});

/** A graduated coin's v4 pool id, from its template's tier (the pool the graduation seeded). */
async function graduatedPoolId(client: OpsClient, launchpad: Address, token: Address, tier: number): Promise<Hex> {
  const l = await client.public.readContract({ address: launchpad, abi: curveLaunchpadAbi, functionName: "getLaunch", args: [token] });
  const c = await client.public.readContract({ address: launchpad, abi: curveLaunchpadAbi, functionName: "getConfig", args: [l.configId] });
  return poolId(memePoolKey(token, c.poolFees[tier]!, c.tickSpacings[tier]!));
}

/** The launchpad's logs in `[fromBlock, toBlock]`: launches, curve trades (with their price), completion, graduation (with its pool). */
export async function fetchLaunchpadEvents(client: OpsClient, launchpad: Address, fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
  const logs = await client.public.getLogs({ address: launchpad, fromBlock, toBlock });
  const times = await blockTimes(client, logs);
  const out: ChainEvent[] = [];
  for (const log of logs) {
    let d: { eventName: string; args: Record<string, unknown> };
    try {
      d = decodeEventLog({ abi: LAUNCHPAD_LOGS, data: log.data, topics: log.topics as [Hex, ...Hex[]] }) as unknown as typeof d;
    } catch {
      continue;
    }
    if (!LAUNCHPAD_EVENTS.has(d.eventName)) continue;
    const args: Record<string, unknown> = { ...d.args };
    if (d.eventName === "Trade") args.priceE18 = priceE18(args.sqrtPriceX96 as bigint);
    if (d.eventName === "Graduated") args.poolId = await graduatedPoolId(client, launchpad, args.token as Address, Number(args.tier));
    out.push(event(client, log, times.get(log.blockNumber!) ?? 0, d.eventName, args));
  }
  return out;
}

/**
 * What the registry records about a new token, read once: its TIP-20 facts and, for a memecoin, its template's threshold
 * and full supply — the curve mints as it sells, so the TIP-20 `totalSupply` is only what is out at the read, and a
 * market cap on it would disagree with the token page's (price × the template's supply, as pump.fun counts it).
 */
async function tokenMeta(client: OpsClient, launchpad: Address, token: Address, memecoin: boolean) {
  const read = <T>(p: Promise<T>) => p.catch(() => null);
  const [name, symbol, decimals, totalSupply, logoURI] = await Promise.all([
    read(client.public.readContract({ address: token, abi: erc20Abi, functionName: "name" })),
    read(client.public.readContract({ address: token, abi: erc20Abi, functionName: "symbol" })),
    read(client.public.readContract({ address: token, abi: erc20Abi, functionName: "decimals" })),
    read(client.public.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" })),
    read(client.public.readContract({ address: token, abi: Abis.tip20, functionName: "logoURI" }) as Promise<string>),
  ]);
  let configId: number | null = null;
  let thresholdQuote: bigint | null = null;
  let supply = memecoin ? null : totalSupply;
  if (memecoin) {
    const l = await read(client.public.readContract({ address: launchpad, abi: curveLaunchpadAbi, functionName: "getLaunch", args: [token] }));
    if (l && l.state !== 0) {
      configId = l.configId;
      const c = await read(client.public.readContract({ address: launchpad, abi: curveLaunchpadAbi, functionName: "getConfig", args: [l.configId] }));
      thresholdQuote = c?.migrationQuoteThreshold ?? null;
      supply = c?.totalSupply ?? null;
    }
  }
  return { name, symbol, decimals, totalSupply: supply, logoURI, configId, thresholdQuote };
}

/** The registry's records in a window, each with its token's metadata (`launchpad` reads a memecoin's template). */
export function registryFetcher(launchpad: Address) {
  return async function fetchRegistryEvents(client: OpsClient, registry: Address, fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
    const logs = await client.public.getLogs({ address: registry, fromBlock, toBlock });
    const times = await blockTimes(client, logs);
    const out: ChainEvent[] = [];
    for (const log of logs) {
      let d: { eventName: string; args: Record<string, unknown> };
      try {
        d = decodeEventLog({ abi: launchRegistryAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] }) as unknown as typeof d;
      } catch {
        continue;
      }
      if (!REGISTRY_EVENTS.has(d.eventName)) continue;
      const meta = await tokenMeta(client, launchpad, d.args.token as Address, d.eventName === "MemecoinRecorded");
      out.push(event(client, log, times.get(log.blockNumber!) ?? 0, d.eventName, { ...d.args, meta }));
    }
    return out;
  };
}

/** Every Transfer of the launched tokens in a window, as one `eth_getLogs` over their addresses; `token` is the log's. */
export async function fetchLaunchTransfers(client: OpsClient, tokens: readonly Address[], fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
  if (tokens.length === 0) return [];
  const logs = await client.public.getLogs({ address: [...tokens], event: TRANSFER, fromBlock, toBlock });
  const times = await blockTimes(client, logs);
  return logs.map((log) => event(client, log, times.get(log.blockNumber!) ?? 0, "Transfer", { from: log.args.from, to: log.args.to, amount: log.args.amount, token: log.address }));
}

/**
 * The graduated pools' swaps in a window, folded to the curve's trade: pathUSD in or out, the coin the other way, the
 * buyer or seller (the transaction's sender — the pool's `sender` is the router), pathUSD per coin at 1e18.
 */
export async function fetchPoolSwaps(client: OpsClient, poolManager: Address, pools: readonly { id: Hex; token: Address }[], fromBlock: bigint, toBlock: bigint): Promise<ChainEvent[]> {
  if (pools.length === 0) return [];
  const tokenOf = new Map(pools.map((p) => [p.id.toLowerCase(), p.token]));
  const logs = await client.public.getLogs({ address: poolManager, event: SWAP, args: { id: pools.map((p) => p.id) }, fromBlock, toBlock });
  const times = await blockTimes(client, logs);
  const senders = new Map<Hex, Address>();
  for (const hash of [...new Set(logs.map((l) => l.transactionHash!))]) senders.set(hash, (await client.public.getTransaction({ hash })).from);
  const out: ChainEvent[] = [];
  for (const log of logs) {
    const token = tokenOf.get(log.args.id!.toLowerCase());
    if (!token) continue;
    // pathUSD is the pool's currency0 when its address sorts first (it does for every 0x20C0… coin); the swap's deltas are the swapper's.
    const quoteIs0 = PATH_USD.toLowerCase() < token.toLowerCase();
    const quoteDelta = quoteIs0 ? log.args.amount0! : log.args.amount1!;
    const coinDelta = quoteIs0 ? log.args.amount1! : log.args.amount0!;
    const sqrt = log.args.sqrtPriceX96!;
    const raw = priceE18(sqrt);
    const price = quoteIs0 ? (raw > 0n ? E36 / raw : 0n) : raw;
    out.push(event(client, log, times.get(log.blockNumber!) ?? 0, "Swap", {
      id: log.args.id, token, trader: senders.get(log.transactionHash!) ?? log.args.sender, isBuy: quoteDelta < 0n,
      quote: quoteDelta < 0n ? -quoteDelta : quoteDelta, coin: coinDelta < 0n ? -coinDelta : coinDelta, fee: 0n, priceE18: price,
    }));
  }
  return out;
}

