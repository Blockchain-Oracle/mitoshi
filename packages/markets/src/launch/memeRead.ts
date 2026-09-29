/**
 * Reads for the memecoin pages (`/launch`, `/launch/[token]`) and the launch keeper: a launch with its template and
 * curve, the list of memecoins, trades for the live curve chart, the graduation stage, a holder's position, and receipt
 * decoding. The curve maths itself is `@cwf/core` (`curve.ts`, bit-for-bit with the contract).
 */
import { type Address, type Hex, type PublicClient, decodeEventLog, erc20Abi, getAddress } from "viem";
import { Abis } from "viem/tempo";
import { curveLaunchpadAbi } from "@cwf/clients/abis/CurveLaunchpad";
import { curveGraduationLibAbi } from "@cwf/clients/abis/CurveGraduationLib";
import { launchRegistryAbi } from "@cwf/clients/abis/LaunchRegistry";
import { liquidityLockerAbi } from "@cwf/clients/abis/LiquidityLocker";
import { type CurveShape, type FeeSchedule, type Segment, feeBps, priceE18, progressBps, quoteBuy, quoteSell } from "@cwf/core";
import { poolId } from "../v4/encode";
import { type MemeAddresses, memePoolKey } from "./meme";

export const LaunchState = { None: 0, Trading: 1, Complete: 2, Graduated: 3 } as const;
/** What the token page shows: trading on the curve → complete (waiting for the keeper) → trading on Uniswap. */
export type MemeStage = "trading" | "complete" | "graduated";

export interface MemeLaunch {
  token: Address;
  configId: number;
  state: number;
  stage: MemeStage;
  createdAtSec: bigint;
  segment: number;
  sqrtPriceX96: bigint;
  quoteReserve: bigint;
  coinSold: bigint;
  creator: Address;
  config: {
    partner: Address;
    shares: { protocol: number; partner: number; creator: number };
    fees: FeeSchedule;
    sqrtStartX96: bigint;
    sqrtEndX96: bigint;
    migrationQuoteThreshold: bigint;
    curveSupply: bigint;
    migrationCoinAmount: bigint;
    totalSupply: bigint;
    migrationFeeBps: number;
    vestingCliff: number;
    vestingDuration: number;
    leftoverReceiver: Address;
    poolFees: readonly number[];
    tickSpacings: readonly number[];
    maxCreatorBuyBps: number;
    split: Record<string, number>;
  };
  segments: Segment[];
  graduation: { tier: number; graduatedAtSec: bigint; positionId: bigint; liquidity: bigint; leftover: bigint } | null;
  /** Anti-snipe fee now, from the chain's clock. */
  feeBpsNow: bigint;
  progressBps: number;
  priceE18: bigint;
  /** The v4 pool once graduated. */
  pool: { key: ReturnType<typeof memePoolKey>; id: Hex } | null;
  meta: { name: string; symbol: string; currency: string; logoURI: string; metadataURI: string };
}

const stageOf = (state: number): MemeStage => (state === LaunchState.Graduated ? "graduated" : state === LaunchState.Complete ? "complete" : "trading");

