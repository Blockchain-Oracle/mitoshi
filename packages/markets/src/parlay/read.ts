/**
 * Parlay reads (Ported from Masayume 68f7a09:packages/markets/src/parlay/read.ts, rebuilt on the Tempo read runtime):
 * the reserve's sheet and tunables, the chain's own price for a ticket (`previewOpen`), the PD-2 fair-value floor per
 * leg (the guard's `previewFairUpE6` on a live spot — the same rule the open enforces with a signed one), and a
 * wallet's tickets with each leg's Window read beside it and the one leg D-108 lets settle next.
 */
import type { Address, Hex } from "viem";
import {
  diagnosis,
  err,
  floorStake,
  hasSharedInstant,
  maxPayoutForStake,
  multiplierMilli,
  ok,
  parlayLegStatusOf,
  parlayStatusOf,
  productProb,
  SIDE_TO_OUTCOME,
  OUTCOME_TO_SIDE,
  toMarketId,
  type MarketId,
  type OutcomeIdx,
  type ParlayLegInput,
  type ParlayMode,
  type ParlayParams,
  type ParlayQuote,
  type ParlayReserveState,
  type ParlayTicket,
  type Reading,
  type Diagnosis,
} from "@cwf/core";
import { fairValueGuardAbi } from "@cwf/clients/abis/FairValueGuard";
import { USD_DECIMALS } from "@cwf/core";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { nowMs } from "../runtime/clock";
import { readSeries, readWindows } from "../engine/lens";
import { parlayVenueOf, type ParlayVenue } from "./deployment";
import { diagnoseParlay, PARLAY_READ_ABI } from "./errors";
import { bookParlayOpen } from "./refusal";

const PAGE = 50n;
const MAX_TICKETS = 500;
const BPS = 10_000n;
const ONE = 10n ** BigInt(USD_DECIMALS);
const P_ONE = 1_000_000n;

type ParlayTuple = { owner: Address; status: number; legCount: number; wonCount: number; openedAtSec: bigint; lastExpirySec: bigint; stake: bigint; maxPayout: bigint; houseLocked: bigint; combinedProbRaw: bigint };
type LegTuple = { marketId: Hex; outcomeIdx: number; status: number; expirySec: bigint; resolvedAtSec: bigint; priceRaw: bigint };
/** The public `params` getter flattens the struct into a tuple, in declaration order (D-165 adds the last two). */
type ParamsTuple = readonly [number, number, number, number, bigint, bigint, bigint, bigint, number, bigint];

export class ParlayNotDeployedError extends Error {
  constructor(readonly chainId: number) {
    super(`ParlayReserve is not deployed on chain ${chainId}`);
    this.name = "ParlayNotDeployedError";
  }
}

async function venue(): Promise<{ client: Awaited<ReturnType<typeof getPublicClient>>; v: ParlayVenue | null }> {
  const client = await getPublicClient();
  return { client, v: parlayVenueOf(client.chain.id) };
}

export function toParlayParams(p: ParamsTuple): ParlayParams {
  return {
    marginBps: p[0],
    maxExposureBps: p[1],
    correlationBps: p[2],
    maxLegs: p[3],
    maxPayoutCapBase: p[4],
    maxExpiryLockedBase: p[5],
    minCombinedProbRaw: p[6],
    priceDepthRaw: p[7],
    minRestSec: Number(p[8]),
    fairSlackRaw: p[9],
  };
}

/** The reserve's sheet and tunables in one multicall; null where no reserve is deployed. */
export async function readParlayReserve(): Promise<Reading<ParlayReserveState | null>> {
  return withReading("parlayReserve", async () => {
    const { client, v } = await venue();
    if (!v) return null;
    const c = { address: v.parlayReserve, abi: PARLAY_READ_ABI } as const;
    const [params, liquid, locked, supplyShares, paused] = await client.multicall({
      allowFailure: false,
      contracts: [
        { ...c, functionName: "params" },
        { ...c, functionName: "liquid" },
        { ...c, functionName: "locked" },
        { ...c, functionName: "supplyShares" },
        { ...c, functionName: "paused" },
      ],
    });
    const totalValueBase = liquid + locked;
    return {
      deployment: { chainId: v.chainId, parlayReserve: v.parlayReserve, fromBlock: v.fromBlock },
      params: toParlayParams(params as unknown as ParamsTuple),
      liquidBase: liquid,
      lockedBase: locked,
      totalValueBase,
      utilizationBps: totalValueBase === 0n ? 0 : Number((locked * BPS) / totalValueBase),
      supplyShares,
      paused,
      decimals: USD_DECIMALS,
    };
  });
}

