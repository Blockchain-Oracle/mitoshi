/**
 * Venue reads for the ops actors (plan C.2.5 lens views): the deployed engine and lens from the generated fragments,
 * every Series with its dated policy versions, and Windows by id with their four prints decoded. Batched through
 * Multicall3 with per-call failure: an unknown market (the lens reverts `UnknownMarket`) reads as null; a failed RPC
 * read throws, so an actor never mistakes an unread Window for a missing one (D-131). Replaces Agari
 * 03b30ab:packages/markets/src/ops/{venue,accounts}.ts (Solana account fetches → EngineLens `extsload` views).
 */
import { encodeAbiParameters, getAddress, keccak256, type Address, type Hex } from "viem";
import { deployments } from "@cwf/clients";
import { engineLensAbi } from "@cwf/clients/abis/EngineLens";
import { TICKERS, tickerById, type LaneBasis, type TickerSymbol } from "@cwf/core";
import type { OpsClient } from "./client";
import { engineErrorName } from "./send";

export interface Venue {
  chainId: number;
  engine: Address;
  lens: Address;
  verifiers: { redstone: Address; dataStreams: Address; attested: Address };
  deployBlock: bigint;
}

type Fragment = { contracts: Record<string, { address: string; deployBlock?: number }> };

/** The engine venue on a chain, from `contracts/deployments/<chainId>/engine.json` via codegen; null when not deployed. */
export function venueOf(chainId: number): Venue | null {
  const f = (deployments as unknown as Record<string, Record<string, Fragment>>)[String(chainId)]?.engine;
  const c = f?.contracts;
  if (!c?.EventsEngine || !c.EngineLens) return null;
  const at = (name: string) => getAddress(c[name]!.address);
  return {
    chainId,
    engine: at("EventsEngine"),
    lens: at("EngineLens"),
    verifiers: { redstone: at("RedStonePrintVerifier"), dataStreams: at("DataStreamsPrintVerifier"), attested: at("AttestedPrintVerifier") },
    deployBlock: BigInt(c.EventsEngine.deployBlock ?? 0),
  };
}

/** Engine basis byte → lane basis (A.1.2): Token 24/7 is `crypto24` for crypto tickers, `stock24` for stocks. */
export function laneBasisOf(basis: number, symbol: TickerSymbol | null): LaneBasis | null {
  if (basis === 0) return "regular";
  if (basis === 1) return "gap";
  if (basis === 2) return symbol && TICKERS[symbol].kind === "crypto" ? "crypto24" : "stock24";
  return null;
}

export interface PolicyView {
  validFromSec: number;
  /** null = open-ended. */
  validUntilSec: number | null;
  maxDivergenceBps: number;
  checkAdmissionSec: number;
  primary: PrintPolicyView;
  check: PrintPolicyView;
}

export interface PrintPolicyView {
  verifier: Address;
  source: number;
  graceSec: number;
  minDelaySec: number;
  barLenSec: number;
  openAdmissionSec: number;
  feedId: Hex;
  closeAdmissionSec: number;
  strictSec: number;
  statusMask: number;
}

export interface SeriesView {
  seriesId: Hex;
  ticker: number;
  symbol: TickerSymbol | null;
  basis: number;
  lane: LaneBasis | null;
  cadenceSec: number;
  lotBase: bigint;
  tickBase: bigint;
  cashUnit: bigint;
  minLots: bigint;
  nextIndex: bigint;
  lastExpirySec: number;
  minRestSec: number;
  maxLeadSec: number;
  versions: PolicyView[];
}

export interface PrintView {
  priceE8: bigint;
  sourceTsSec: number;
  /** 0 = empty slot. */
  source: number;
  signers: number;
  copied: boolean;
}

export interface MarketView {
  marketId: Hex;
  seriesIdx: number;
  index: bigint;
  tradingStartSec: number;
  lockAtSec: number;
  expirySec: number;
  openDeadlineSec: number;
  closeDeadlineSec: number;
  policyVersion: number;
  basis: number;
  /** 0 open, 1 resolved, 2 voided. */
  state: number;
  prints: { open: PrintView; close: PrintView; checkOpen: PrintView; checkClose: PrintView };
  payoutYes: number;
  payoutNo: number;
  voidReason: number;
  resolvedTsSec: number;
  orderCount: number;
  backingLots: bigint;
  tradeCount: bigint;
}

const OPEN_ENDED = 2n ** 40n - 1n;

