/**
 * `/launch*`'s reads on the Tempo read runtime (S17): every launch the registry records (stablecoins and memecoins,
 * newest first) with the facts each list row shows, one memecoin fully resolved, its curve trades, a holder's position
 * and claims, the published templates, and a stablecoin's DEX orders and fee pool. Each returns a `Reading`; a network
 * without the launchpads answers `null` inside it. Log reads (trades, a stablecoin's orders) walk from the area's deploy
 * block in RPC-sized windows and are cached by the page for minutes.
 */
import { erc20Abi, getAddress, parseAbi, type Address, type Hex } from "viem";
import { Abis, Addresses } from "viem/tempo";
import { curveLaunchpadAbi } from "@cwf/clients/abis/CurveLaunchpad";
import { launchRegistryAbi } from "@cwf/clients/abis/LaunchRegistry";
import { priceE18, type FeeSchedule, type Reading, type Segment } from "@cwf/core";
import { deploymentOf } from "../deployments";
import { nowMs } from "../runtime/clock";
import { getLogClient, getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { UNISWAP_V4 } from "@cwf/clients";
import { memeAddresses, memePoolKey, PATH_USD, type MemeAddresses } from "./meme";
import { listMemecoins, readMemeClaims, readMemeLaunch, readMemePosition, readMemeTrades, type MemeLaunch, type MemeTrade } from "./memeRead";
import { readStablecoinLaunch, type StablecoinLaunchState } from "./stablecoin";

/** `LaunchRegistry.Kind`: 1 stablecoin, 2 memecoin. */
export const LaunchKind = { None: 0, Stablecoin: 1, Memecoin: 2 } as const;
const LOG_WINDOW = 90_000n;

/** The launch area on this chain, or null where it isn't deployed. */
export function launchVenueOf(chainId: number): MemeAddresses | null {
  if (!deploymentOf("launch", chainId) || (chainId !== 42431 && chainId !== 4217)) return null;
  return memeAddresses(chainId);
}

async function venue() {
  const client = await getPublicClient();
  return { client, a: launchVenueOf(client.chain.id) };
}

/** One row of `/launch`: what the registry and the token itself say, plus the curve's state for a memecoin. */
export interface LaunchRow {
  token: Address;
  kind: "stablecoin" | "memecoin";
  index: number;
  creator: Address;
  name: string;
  symbol: string;
  logoURI: string;
  metadataURI: string;
  totalSupply: bigint;
  decimals: number;
  meme: Pick<MemeLaunch, "stage" | "progressBps" | "priceE18" | "quoteReserve" | "coinSold" | "createdAtSec" | "feeBpsNow"> | null;
}

/** Every launch the registry records, newest first; empty without the launchpads. */
export async function listLaunches(limit = 50): Promise<Reading<LaunchRow[]>> {
  return withReading(`launches:${limit}`, async () => {
    const { client, a } = await venue();
    if (!a) return [];
    const registry = { address: a.registry, abi: launchRegistryAbi } as const;
    const n = await client.readContract({ ...registry, functionName: "tokensLength" });
    const offset = n > BigInt(limit) ? n - BigInt(limit) : 0n;
    const page = n === 0n ? [] : [...(await client.readContract({ ...registry, functionName: "tokensSlice", args: [offset, BigInt(limit)] }))].reverse();
    const nowSec = BigInt(Math.floor(nowMs() / 1000));
    const rows = await Promise.all(
      page.map(async (token): Promise<LaunchRow | null> => {
        const rec = await client.readContract({ ...registry, functionName: "launchOf", args: [token] });
        if (rec.kind !== LaunchKind.Stablecoin && rec.kind !== LaunchKind.Memecoin) return null;
        const [name, symbol, decimals, totalSupply, logoURI] = await Promise.all([
          client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
          client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
          client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
          client.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" }),
          client.readContract({ address: token, abi: Abis.tip20, functionName: "logoURI" }).catch(() => ""),
        ]);
        const meme = rec.kind === LaunchKind.Memecoin ? await readMemeLaunch(client, a, token, nowSec).catch(() => null) : null;
        return {
          token: getAddress(token),
          kind: rec.kind === LaunchKind.Memecoin ? "memecoin" : "stablecoin",
          index: Number(rec.index),
          creator: rec.creator,
          name,
          symbol,
          logoURI,
          metadataURI: rec.metadataURI,
          totalSupply,
          decimals: Number(decimals),
          meme: meme ? { stage: meme.stage, progressBps: meme.progressBps, priceE18: meme.priceE18, quoteReserve: meme.quoteReserve, coinSold: meme.coinSold, createdAtSec: meme.createdAtSec, feeBpsNow: meme.feeBpsNow } : null,
        };
      }),
    );
    return rows.filter((r): r is LaunchRow => r !== null);
  });
}

/** One memecoin, fully resolved on the chain clock; `null` when the token is not a memecoin launch here. */
export async function getMemeLaunch(token: Address): Promise<Reading<MemeLaunch | null>> {
  return withReading(`meme:${token.toLowerCase()}`, async () => {
    const { client, a } = await venue();
    if (!a) return null;
    const state = await client.readContract({ address: a.launchpad, abi: curveLaunchpadAbi, functionName: "getLaunch", args: [token] });
    if (state.state === 0) return null;
    return readMemeLaunch(client, a, token, BigInt(Math.floor(nowMs() / 1000)));
  });
}

/** A trade with its block's time (the last `TIMED_TRADES` trades; older ones carry null). */
export type TimedMemeTrade = MemeTrade & { atSec: number | null };
const TIMED_TRADES = 200;

/** The curve's trades on one memecoin, oldest first (the chart, the tape, the 24 h move); empty without the launchpads. */
export async function getMemeTrades(token: Address): Promise<Reading<TimedMemeTrade[]>> {
  return withReading(`memeTrades:${token.toLowerCase()}`, async () => {
    const a = launchVenueOf((await getPublicClient()).chain.id);
    if (!a) return [];
    const client = await getLogClient();
    const trades = await readMemeTrades(client, a, token, a.deployBlock, LOG_WINDOW);
    const recent = new Set(trades.slice(-TIMED_TRADES).map((t) => t.blockNumber));
    const times = new Map(await Promise.all([...recent].map(async (n) => [n, Number((await client.getBlock({ blockNumber: n })).timestamp)] as const)));
    return trades.map((t) => ({ ...t, atSec: times.get(t.blockNumber) ?? null }));
  });
}

export async function getMemePosition(token: Address, holder: Address): Promise<Reading<Awaited<ReturnType<typeof readMemePosition>> | null>> {
  return withReading(`memePosition:${token.toLowerCase()}:${holder.toLowerCase()}`, async () => {
    const { client, a } = await venue();
    if (!a) return null;
    const m = await readMemeLaunch(client, a, token, BigInt(Math.floor(nowMs() / 1000)));
    return readMemePosition(client, m, holder);
  });
}

export async function getMemeClaims(holder: Address, coin?: Address): Promise<Reading<Awaited<ReturnType<typeof readMemeClaims>> | null>> {
  return withReading(`memeClaims:${holder.toLowerCase()}:${coin?.toLowerCase() ?? "-"}`, async () => {
    const { client, a } = await venue();
    if (!a) return null;
    return readMemeClaims(client, a, holder, coin);
  });
}

/** A published curve template, as the create wizard shows it. */
export interface MemeTemplate {
  configId: number;
  partner: Address;
  shares: { protocol: number; partner: number; creator: number };
  fees: FeeSchedule;
  sqrtStartX96: bigint;
  sqrtEndX96: bigint;
  startPriceE18: bigint;
  endPriceE18: bigint;
  migrationQuoteThreshold: bigint;
  curveSupply: bigint;
  totalSupply: bigint;
  migrationFeeBps: number;
  vestingCliff: number;
  vestingDuration: number;
  maxCreatorBuyBps: number;
  split: Record<string, number>;
  poolFees: readonly number[];
  tickSpacings: readonly number[];
  segments: Segment[];
}

/** Every template on the launchpad (`configCount` of them, ids from 1); empty without the launchpads. */
export async function listMemeTemplates(): Promise<Reading<MemeTemplate[]>> {
  return withReading("memeTemplates", async () => {
    const { client, a } = await venue();
    if (!a) return [];
    const pad = { address: a.launchpad, abi: curveLaunchpadAbi } as const;
    const count = Number(await client.readContract({ ...pad, functionName: "configCount" }));
    const ids = Array.from({ length: count }, (_, i) => i + 1);
    return Promise.all(
      ids.map(async (configId) => {
        const [c, segs] = await Promise.all([client.readContract({ ...pad, functionName: "getConfig", args: [configId] }), client.readContract({ ...pad, functionName: "getSegments", args: [configId] })]);
        return {
          configId,
          partner: c.partner,
          shares: { protocol: c.protocolShareBps, partner: c.partnerShareBps, creator: c.creatorShareBps },
          fees: { base: c.fees.base, start: c.fees.start, period: c.fees.period, reduction: c.fees.reduction, mode: c.fees.mode as 0 | 1 },
          sqrtStartX96: c.sqrtStartX96,
          sqrtEndX96: c.sqrtEndX96,
          startPriceE18: priceE18(c.sqrtStartX96),
          endPriceE18: priceE18(c.sqrtEndX96),
          migrationQuoteThreshold: c.migrationQuoteThreshold,
          curveSupply: c.curveSupply,
          totalSupply: c.totalSupply,
          migrationFeeBps: c.migrationFeeBps,
          vestingCliff: c.vestingCliff,
          vestingDuration: c.vestingDuration,
          maxCreatorBuyBps: c.maxCreatorBuyBps,
          split: { ...c.split },
          poolFees: c.poolFees,
          tickSpacings: c.tickSpacings,
          segments: segs.map((s) => ({ sqrtPriceUpperX96: s.sqrtPriceUpperX96, liquidity: s.liquidity })),
        };
      }),
    );
  });
}

/** The DEX's `OrderPlaced` for one token, from the registry's deploy block: the ids `readStablecoinLaunch` needs. */
async function dexOrderIds(token: Address, fromBlock: bigint): Promise<bigint[]> {
  const client = await getLogClient();
  const head = await client.getBlockNumber();
  const ids: bigint[] = [];
  for (let from = fromBlock; from <= head; from += LOG_WINDOW) {
    const to = from + LOG_WINDOW - 1n > head ? head : from + LOG_WINDOW - 1n;
    const logs = await client.getContractEvents({ address: Addresses.stablecoinDex, abi: Abis.stablecoinDex, eventName: "OrderPlaced", args: { token }, fromBlock: from, toBlock: to });
    for (const log of logs) ids.push((log.args as { orderId: bigint }).orderId);
  }
  return ids;
}

export interface StablecoinView extends StablecoinLaunchState {
  token: Address;
  name: string;
  symbol: string;
  decimals: number;
  logoURI: string;
  /** The token's supply cap, when one was set (the TIP-20's `supplyCap`); null at the default. */
  supplyCap: bigint | null;
}

/** A launched stablecoin: the token, its DEX orders (from the DEX's own events), its fee pool and the registry entry. */
export async function getStablecoinLaunch(token: Address): Promise<Reading<StablecoinView | null>> {
  return withReading(`stablecoin:${token.toLowerCase()}`, async () => {
    const { client, a } = await venue();
    if (!a) return null;
    const rec = await client.readContract({ address: a.registry, abi: launchRegistryAbi, functionName: "launchOf", args: [token] });
    if (rec.kind !== LaunchKind.Stablecoin) return null;
    const registryBlock = BigInt(deploymentOf("launch", client.chain.id)?.LaunchRegistry?.deployBlock ?? 0);
    const [orderIds, name, symbol, decimals, logoURI, supplyCap] = await Promise.all([
      dexOrderIds(token, registryBlock),
      client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
      client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }),
      client.readContract({ address: token, abi: Abis.tip20, functionName: "logoURI" }).catch(() => ""),
      client.readContract({ address: token, abi: Abis.tip20, functionName: "supplyCap" }).then((v) => BigInt(v as bigint)).catch(() => null),
    ]);
    const state = await readStablecoinLaunch(client as never, { token, registry: a.registry, orderIds });
    return { ...state, token: getAddress(token), name, symbol, decimals: Number(decimals), logoURI, supplyCap };
  });
}