export interface ParlayPreview {
  stakeBase: bigint;
  combinedProbRaw: bigint;
  legPricesRaw: bigint[];
  expiriesSec: number[];
}

export const legTuples = (legs: readonly ParlayLegInput[]) => legs.map((leg) => ({ marketId: leg.marketId as Hex, outcomeIdx: SIDE_TO_OUTCOME[leg.side] }));

/**
 * The contract's own answer for a ticket (`previewOpen`): the exact stake it would charge for this payout right now,
 * priced off rested depth inside the call. A refusal is the error arm with the reserve's reason — never a stale
 * last-good quote for a ticket the reserve would not take.
 */
export async function previewParlayOpen(legs: readonly ParlayLegInput[], maxPayoutBase: bigint): Promise<Reading<ParlayPreview>> {
  const { client, v } = await venue();
  if (!v) return err(diagnosis("not-deployed", new ParlayNotDeployedError(client.chain.id).message));
  try {
    const [stake, combined, prices, expiries] = await client.readContract({ address: v.parlayReserve, abi: PARLAY_READ_ABI, functionName: "previewOpen", args: [legTuples(legs), maxPayoutBase] });
    return ok({ stakeBase: stake, combinedProbRaw: combined, legPricesRaw: [...prices], expiriesSec: expiries.map(Number) }, nowMs());
  } catch (error) {
    return err(diagnoseParlay(error));
  }
}

function toQuote(preview: ParlayPreview, maxPayoutBase: bigint): ParlayQuote {
  return {
    legPricesRaw: preview.legPricesRaw,
    legProbBps: preview.legPricesRaw.map((price) => Number((price * BPS) / ONE)),
    combinedProbRaw: preview.combinedProbRaw,
    rawCombinedProbRaw: productProb(preview.legPricesRaw, ONE),
    correlated: hasSharedInstant(preview.expiriesSec),
    stakeBase: preview.stakeBase,
    maxPayoutBase,
    multiplierMilli: multiplierMilli(maxPayoutBase, preview.stakeBase),
    decimals: USD_DECIMALS,
    quotedAtMs: nowMs(),
  };
}

const underpriced = (stakeBase: bigint) => err(diagnosis("outside-band", `Underpriced(${stakeBase}, 0)`, { errorName: "Underpriced" }));

/**
 * A whole ticket quoted by the chain. "Set payout" is one call. "Set stake" is the inverse the contract does not
 * have: price over the floor depth, solve the payout that stake buys, then let the contract price over that payout —
 * and if the walk into deeper levels made the stake overshoot, solve once more from those prices. The last preview is
 * always over a depth no shallower than the payout returned, so the chain can only charge less than the figure shown.
 */
export async function quoteParlayOnchain(legs: readonly ParlayLegInput[], mode: ParlayMode, params: ParlayParams): Promise<Reading<ParlayQuote>> {
  if (mode.kind === "fixPayout") {
    const preview = await previewParlayOpen(legs, mode.maxPayoutBase);
    return preview.ok ? ok(toQuote(preview.value, mode.maxPayoutBase), preview.asOfMs) : preview;
  }
  const first = await previewParlayOpen(legs, params.priceDepthRaw);
  if (!first.ok) return first;
  let payout = maxPayoutForStake(mode.stakeBase, first.value.combinedProbRaw, ONE, params.marginBps);
  if (payout > params.maxPayoutCapBase) payout = params.maxPayoutCapBase;
  if (payout === 0n) return underpriced(mode.stakeBase);
  let preview = await previewParlayOpen(legs, payout);
  if (!preview.ok) return preview;
  if (preview.value.stakeBase > mode.stakeBase) {
    payout = maxPayoutForStake(mode.stakeBase, preview.value.combinedProbRaw, ONE, params.marginBps);
    if (payout === 0n) return underpriced(mode.stakeBase);
    preview = await previewParlayOpen(legs, payout);
    if (!preview.ok) return preview;
  }
  // The floor the contract applies over its own depth is what the surface displays, never the typed stake.
  const stakeBase = floorStake(payout, preview.value.combinedProbRaw, ONE, params.marginBps);
  return ok(toQuote({ ...preview.value, stakeBase }, payout), preview.asOfMs);
}