/** `PrintLib.unpack`: 0..63 priceE8 · 64..103 sourceTs · 104..111 source · 112..119 signers · 120..127 flags. */
export function unpackPrint(v: bigint): PrintView {
  const raw = v & 0xffff_ffff_ffff_ffffn;
  return {
    priceE8: raw >= 2n ** 63n ? raw - 2n ** 64n : raw,
    sourceTsSec: Number((v >> 64n) & 0xff_ffff_ffffn),
    source: Number((v >> 104n) & 0xffn),
    signers: Number((v >> 112n) & 0xffn),
    copied: (Number((v >> 120n) & 0xffn) & 1) === 1,
  };
}

export const marketIdOf = (seriesId: Hex, index: bigint): Hex => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint64" }], [seriesId, index]));

type RawPolicy = { verifier: Address; source: number; graceSec: number; minDelaySec: number; barLenSec: number; openAdmissionSec: number; feedId: Hex; closeAdmissionSec: number; strictSec: number; statusMask: number };
type RawVersion = { validFrom: bigint | number; validUntil: bigint | number; maxDivergenceBps: number; checkAdmissionSec: number; primary: RawPolicy; check: RawPolicy };
const policy = (p: RawPolicy): PrintPolicyView => ({ verifier: p.verifier, source: p.source, graceSec: p.graceSec, minDelaySec: p.minDelaySec, barLenSec: p.barLenSec, openAdmissionSec: p.openAdmissionSec, feedId: p.feedId, closeAdmissionSec: p.closeAdmissionSec, strictSec: p.strictSec, statusMask: p.statusMask });
const version = (v: RawVersion): PolicyView => ({
  validFromSec: Number(v.validFrom),
  validUntilSec: BigInt(v.validUntil) === OPEN_ENDED ? null : Number(v.validUntil),
  maxDivergenceBps: v.maxDivergenceBps,
  checkAdmissionSec: v.checkAdmissionSec,
  primary: policy(v.primary),
  check: policy(v.check),
});

/** Every registered Series with its policy versions (1-based `seriesIdAt`). */
export async function listSeries(client: OpsClient, venue: Venue): Promise<SeriesView[]> {
  const lens = { address: venue.lens, abi: engineLensAbi } as const;
  const count = Number(await client.public.readContract({ ...lens, functionName: "seriesCount" }));
  const ids = (await client.public.multicall({ contracts: Array.from({ length: count }, (_, i) => ({ ...lens, functionName: "seriesIdAt" as const, args: [i + 1] as const })), allowFailure: false })) as Hex[];
  return fetchSeries(client, venue, ids);
}

/** Series by id, re-read (nextIndex and lastExpiry move with every listing). */
export async function fetchSeries(client: OpsClient, venue: Venue, ids: readonly Hex[]): Promise<SeriesView[]> {
  const lens = { address: venue.lens, abi: engineLensAbi } as const;
  const raw = (await client.public.multicall({ contracts: ids.map((id) => ({ ...lens, functionName: "seriesOf" as const, args: [id] as const })), allowFailure: false })) as Array<Record<string, bigint | number>>;
  const versionCalls = raw.flatMap((s, i) => Array.from({ length: Number(s.versionCount) }, (_, v) => ({ ...lens, functionName: "policyOf" as const, args: [ids[i]!, v] as const })));
  const versions = (await client.public.multicall({ contracts: versionCalls, allowFailure: false })) as RawVersion[];
  let cursor = 0;
  return raw.map((s, i) => {
    const n = Number(s.versionCount);
    const symbol = tickerById(Number(s.ticker))?.symbol ?? null;
    const out: SeriesView = {
      seriesId: ids[i]!,
      ticker: Number(s.ticker),
      symbol,
      basis: Number(s.basis),
      lane: laneBasisOf(Number(s.basis), symbol),
      cadenceSec: Number(s.cadenceSec),
      lotBase: BigInt(s.lotBase!),
      tickBase: BigInt(s.tickBase!),
      cashUnit: BigInt(s.cashUnit!),
      minLots: BigInt(s.minLots!),
      nextIndex: BigInt(s.nextIndex!),
      lastExpirySec: Number(s.lastExpiry),
      minRestSec: Number(s.minRestSec),
      maxLeadSec: Number(s.maxLeadSec),
      versions: versions.slice(cursor, cursor + n).map(version),
    };
    cursor += n;
    return out;
  });
}

type RawMarket = Record<string, bigint | number>;

