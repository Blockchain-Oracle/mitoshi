/**
 * Head-fresh engine reads through `EngineLens` (plan C.2.5), batched by the read client's Multicall3 — the only reads
 * that may gate a write (canon #1). Mapped onto the Masayume shapes (`EventMarket`, `OnchainSnapshot`) here, so the
 * provider and the order lane read one generation of a Window. Series facts never change once registered, so they are
 * cached for the process (persisted-read allowlist, C.2.2 `getBookParams`).
 */
import { getAddress, type Abi, type Address, type Hex } from "viem";
import { Abis, Addresses } from "viem/tempo";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { plainQuestion } from "@cwf/core/copy";
import { printSourceOf, tickerById, toMarketId, USD_DECIMALS, type EventMarket, type MarketId, type MarketState, type OnchainSnapshot, type OutcomeIdx, type PrintView, type BookLevel } from "@cwf/core";
import { multicallSliced, type SlicedClient } from "../runtime/multicall-sliced";
import { getPublicClient } from "../runtime/read-runtime";
import { laneBasisOf, marketIdOf, unpackPrint, venueOf, type Venue } from "../ops/venue";
import type { Grid, YesBook } from "./quote";

export const PAYOUT_DENOMINATOR = 10_000_000n;
/** Levels a quote walks (16 fills cap a taker; 32 covers evictions and display). */
export const BOOK_LEVELS = 32;
/** Nodes a lens level walk may visit (lens `maxNodes`). */
export const LENS_MAX_NODES = 512n;

export interface EngineVenue extends Venue {
  collateral: Address;
}

/** The engine venue on the runtime's chain; throws when the engine is not deployed there (callers map to not-deployed). */
export async function engineVenue(): Promise<EngineVenue> {
  const client = await getPublicClient();
  const venue = venueOf(client.chain.id);
  if (!venue) throw new EngineNotDeployedError(client.chain.id);
  return { ...venue, collateral: getAddress(Addresses.pathUsd) };
}

export class EngineNotDeployedError extends Error {
  constructor(readonly chainId: number) {
    super(`the engine is not deployed on chain ${chainId}`);
    this.name = "EngineNotDeployedError";
  }
}

export interface SeriesFacts extends Grid {
  seriesId: Hex;
  ticker: number;
  asset: string;
  basis: number;
  cadenceSec: number;
  minRestSec: number;
}

const seriesCache = new Map<string, SeriesFacts>();

type Raw = Record<string, bigint | number | string>;

export async function readSeries(ids: readonly Hex[]): Promise<Map<string, SeriesFacts>> {
  const want = [...new Set(ids.map((i) => i.toLowerCase()))].filter((i) => !seriesCache.has(i));
  if (want.length > 0) {
    const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
    const rows = (await client.multicall({ contracts: want.map((id) => ({ address: venue.lens, abi: engineLensAbi, functionName: "seriesOf" as const, args: [id as Hex] as const })), allowFailure: false })) as unknown as Raw[];
    rows.forEach((s, i) => {
      const ticker = Number(s.ticker);
      const symbol = tickerById(ticker)?.symbol ?? null;
      seriesCache.set(want[i]!, {
        seriesId: want[i] as Hex, ticker, asset: symbol ?? `#${ticker}`, basis: Number(s.basis), cadenceSec: Number(s.cadenceSec), minRestSec: Number(s.minRestSec),
        lotBase: BigInt(s.lotBase!), tickBase: BigInt(s.tickBase!), cashUnit: BigInt(s.cashUnit!), minLots: BigInt(s.minLots!), decimals: USD_DECIMALS,
      });
    });
  }
  return new Map(ids.map((i) => [i.toLowerCase(), seriesCache.get(i.toLowerCase())!]));
}

/** One Window as the lens reports it: the stored market plus its derived status and Series facts. */
export interface WindowFacts {
  marketId: MarketId;
  status: number;
  series: SeriesFacts;
  market: EventMarket;
  snapshot: OnchainSnapshot;
  /** The market's event sequence and order count (stream gap checks). */
  backingLots: bigint;
}