/** The guard's model for each leg's side (× 1e6) at a live spot — the floor `openParlay` enforces with a signed one. */
export async function previewLegFair(legs: readonly ParlayLegInput[], spotsE8: readonly bigint[]): Promise<bigint[]> {
  const { client, v } = await venue();
  if (!v) throw new ParlayNotDeployedError(client.chain.id);
  const ups = await client.multicall({
    allowFailure: false,
    contracts: legs.map((leg, i) => ({ address: v.guard, abi: fairValueGuardAbi, functionName: "previewFairUpE6" as const, args: [leg.marketId as Hex, spotsE8[i]!] as const })),
  });
  return ups.map((up, i) => (legs[i]!.side === "up" ? (up as bigint) : P_ONE - (up as bigint)));
}

/** Which Windows the guard can model (σ for its Series, a spot source for its ticker): the reserve refuses the rest. */
export interface FairModel {
  sigmaE8: bigint;
  /** The RedStone feed id as ASCII (e.g. "BTC"), or null when the ticker has no spot source. */
  feed: string | null;
}

export async function readFairModels(seriesIds: readonly Hex[]): Promise<Map<string, FairModel>> {
  const out = new Map<string, FairModel>();
  const { client, v } = await venue();
  if (!v || seriesIds.length === 0) return out;
  const series = [...(await readSeries(seriesIds)).values()];
  const res = await client.multicall({
    allowFailure: false,
    contracts: series.flatMap((s) => [
      { address: v.guard, abi: fairValueGuardAbi, functionName: "sigmaE8OfSeries" as const, args: [s.seriesId] as const },
      { address: v.guard, abi: fairValueGuardAbi, functionName: "spotSourceOf" as const, args: [s.ticker] as const },
    ]),
  });
  series.forEach((s, i) => {
    const sigmaE8 = res[2 * i] as bigint;
    const [verifier, feedId] = res[2 * i + 1] as unknown as readonly [Address, Hex];
    const feed = /^0x0+$/.test(verifier) ? null : feedAscii(feedId);
    out.set(s.seriesId.toLowerCase(), { sigmaE8, feed });
  });
  return out;
}