function marketView(id: Hex, m: RawMarket): MarketView {
  const n = (k: string) => Number(m[k]);
  return {
    marketId: id,
    seriesIdx: n("seriesIdx"),
    index: BigInt(m.index!),
    tradingStartSec: n("tradingStart"),
    lockAtSec: n("lockAt"),
    expirySec: n("expiry"),
    openDeadlineSec: n("openDeadline"),
    closeDeadlineSec: n("closeDeadline"),
    policyVersion: n("policyVersion"),
    basis: n("basis"),
    state: n("state"),
    prints: { open: unpackPrint(BigInt(m.open!)), close: unpackPrint(BigInt(m.close!)), checkOpen: unpackPrint(BigInt(m.checkOpen!)), checkClose: unpackPrint(BigInt(m.checkClose!)) },
    payoutYes: n("payoutYes"),
    payoutNo: n("payoutNo"),
    voidReason: n("voidReason"),
    resolvedTsSec: n("resolvedTs"),
    orderCount: n("orderCount"),
    backingLots: BigInt(m.backingLots!),
    tradeCount: BigInt(m.tradeCount!),
  };
}

/** Windows by id; an unknown id reads as null. */
export async function fetchMarkets(client: OpsClient, venue: Venue, ids: readonly Hex[]): Promise<Array<MarketView | null>> {
  if (ids.length === 0) return [];
  const res = await client.public.multicall({ contracts: ids.map((id) => ({ address: venue.lens, abi: engineLensAbi, functionName: "marketOf" as const, args: [id] as const })), allowFailure: true });
  return res.map((r, i) => {
    if (r.status === "success") return marketView(ids[i]!, r.result as unknown as RawMarket);
    if (engineErrorName(r.error) === "UnknownMarket") return null;
    throw new Error(`marketOf ${ids[i]} not read: ${r.error instanceof Error ? r.error.message.split("\n")[0] : String(r.error)}`);
  });
}

export interface PositionView {
  credit: bigint;
  lockedCash: bigint;
  yesFree: bigint;
  noFree: bigint;
  yesLocked: bigint;
  noLocked: bigint;
  openOrders: number;
}

export async function positionsOf(client: OpsClient, venue: Venue, market: Hex, holders: readonly Address[]): Promise<PositionView[]> {
  if (holders.length === 0) return [];
  const res = (await client.public.multicall({ contracts: holders.map((h) => ({ address: venue.lens, abi: engineLensAbi, functionName: "positionOf" as const, args: [market, h] as const })), allowFailure: false })) as Array<Record<string, bigint | number>>;
  return res.map((p) => ({ credit: BigInt(p.credit!), lockedCash: BigInt(p.lockedCash!), yesFree: BigInt(p.yesFree!), noFree: BigInt(p.noFree!), yesLocked: BigInt(p.yesLocked!), noLocked: BigInt(p.noLocked!), openOrders: Number(p.openOrders) }));
}

export async function crankOptedOut(client: OpsClient, venue: Venue, holders: readonly Address[]): Promise<boolean[]> {
  if (holders.length === 0) return [];
  return (await client.public.multicall({ contracts: holders.map((h) => ({ address: venue.lens, abi: engineLensAbi, functionName: "crankOptedOut" as const, args: [h] as const })), allowFailure: false })) as boolean[];
}

export async function isRoller(client: OpsClient, venue: Venue, who: Address): Promise<boolean> {
  return (await client.public.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "isRoller", args: [who] })) as boolean;
}

export interface TopView {
  bidTicks: number;
  bidLots: bigint;
  askTicks: number;
  askLots: bigint;
}

export async function topOfBook(client: OpsClient, venue: Venue, market: Hex): Promise<TopView> {
  const t = (await client.public.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "topOfBook", args: [market] })) as Record<string, bigint | number>;
  return { bidTicks: Number(t.bidTicks), bidLots: BigInt(t.bidLots!), askTicks: Number(t.askTicks), askLots: BigInt(t.askLots!) };
}

export async function openOrdersOf(client: OpsClient, venue: Venue, market: Hex, holder: Address): Promise<Array<{ orderId: bigint; kind: number; priceTicks: number; lots: bigint; expireTsSec: number }>> {
  const rows = (await client.public.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "openOrdersOf", args: [market, holder] }));
  return rows.map((o) => ({ orderId: o.orderId, kind: o.kind, priceTicks: o.priceTicks, lots: o.lots, expireTsSec: o.expireTs }));
}

export async function totalOwed(client: OpsClient, venue: Venue): Promise<bigint> {
  const cfg = (await client.public.readContract({ address: venue.lens, abi: engineLensAbi, functionName: "config" })) as { totalOwed: bigint };
  return cfg.totalOwed;
}