const STATE: Record<number, MarketState> = { 0: "open", 1: "resolved", 2: "voided" };

function printView(v: bigint): PrintView | null {
  const p = unpackPrint(v);
  return p.source === 0 ? null : { priceE8: p.priceE8, sourceTsSec: p.sourceTsSec, source: printSourceOf(p.source), signers: p.signers };
}

function winnerOf(state: MarketState, payoutYes: number, payoutNo: number): OutcomeIdx | null {
  if (state !== "resolved") return null;
  return payoutYes > payoutNo ? 0 : payoutNo > payoutYes ? 1 : null;
}

/** Windows by id, head-fresh; an unknown id is absent from the map. Batched with concurrent reads (viem's scheduler). */
export async function readWindows(ids: readonly MarketId[]): Promise<Map<MarketId, WindowFacts>> {
  if (ids.length === 0) return new Map();
  const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
  const lens = { address: venue.lens, abi: engineLensAbi } as const;
  const res = await client.multicall({
    contracts: ids.flatMap((id) => [{ ...lens, functionName: "marketOf" as const, args: [id] as const }, { ...lens, functionName: "marketRef" as const, args: [id] as const }]),
    allowFailure: true,
  });
  return windowsFrom(ids, res);
}

/**
 * `readWindows` for a display list (the lane list, a batch of cards): the same two lens reads per Window in its own
 * aggregate3, decoded in slices that yield to the main thread (D-184) — the lane list's decode was one long task on a
 * cold page. Not for the order lane's gate, which rides the tap's one batched round (D-142/D-150).
 */
export async function readWindowsSliced(ids: readonly MarketId[]): Promise<Map<MarketId, WindowFacts>> {
  if (ids.length === 0) return new Map();
  const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
  const lens = { address: venue.lens, abi: engineLensAbi as Abi } as const;
  const res = await multicallSliced(client as unknown as SlicedClient, ids.flatMap((id) => [{ ...lens, functionName: "marketOf", args: [id] }, { ...lens, functionName: "marketRef", args: [id] }]));
  return windowsFrom(ids, res);
}

async function windowsFrom(ids: readonly MarketId[], res: readonly { status: string; result?: unknown }[]): Promise<Map<MarketId, WindowFacts>> {
  const out = new Map<MarketId, WindowFacts>();
  const refs = ids.map((_, i) => res[2 * i + 1]);
  const series = await readSeries(refs.flatMap((r) => (r?.status === "success" ? [(r.result as unknown as Raw).seriesId as Hex] : [])));
  ids.forEach((id, i) => {
    const m = res[2 * i];
    const r = refs[i];
    if (m?.status !== "success" || r?.status !== "success") return;
    const mk = m.result as unknown as Raw;
    const ref = r.result as unknown as Raw;
    const s = series.get((ref.seriesId as string).toLowerCase());
    if (!s || Number(mk.tradingStart) === 0) return;
    out.set(id, toFacts(toMarketId(id), mk, Number(ref.status), s));
  });
  return out;
}