function feedAscii(feedId: Hex): string {
  let s = "";
  for (let i = 2; i < feedId.length; i += 2) {
    const c = parseInt(feedId.slice(i, i + 2), 16);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** A leg with the Window it names read beside it, so the slip can say what the leg is and when it can settle. */
export interface ParlayLegView {
  marketId: MarketId;
  side: "up" | "down";
  status: ReturnType<typeof parlayLegStatusOf>;
  expirySec: number;
  resolvedAtSec: number | null;
  priceRaw: bigint;
  asset: string | null;
  intervalSec: number | null;
  openingPriceE8: bigint | null;
  /** The engine has resolved or voided the Window: the leg can be decided once it is next (D-108). */
  settledOnchain: boolean;
}

export interface ParlayTicketView extends Omit<ParlayTicket, "legs"> {
  legs: ParlayLegView[];
  /** D-108: the only leg `resolveLeg` accepts now (`legCount` when none is pending). */
  nextLegIdx: number;
}

const STATUS_RANK = { live: 0, won: 1, lost: 2, void: 2, claimed: 3 } as const;

/** One wallet's tickets: live first, then newest expiry — the reference's slip order; empty without a reserve. */
export async function listParlaysOf(wallet: Address): Promise<Reading<ParlayTicketView[]>> {
  return withReading(`parlays:${wallet}`, async () => {
    const { client, v } = await venue();
    if (!v) return [];
    const c = { address: v.parlayReserve, abi: PARLAY_READ_ABI } as const;
    const total = Math.min(Number(await client.readContract({ ...c, functionName: "parlayCountOf", args: [wallet] })), MAX_TICKETS);
    const ids: bigint[] = [];
    for (let offset = 0n; offset < BigInt(total); offset += PAGE) {
      const page = await client.readContract({ ...c, functionName: "parlaysOf", args: [wallet, offset, PAGE] });
      ids.push(...page);
    }
    if (ids.length === 0) return [];
    const rows = await client.multicall({
      allowFailure: false,
      contracts: ids.flatMap((id) => [
        { ...c, functionName: "parlayOf" as const, args: [id] as const },
        { ...c, functionName: "legsOf" as const, args: [id] as const },
        { ...c, functionName: "nextLegOf" as const, args: [id] as const },
      ]),
    });
    const marketIds = [...new Set(ids.flatMap((_, i) => (rows[i * 3 + 1] as unknown as LegTuple[]).map((l) => toMarketId(l.marketId))))];
    const facts = await readWindows(marketIds);
    const tickets = ids.map((id, i) => toTicketView(id, rows[i * 3] as unknown as ParlayTuple, rows[i * 3 + 1] as unknown as LegTuple[], Number(rows[i * 3 + 2] as bigint), facts));
    return tickets.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.lastExpirySec - a.lastExpirySec || Number(b.parlayId - a.parlayId));
  });
}

function toTicketView(parlayId: bigint, p: ParlayTuple, legs: readonly LegTuple[], nextLegIdx: number, facts: Awaited<ReturnType<typeof readWindows>>): ParlayTicketView {
  return {
    parlayId,
    owner: p.owner.toLowerCase() as Address,
    status: parlayStatusOf(p.status),
    legCount: p.legCount,
    wonCount: p.wonCount,
    openedAtSec: Number(p.openedAtSec),
    lastExpirySec: Number(p.lastExpirySec),
    stakeBase: p.stake,
    maxPayoutBase: p.maxPayout,
    houseLockedBase: p.houseLocked,
    combinedProbRaw: p.combinedProbRaw,
    nextLegIdx,
    legs: legs.map((leg) => {
      const f = facts.get(toMarketId(leg.marketId));
      return {
        marketId: toMarketId(leg.marketId),
        side: OUTCOME_TO_SIDE[leg.outcomeIdx as OutcomeIdx],
        status: parlayLegStatusOf(leg.status),
        expirySec: Number(leg.expirySec),
        resolvedAtSec: leg.resolvedAtSec === 0n ? null : Number(leg.resolvedAtSec),
        priceRaw: leg.priceRaw,
        asset: f?.market.asset ?? null,
        intervalSec: f?.market.intervalSec ?? null,
        openingPriceE8: f?.market.openingPriceRaw ?? null,
        settledOnchain: f ? f.market.state !== "open" : false,
      };
    }),
  };
}

/** The ticket an open booked, from its receipt's `ParlayOpened` (the id and the stake the reserve actually took). */
export async function readOpenedTicket(txHash: Hex): Promise<{ parlayId: bigint; stakeBase: bigint } | null> {
  const client = await getPublicClient();
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  return bookParlayOpen(receipt.logs);
}

/** What the reserve holds for `wallet` after a payout its receive policy refused (P12; `claimOwed` pays it). */
export async function readParlayOwed(wallet: Address): Promise<Reading<bigint>> {
  return withReading(`parlayOwed:${wallet}`, async () => {
    const { client, v } = await venue();
    if (!v) return 0n;
    return client.readContract({ address: v.parlayReserve, abi: PARLAY_READ_ABI, functionName: "owedOf", args: [wallet] });
  });
}

/**
 * The reserve's caps for a ticket that would lock `houseLockedBase` (`checkCapacity`: liquidity, the exposure cap, the
 * per-instant sub-cap) — what `openParlay` checks after pricing and `previewOpen` does not. Null when it fits.
 */
export async function checkParlayCapacity(houseLockedBase: bigint, expiriesSec: readonly number[]): Promise<Diagnosis | null> {
  const { client, v } = await venue();
  if (!v) return diagnosis("not-deployed", new ParlayNotDeployedError(client.chain.id).message);
  try {
    await client.readContract({ address: v.parlayReserve, abi: PARLAY_READ_ABI, functionName: "checkCapacity", args: [houseLockedBase, expiriesSec.map(BigInt)] });
    return null;
  } catch (error) {
    return diagnoseParlay(error);
  }
}

/** A supplier's shares and what they are worth of the reserve's total value right now (the Earn page); zeros without a reserve. */
export async function getParlaySharesOf(wallet: Address): Promise<Reading<{ shares: bigint; worthBase: bigint }>> {
  return withReading(`parlayShares:${wallet}`, async () => {
    const { client, v } = await venue();
    if (!v) return { shares: 0n, worthBase: 0n };
    const c = { address: v.parlayReserve, abi: PARLAY_READ_ABI } as const;
    const [shares, supplyShares, totalValue] = await client.multicall({
      allowFailure: false,
      contracts: [
        { ...c, functionName: "sharesOf", args: [wallet] },
        { ...c, functionName: "supplyShares" },
        { ...c, functionName: "totalValue" },
      ],
    });
    return { shares, worthBase: supplyShares === 0n ? 0n : (shares * totalValue) / supplyShares };
  });
}