/** One launch, fully resolved (5 reads + token metadata). `nowSec` is the chain clock (for the fee schedule). */
export async function readMemeLaunch(client: PublicClient, a: MemeAddresses, token: Address, nowSec: bigint): Promise<MemeLaunch> {
  const l = await client.readContract({ address: a.launchpad, abi: curveLaunchpadAbi, functionName: "getLaunch", args: [token] });
  if (l.state === LaunchState.None) throw new Error(`${token} is not a memecoin launch`);
  const [c, segs, g, name, symbol, logoURI, reg] = await Promise.all([
    client.readContract({ address: a.launchpad, abi: curveLaunchpadAbi, functionName: "getConfig", args: [l.configId] }),
    client.readContract({ address: a.launchpad, abi: curveLaunchpadAbi, functionName: "getSegments", args: [l.configId] }),
    client.readContract({ address: a.launchpad, abi: curveLaunchpadAbi, functionName: "getGraduation", args: [token] }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }),
    client.readContract({ address: token, abi: Abis.tip20, functionName: "logoURI" }),
    client.readContract({ address: a.registry, abi: launchRegistryAbi, functionName: "launchOf", args: [token] }),
  ]);
  const fees: FeeSchedule = { base: c.fees.base, start: c.fees.start, period: c.fees.period, reduction: c.fees.reduction, mode: c.fees.mode as 0 | 1 };
  const graduated = l.state === LaunchState.Graduated;
  const key = graduated ? memePoolKey(token, c.poolFees[g.tier]!, c.tickSpacings[g.tier]!) : null;
  return {
    token: getAddress(token),
    configId: l.configId,
    state: l.state,
    stage: stageOf(l.state),
    createdAtSec: BigInt(l.createdAt),
    segment: l.segment,
    sqrtPriceX96: l.sqrtPriceX96,
    quoteReserve: l.quoteReserve,
    coinSold: l.coinSold,
    creator: l.creator,
    config: {
      partner: c.partner,
      shares: { protocol: c.protocolShareBps, partner: c.partnerShareBps, creator: c.creatorShareBps },
      fees,
      sqrtStartX96: c.sqrtStartX96,
      sqrtEndX96: c.sqrtEndX96,
      migrationQuoteThreshold: c.migrationQuoteThreshold,
      curveSupply: c.curveSupply,
      migrationCoinAmount: c.migrationCoinAmount,
      totalSupply: c.totalSupply,
      migrationFeeBps: c.migrationFeeBps,
      vestingCliff: c.vestingCliff,
      vestingDuration: c.vestingDuration,
      leftoverReceiver: c.leftoverReceiver,
      poolFees: c.poolFees,
      tickSpacings: c.tickSpacings,
      maxCreatorBuyBps: c.maxCreatorBuyBps,
      split: { ...c.split },
    },
    segments: segs.map((s) => ({ sqrtPriceUpperX96: s.sqrtPriceUpperX96, liquidity: s.liquidity })),
    graduation: graduated ? { tier: g.tier, graduatedAtSec: BigInt(g.graduatedAt), positionId: g.positionId, liquidity: g.liquidity, leftover: g.leftover } : null,
    feeBpsNow: feeBps(fees, nowSec > BigInt(l.createdAt) ? nowSec - BigInt(l.createdAt) : 0n),
    progressBps: graduated ? 10_000 : progressBps(l.quoteReserve, c.migrationQuoteThreshold),
    priceE18: priceE18(l.sqrtPriceX96),
    pool: key ? { key, id: poolId(key) } : null,
    meta: { name, symbol, currency: symbol, logoURI, metadataURI: reg.metadataURI },
  };
}

export const curveShape = (m: MemeLaunch): CurveShape => ({ segments: m.segments, sqrtStartX96: m.config.sqrtStartX96, sqrtEndX96: m.config.sqrtEndX96 });

/** Local quotes (no RPC) — identical to the contract's `quoteBuy`/`quoteSell` views. */
export const quoteMemeBuy = (m: MemeLaunch, quoteIn: bigint) => quoteBuy(curveShape(m), { sqrtPriceX96: m.sqrtPriceX96, segment: m.segment }, m.feeBpsNow, quoteIn);
export const quoteMemeSell = (m: MemeLaunch, coinIn: bigint) => quoteSell(curveShape(m), { sqrtPriceX96: m.sqrtPriceX96, segment: m.segment }, m.feeBpsNow, coinIn);

/** The anti-snipe schedule as points `[secondsAfterLaunch, bps]` until it rests at its base (shown before buying). */
export function feeTimeline(f: FeeSchedule, maxPoints = 64): [number, number][] {
  const out: [number, number][] = [];
  if (f.start === f.base || f.period === 0) return [[0, f.base]];
  for (let i = 0; i < maxPoints; i++) {
    const t = i * f.period;
    const bps = Number(feeBps(f, BigInt(t)));
    out.push([t, bps]);
    if (bps === f.base) break;
  }
  return out;
}