export function toFacts(marketId: MarketId, mk: Raw, status: number, s: SeriesFacts): WindowFacts {
  const state = STATE[Number(mk.state)] ?? "open";
  const open = printView(BigInt(mk.open!));
  const close = printView(BigInt(mk.close!));
  const payoutYes = Number(mk.payoutYes);
  const payoutNo = Number(mk.payoutNo);
  const winningOutcome = winnerOf(state, payoutYes, payoutNo);
  const lane = laneBasisOf(s.basis, tickerById(s.ticker)?.symbol ?? null) ?? "crypto24";
  const lastPrice = Number(mk.lastPrice);
  const unit = s.lotBase; // a lot's full payout (1000 × cashUnit == lotBase)
  const snapshot: OnchainSnapshot = {
    marketId,
    state,
    status,
    tradingStartSec: Number(mk.tradingStart),
    lockAtSec: Number(mk.lockAt),
    expirySec: Number(mk.expiry),
    prints: { open, close, checkOpen: printView(BigInt(mk.checkOpen!)), checkClose: printView(BigInt(mk.checkClose!)) },
    payouts: state === "open" ? null : { yes: (unit * BigInt(payoutYes)) / PAYOUT_DENOMINATOR, no: (unit * BigInt(payoutNo)) / PAYOUT_DENOMINATOR },
    lastPriceTicks: lastPrice === 0 ? null : lastPrice,
    seq: BigInt(mk.eventSeq!),
    decimals: s.decimals,
    winningOutcome,
  };
  const openingPriceRaw = open ? open.priceE8 : null;
  const market: EventMarket = {
    marketId,
    seriesId: s.seriesId,
    index: BigInt(mk.index!),
    asset: s.asset,
    lane,
    question: plainQuestion({ asset: s.asset, intervalSec: s.cadenceSec, openingPriceRaw }, 8).text,
    intervalSec: s.cadenceSec,
    tradingStartSec: snapshot.tradingStartSec,
    lockAtSec: snapshot.lockAtSec,
    expirySec: snapshot.expirySec,
    policyVersion: Number(mk.policyVersion),
    printSource: open?.source ?? null,
    singleSource: (Number(mk.flags) & 4) === 4, // MARKET_FLAG_SINGLE_SOURCE
    state,
    status: state === "resolved" ? "Resolved" : state === "voided" ? "Voided" : status === 0 ? "Listed" : status === 1 ? "Trading" : "Locked",
    collateral: getAddress(Addresses.pathUsd),
    decimals: s.decimals,
    winningOutcome,
    voidReason: state === "voided" ? (Number(mk.voidReason) === 2 ? "cross-check-divergence" : "missing-print") : null,
    openingPriceRaw,
    volumeQuoteRaw: BigInt(mk.volumeCash!),
    tradeCount: Number(mk.tradeCount),
    lastPriceTicks: snapshot.lastPriceTicks,
    resolvedAtMs: Number(mk.resolvedTs) > 0 ? Number(mk.resolvedTs) * 1000 : null,
  };
  return { marketId, status, series: s, market, snapshot, backingLots: BigInt(mk.backingLots!) };
}

/** The Series' latest `lookback` indices, as market ids (the lens-side discovery when the index is unavailable). */
export async function latestWindowIds(lookback = 2): Promise<MarketId[]> {
  const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
  const lens = { address: venue.lens, abi: engineLensAbi } as const;
  const count = Number(await client.readContract({ ...lens, functionName: "seriesCount" }));
  const ids = (await client.multicall({ contracts: Array.from({ length: count }, (_, i) => ({ ...lens, functionName: "seriesIdAt" as const, args: [i + 1] as const })), allowFailure: false })) as Hex[];
  const series = await client.multicall({ contracts: ids.map((id) => ({ ...lens, functionName: "seriesOf" as const, args: [id] as const })), allowFailure: false });
  return ids.flatMap((id, i) => {
    const next = BigInt((series[i] as unknown as Raw).nextIndex!);
    return Array.from({ length: lookback }, (_, k) => next - BigInt(k + 1)).filter((x) => x >= 0n).map((x) => toMarketId(marketIdOf(id, x)));
  });
}

type LevelsAnswer = readonly [readonly number[], readonly bigint[]];
const zipLevels = ([ticks, lots]: LevelsAnswer): BookLevel[] => ticks.map((t, i) => [Number(t), BigInt(lots[i]!)] as const).filter(([, q]) => q > 0n);
const levelsCall = (lensAddress: Address, marketId: MarketId, isBid: boolean, n: number, minRestSec: number) =>
  ({ address: lensAddress, abi: engineLensAbi, functionName: "levels" as const, args: [marketId, isBid, BigInt(n), minRestSec, LENS_MAX_NODES] as const });

