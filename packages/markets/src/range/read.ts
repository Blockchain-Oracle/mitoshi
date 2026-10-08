// Ported from Masayume 68f7a09:packages/markets/src/range/read.ts — rebuilt on the Tempo read runtime (A.4.7): the
// OracleHub question is gone (a round settles on its Window's engine close print), `params` carries D-109's
// `minRestSec` and D-172's `maxDriftE4`, reads decode the guard's and verifier's errors (`RANGE_READ_ABI`).
import type { Address, PublicClient } from "viem";
import { err, ok, diagnosis, toMarketId, USD_DECIMALS, oneUnit, type MarketId, type Reading } from "@cwf/core";
import {
  bandProbE6,
  floorStake,
  maxPayoutForStake,
  multiplierMilli,
  rangeSideIndex,
  rangeSideOf,
  rangeStatusOf,
  sideProbRaw,
  type RangeBasis,
  type RangeMode,
  type RangeParams,
  type RangeQuote,
  type RangeReserveState,
  type RangeRound,
  type RangeSide,
} from "@cwf/core/range";
import { getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { nowMs } from "../runtime/clock";
import { rangeVenueOf } from "./deployment";
import { diagnoseRange, RANGE_READ_ABI } from "./errors";

const PAGE = 50;
const MAX_ROUNDS = 500;
const BPS = 10_000n;
const NOT_DEPLOYED = "RangeReserve is not deployed on this network yet";

type RoundTuple = {
  owner: Address;
  status: number;
  side: number;
  marketId: `0x${string}`;
  expirySec: bigint;
  openedAtSec: bigint;
  settledAtSec: bigint;
  openingPrint: bigint;
  lowPrint: bigint;
  highPrint: bigint;
  closingPrint: bigint;
  stake: bigint;
  maxPayout: bigint;
  houseLocked: bigint;
  probRaw: bigint;
};

/** The public `params` getter flattens the struct into a tuple, in declaration order. */
type ParamsTuple = readonly [number, number, bigint, bigint, number, number, bigint, bigint, number, number, number, bigint, bigint, number, number];

export async function reserveClient(): Promise<PublicClient> {
  return (await getPublicClient()) as unknown as PublicClient;
}

export async function reserveContract() {
  const client = await getPublicClient();
  const v = rangeVenueOf(client.chain.id);
  return v ? ({ address: v.rangeReserve, abi: RANGE_READ_ABI } as const) : null;
}

export function toRangeParams(p: ParamsTuple): RangeParams {
  return {
    marginBps: p[0],
    maxExposureBps: p[1],
    maxSpreadRaw: p[2],
    centerDepthRaw: p[3],
    minCenterQE6: p[4],
    maxCenterQE6: p[5],
    minProbRaw: p[6],
    maxProbRaw: p[7],
    minTimeLeftSec: p[8],
    maxHorizonSec: p[9],
    staleAfterSec: p[10],
    maxPayoutCapBase: p[11],
    maxExpiryLockedBase: p[12],
    minRestSec: Number(p[13]),
    maxDriftE4: Number(p[14]),
  };
}

export function toRangeRound(roundId: bigint, r: RoundTuple): RangeRound {
  const status = rangeStatusOf(r.status);
  return {
    roundId,
    owner: r.owner.toLowerCase() as Address,
    status,
    side: rangeSideOf(r.side),
    marketId: toMarketId(r.marketId),
    expirySec: Number(r.expirySec),
    openedAtSec: Number(r.openedAtSec),
    settledAtSec: r.settledAtSec === 0n ? null : Number(r.settledAtSec),
    openingPrint: r.openingPrint,
    lowPrint: r.lowPrint,
    highPrint: r.highPrint,
    closingPrint: status === "live" || status === "void" ? null : r.closingPrint,
    stakeBase: r.stake,
    maxPayoutBase: r.maxPayout,
    houseLockedBase: r.houseLocked,
    probRaw: r.probRaw,
  };
}

/** The reserve's sheet and tunables in one multicall; null where no reserve is deployed. */
export async function getRangeReserveState(): Promise<Reading<RangeReserveState | null>> {
  return withReading("rangeReserve", async () => {
    const client = await getPublicClient();
    const deployment = rangeVenueOf(client.chain.id);
    const contract = await reserveContract();
    if (!deployment || !contract) return null;
    const [params, liquid, locked, supplyShares, paused] = await (await reserveClient()).multicall({
      allowFailure: false,
      contracts: [
        { ...contract, functionName: "params" },
        { ...contract, functionName: "liquid" },
        { ...contract, functionName: "locked" },
        { ...contract, functionName: "supplyShares" },
        { ...contract, functionName: "paused" },
      ],
    });
    const totalValueBase = liquid + locked;
    return {
      deployment: { chainId: deployment.chainId, rangeReserve: deployment.rangeReserve, fromBlock: deployment.fromBlock },
      params: toRangeParams(params as ParamsTuple),
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

async function roundsByIds(ids: readonly bigint[]): Promise<RangeRound[]> {
  const contract = await reserveContract();
  if (!contract || ids.length === 0) return [];
  const rows = await (await reserveClient()).multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({ ...contract, functionName: "roundOf", args: [id] }) as const),
  });
  return ids.map((id, i) => toRangeRound(id, rows[i] as RoundTuple));
}

const STATUS_RANK = { live: 0, won: 1, lost: 2, void: 2, claimed: 3 } as const;

/** One wallet's rounds: live first, then newest expiry; empty without a reserve. */
export async function listRangesOf(wallet: Address): Promise<Reading<RangeRound[]>> {
  return withReading(`ranges:${wallet}`, async () => {
    const contract = await reserveContract();
    if (!contract) return [];
    const client = await reserveClient();
    const total = Math.min(Number(await client.readContract({ ...contract, functionName: "roundCountOf", args: [wallet] })), MAX_ROUNDS);
    const ids: bigint[] = [];
    for (let offset = 0; offset < total; offset += PAGE) {
      const page = await client.readContract({ ...contract, functionName: "roundsOf", args: [wallet, BigInt(offset), BigInt(Math.min(PAGE, total - offset))] });
      ids.push(...(page as readonly bigint[]));
    }
    const rounds = await roundsByIds(ids);
    return rounds.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.expirySec - a.expirySec || Number(b.roundId - a.roundId));
  });
}

export async function getRange(roundId: bigint): Promise<Reading<RangeRound | null>> {
  return withReading(`range:${roundId}`, async () => (await roundsByIds([roundId]))[0] ?? null);
}

/** A supplier's shares and what they are worth of the reserve's total value right now. */
export async function getRangeSharesOf(wallet: Address): Promise<Reading<{ shares: bigint; worthBase: bigint }>> {
  return withReading(`rangeShares:${wallet}`, async () => {
    const contract = await reserveContract();
    if (!contract) return { shares: 0n, worthBase: 0n };
    const [shares, supplyShares, totalValue] = await (await reserveClient()).multicall({
      allowFailure: false,
      contracts: [
        { ...contract, functionName: "sharesOf", args: [wallet] },
        { ...contract, functionName: "supplyShares" },
        { ...contract, functionName: "totalValue" },
      ],
    });
    return { shares, worthBase: supplyShares === 0n ? 0n : (shares * totalValue) / supplyShares };
  });
}

/** What the pricing reads off the hub and the Window's book: the opening print, where the market sits, the house's σ. */
export interface RangeWindowBasis {
  openingPrint: bigint;
  centerQE6: bigint;
  sigmaE8: bigint;
}

export async function previewRangeBasis(marketId: MarketId, asset: string): Promise<Reading<RangeWindowBasis>> {
  const contract = await reserveContract();
  if (!contract) return err(diagnosis("not-deployed", NOT_DEPLOYED));
  try {
    const [openingPrint, centerQE6, sigmaE8] = await (await reserveClient()).readContract({ ...contract, functionName: "previewBasis", args: [marketId as `0x${string}`, asset] });
    return ok({ openingPrint, centerQE6, sigmaE8 }, nowMs());
  } catch (error) {
    return err(diagnoseRange(error));
  }
}

export interface RangePreview {
  stakeBase: bigint;
  probRaw: bigint;
  openingPrint: bigint;
  basis: RangeBasis;
}

export interface RangeBand {
  marketId: MarketId;
  asset: string;
  side: RangeSide;
  lowPrint: bigint;
  highPrint: bigint;
}

/**
 * The contract's own answer for a band (`previewOpen`): the exact stake it would charge for this payout
 * right now. A refusal is the error arm with the reserve's reason — never a stale last-good quote.
 */
export async function previewRangeOpen(band: RangeBand, maxPayoutBase: bigint): Promise<Reading<RangePreview>> {
  const contract = await reserveContract();
  if (!contract) return err(diagnosis("not-deployed", NOT_DEPLOYED));
  try {
    const [stake, probRaw, openingPrint, basis] = await (await reserveClient()).readContract({
      ...contract,
      functionName: "previewOpen",
      args: [band.marketId as `0x${string}`, band.asset, rangeSideIndex(band.side), band.lowPrint, band.highPrint, maxPayoutBase],
    });
    return ok({ stakeBase: stake, probRaw, openingPrint, basis: { centerQE6: Number(basis.centerQE6), sigmaE8: Number(basis.sigmaE8), tauSec: basis.tauSec } }, nowMs());
  } catch (error) {
    return err(diagnoseRange(error));
  }
}

/** The contract's preview as the one quote shape every ticket reads. */
export function toRangeQuote(preview: RangePreview, side: RangeSide, maxPayoutBase: bigint, one: bigint, decimals: number): RangeQuote {
  return {
    side,
    insideProbE6: side === "inside" ? (preview.probRaw * 1_000_000n) / one : 1_000_000n - (preview.probRaw * 1_000_000n) / one,
    probRaw: preview.probRaw,
    stakeBase: preview.stakeBase,
    maxPayoutBase,
    multiplierMilli: multiplierMilli(maxPayoutBase, preview.stakeBase),
    decimals,
    quotedAtMs: nowMs(),
  };
}

/**
 * A band quoted by the chain. "Set payout" is one call. "Set stake" is the inverse the contract does not
 * have: read the basis, solve the payout that stake buys with the mirror's arithmetic, then let the
 * contract price that payout — and if its basis moved in between, solve once more from its probability.
 */
export async function quoteRangeOnchain(band: RangeBand, mode: RangeMode, params: RangeParams, tauSec: number): Promise<Reading<RangeQuote>> {
  const decimals = USD_DECIMALS;
  const one = oneUnit(decimals);
  if (mode.kind === "fixPayout") {
    const preview = await previewRangeOpen(band, mode.maxPayoutBase);
    return preview.ok ? ok(toRangeQuote(preview.value, band.side, mode.maxPayoutBase, one, decimals), preview.asOfMs) : preview;
  }
  const basis = await previewRangeBasis(band.marketId, band.asset);
  if (!basis.ok) return basis;
  const insideE6 = bandProbE6(basis.value.openingPrint, band.lowPrint, band.highPrint, basis.value.centerQE6, basis.value.sigmaE8, tauSec);
  const probRaw = sideProbRaw(insideE6, band.side, one);
  const solve = (prob: bigint) => {
    const payout = maxPayoutForStake(mode.stakeBase, prob, one, params.marginBps);
    return payout > params.maxPayoutCapBase ? params.maxPayoutCapBase : payout;
  };
  let payout = solve(probRaw);
  if (payout === 0n) return err(diagnosis("outside-band", `Underpriced(${mode.stakeBase}, 0)`, { errorName: "Underpriced" }));
  let preview = await previewRangeOpen(band, payout);
  if (!preview.ok) return preview;
  if (preview.value.stakeBase > mode.stakeBase) {
    payout = solve(preview.value.probRaw);
    if (payout === 0n) return err(diagnosis("outside-band", `Underpriced(${mode.stakeBase}, 0)`, { errorName: "Underpriced" }));
    preview = await previewRangeOpen(band, payout);
    if (!preview.ok) return preview;
  }
  const stakeBase = floorStake(payout, preview.value.probRaw, one, params.marginBps);
  return ok(toRangeQuote({ ...preview.value, stakeBase }, band.side, payout, one, decimals), preview.asOfMs);
}