/** Memecoins in the registry, newest first (a page of `limit` from the end). */
export async function listMemecoins(client: PublicClient, a: MemeAddresses, limit = 50): Promise<Address[]> {
  const n = await client.readContract({ address: a.registry, abi: launchRegistryAbi, functionName: "tokensLength" });
  const offset = n > BigInt(limit) ? n - BigInt(limit) : 0n;
  const page = await client.readContract({ address: a.registry, abi: launchRegistryAbi, functionName: "tokensSlice", args: [offset, BigInt(limit)] });
  const kinds = await Promise.all(page.map((t) => client.readContract({ address: a.registry, abi: launchRegistryAbi, functionName: "launchOf", args: [t] })));
  return page.filter((_, i) => kinds[i]!.kind === 2).reverse();
}

export interface MemeTrade { trader: Address; isBuy: boolean; quote: bigint; coin: bigint; fee: bigint; sqrtPriceX96: bigint; priceE18: bigint; quoteReserve: bigint; blockNumber: bigint; txHash: Hex }

/** Curve trades of `token` (the live chart and the trades list). Reads logs in RPC-sized windows. */
export async function readMemeTrades(client: PublicClient, a: MemeAddresses, token: Address, fromBlock = a.deployBlock, window = 90_000n): Promise<MemeTrade[]> {
  const head = await client.getBlockNumber();
  const out: MemeTrade[] = [];
  for (let from = fromBlock; from <= head; from += window) {
    const to = from + window - 1n > head ? head : from + window - 1n;
    const logs = await client.getContractEvents({ address: a.launchpad, abi: curveLaunchpadAbi, eventName: "Trade", args: { token }, fromBlock: from, toBlock: to });
    for (const log of logs) {
      const x = log.args as { trader: Address; isBuy: boolean; quote: bigint; coin: bigint; fee: bigint; sqrtPriceX96: bigint; quoteReserve: bigint };
      out.push({ ...x, priceE18: priceE18(x.sqrtPriceX96), blockNumber: log.blockNumber, txHash: log.transactionHash });
    }
  }
  return out;
}

/** A holder's position: coin held, its value at the curve price, and share of what the curve has sold. */
export async function readMemePosition(client: PublicClient, m: MemeLaunch, holder: Address) {
  const coin = await client.readContract({ address: m.token, abi: erc20Abi, functionName: "balanceOf", args: [holder] });
  const valueAtCurve = (coin * m.priceE18) / 10n ** 18n;
  const exitQuote = m.stage === "trading" && coin > 0n ? quoteMemeSell(m, coin).quoteOut : null;
  const shareBps = m.coinSold > 0n ? Number((coin * 10_000n) / m.coinSold) : 0;
  return { coin, valueAtCurve, exitQuote, shareBps };
}

/** pathUSD fees the launchpad owes an account, and what the locker owes it for `coin`. */
export async function readMemeClaims(client: PublicClient, a: MemeAddresses, account: Address, coin?: Address) {
  const fees = await client.readContract({ address: a.launchpad, abi: curveLaunchpadAbi, functionName: "feesOwed", args: [account] });
  const locker = coin ? await client.readContract({ address: a.locker, abi: liquidityLockerAbi, functionName: "feesOwed", args: [coin, account] }) : null;
  return { launchpadFees: fees, lockerFees: locker ? { quote: locker[0], coin: locker[1] } : null };
}

const RECEIPT_ABI = [...curveLaunchpadAbi, ...curveGraduationLibAbi, ...liquidityLockerAbi] as const;

/** Decodes the launchpad/locker events in a receipt (LaunchCreated, Trade, Completed, Graduated, PoolCorrected…). */
export function readMemeReceipt(receipt: { logs: readonly { address: Address; data: Hex; topics: readonly Hex[] }[] }, a: MemeAddresses) {
  const ours = new Set([a.launchpad.toLowerCase(), a.locker.toLowerCase()]);
  const events: { name: string; args: Record<string, unknown> }[] = [];
  for (const log of receipt.logs) {
    if (!ours.has(log.address.toLowerCase())) continue;
    try {
      const d = decodeEventLog({ abi: RECEIPT_ABI, data: log.data, topics: log.topics as never }) as unknown as { eventName: string; args: Record<string, unknown> };
      events.push({ name: d.eventName, args: d.args });
    } catch {
      // not one of ours (e.g. OZ Ownable events are in the ABI too; anything else is skipped)
    }
  }
  return events;
}