/** YES-terms levels, takeable now (lens walk filter: live, unexpired, rested ≥ the Series' `minRestSec`). */
export async function readBook(marketId: MarketId, minRestSec: number, n = BOOK_LEVELS): Promise<YesBook> {
  const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
  const [bids, asks] = (await client.multicall({
    contracts: [true, false].map((isBid) => levelsCall(venue.lens, marketId, isBid, n, minRestSec)),
    allowFailure: false,
  })) as unknown as [LevelsAnswer, LevelsAnswer];
  return { bids: zipLevels(bids), asks: zipLevels(asks) };
}

const bookQueue: { marketId: MarketId; minRestSec: number; n: number; resolve: (b: YesBook) => void; reject: (e: unknown) => void }[] = [];
let bookFlush: ReturnType<typeof setTimeout> | null = null;

/**
 * `readBook` for display (the lane page, the word board): the books asked for in one macrotask go out as one
 * aggregate3 whose decode yields between slices (D-184) — ~60 cards' books resolving at once were one blocking decode.
 * The same lens call per side as `readBook`; the ticket's quotes keep `readBook` (fresh, the tap's own round).
 */
export function readBookBatched(marketId: MarketId, minRestSec: number, n = BOOK_LEVELS): Promise<YesBook> {
  return new Promise((resolve, reject) => {
    bookQueue.push({ marketId, minRestSec, n, resolve, reject });
    bookFlush ??= setTimeout(() => void flushBooks(), 0);
  });
}

async function flushBooks(): Promise<void> {
  bookFlush = null;
  const batch = bookQueue.splice(0);
  try {
    const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
    const calls = batch.flatMap((b) => [true, false].map((isBid) => ({ ...levelsCall(venue.lens, b.marketId, isBid, b.n, b.minRestSec), abi: engineLensAbi as Abi })));
    const res = await multicallSliced(client as unknown as SlicedClient, calls);
    batch.forEach((b, i) => {
      const bids = res[2 * i]!;
      const asks = res[2 * i + 1]!;
      if (bids.status !== "success") return b.reject(bids.error);
      if (asks.status !== "success") return b.reject(asks.error);
      b.resolve({ bids: zipLevels(bids.result as LevelsAnswer), asks: zipLevels(asks.result as LevelsAnswer) });
    });
  } catch (error) {
    for (const b of batch) b.reject(error);
  }
}

export interface EnginePosition {
  marketId: MarketId;
  credit: bigint;
  lockedCash: bigint;
  yesFree: bigint;
  noFree: bigint;
  yesLocked: bigint;
  noLocked: bigint;
  openOrders: number;
}

export async function readPositions(holder: Address, ids: readonly MarketId[]): Promise<EnginePosition[]> {
  if (ids.length === 0) return [];
  const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
  const rows = (await client.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "positionsOf", args: [holder, [...ids]] })) as unknown as Raw[];
  return rows.map((p, i) => ({
    marketId: ids[i]!, credit: BigInt(p.credit!), lockedCash: BigInt(p.lockedCash!), yesFree: BigInt(p.yesFree!), noFree: BigInt(p.noFree!),
    yesLocked: BigInt(p.yesLocked!), noLocked: BigInt(p.noLocked!), openOrders: Number(p.openOrders),
  }));
}

export interface OpenOrderView {
  orderId: bigint;
  kind: number;
  priceTicks: number;
  lots: bigint;
  expireTsSec: number;
}

export async function readOpenOrders(marketId: MarketId, holder: Address): Promise<OpenOrderView[]> {
  const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
  const rows = await client.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "openOrdersOf", args: [marketId, holder] });
  return rows.map((o) => ({ orderId: o.orderId, kind: o.kind, priceTicks: o.priceTicks, lots: o.lots, expireTsSec: o.expireTs }));
}

/** Whether the engine may pay `holder` right now (TIP-403 receive policy; the engine's own pre-check). */
export async function engineMayPay(holder: Address): Promise<boolean> {
  const [client, venue] = await Promise.all([getPublicClient(), engineVenue()]);
  const [ok] = (await client.readContract({ address: Addresses.tip403Registry as Address, abi: Abis.tip403Registry, functionName: "validateReceivePolicy", args: [venue.collateral, venue.engine, holder] })) as readonly [boolean, unknown];
  return ok;
}