const V4_QUOTER_ABI = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

/**
 * A swap in a graduated memecoin's pool, quoted by Uniswap's V4Quoter (an `eth_call`; the quoter reverts internally and
 * answers the amount): what `amountIn` of pathUSD buys (`buyCoin`) or of the coin sells for. Null without the pool.
 */
export async function quotePoolSwap(p: { token: Address; fee: number; tickSpacing: number; buyCoin: boolean; amountIn: bigint }): Promise<Reading<bigint | null>> {
  return withReading(`poolQuote:${p.token.toLowerCase()}:${p.buyCoin}:${p.amountIn}`, async () => {
    const { client, a } = await venue();
    if (!a || p.amountIn <= 0n) return null;
    const key = memePoolKey(p.token, p.fee, p.tickSpacing);
    const zeroForOne = p.buyCoin ? key.currency0.toLowerCase() === PATH_USD.toLowerCase() : key.currency0.toLowerCase() === p.token.toLowerCase();
    const { result } = await client.simulateContract({ address: UNISWAP_V4.v4Quoter as Address, abi: V4_QUOTER_ABI, functionName: "quoteExactInputSingle", args: [{ poolKey: key, zeroForOne, exactAmount: p.amountIn, hookData: "0x" }] });
    return result[0];
  });
}

/** Memecoins only, newest first (the keeper's and the list's helper), as addresses. */
export async function listMemecoinAddresses(limit = 50): Promise<Reading<Address[]>> {
  return withReading(`memecoins:${limit}`, async () => {
    const { client, a } = await venue();
    return a ? listMemecoins(client, a, limit) : [];
  });
}

export type { Hex };
