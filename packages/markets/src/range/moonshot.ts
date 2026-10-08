// Ported from Masayume 68f7a09:packages/markets/src/range/moonshot.ts — on the Tempo read runtime; unchanged solve.
import {
  bandProbE6,
  maxPayoutForStake,
  moonshotBandEdges,
  moonshotPayoutCapBase,
  rungHolds,
  sideProbRaw,
  solveStrike,
  type MoonshotBand,
  type MoonshotCall,
  type RangeBasis,
  type RangeMode,
  type RangeParams,
  type RangeQuote,
} from "@cwf/core/range";
import { diagnosis, err, ok, oneUnit, USD_DECIMALS, type Diagnosis, type MarketId, type Reading } from "@cwf/core";
import { nowMs } from "../runtime/clock";
import { diagnoseRange } from "./errors";
import { previewRangeBasis, previewRangeOpen, reserveClient, reserveContract, toRangeQuote, type RangeBand, type RangePreview, type RangeWindowBasis } from "./read";

const NOT_DEPLOYED = "RangeReserve is not deployed on this network yet";

export interface MoonshotWindow {
  marketId: MarketId;
  asset: string;
}

/** The chain's two answers a Moonshot quote is built from; injectable so the solve can be driven without a chain. */
export interface MoonshotReads {
  previewBasis: (marketId: MarketId, asset: string) => Promise<Reading<RangeWindowBasis>>;
  previewOpen: (band: RangeBand, maxPayoutBase: bigint) => Promise<Reading<RangePreview>>;
}

export interface MoonshotQuote {
  call: MoonshotCall;
  band: MoonshotBand;
  /** The band as the `range-open` intent carries it. */
  rangeBand: RangeBand;
  openingPrint: bigint;
  /** The basis the contract priced on, for the slip. */
  basis: RangeBasis;
  /** The contract's own figures: its stake, its probability, its multiple. */
  quote: RangeQuote;
  /** `maxPayout − stake`: what this round would lock of the expiry's budget. */
  houseLockedBase: bigint;
  /** This rung's payout ceiling — the product's cap under the contract's. */
  payoutCapBase: bigint;
}

function underpriced(stakeBase: bigint): Diagnosis {
  return diagnosis("outside-band", `Underpriced(${stakeBase}, 0)`, { errorName: "Underpriced" });
}

function overCap(maxPayoutBase: bigint, capBase: bigint): Diagnosis {
  return diagnosis("contract-revert", `OverPayoutCap(${maxPayoutBase}, ${capBase})`, { errorName: "OverPayoutCap" });
}

function toRangeBand(window: MoonshotWindow, band: MoonshotBand): RangeBand {
  return { marketId: window.marketId, asset: window.asset, side: band.side, lowPrint: band.lowPrint, highPrint: band.highPrint };
}

interface SolveBasis {
  openingPrint: bigint;
  centerQE6: bigint;
  sigmaE8: bigint;
  tauSec: number;
}

/** The payout a fixed stake buys on this band at this basis, under the rung's cap; 0 when the stake buys nothing. */
function payoutForStake(stakeBase: bigint, band: MoonshotBand, basis: SolveBasis, params: RangeParams, one: bigint, capBase: bigint): bigint {
  const probRaw = sideProbRaw(bandProbE6(basis.openingPrint, band.lowPrint, band.highPrint, basis.centerQE6, basis.sigmaE8, basis.tauSec), band.side, one);
  const payout = maxPayoutForStake(stakeBase, probRaw, one, params.marginBps);
  return payout > capBase ? capBase : payout;
}

/**
 * A Moonshot quoted by the chain: read the basis, solve the strike, let the contract price the band. The
 * contract prices off its own basis at its own second, so if the rung no longer holds on the figure it
 * returns (`rungHolds`), the strike is solved once more from that basis and the contract asked again; a
 * "Set stake" whose stake the contract now exceeds is re-solved from its probability, as `quoteRangeOnchain`
 * does. What comes back is the contract's own stake and multiple, never the mirror's estimate.
 */
export async function solveMoonshotQuote(
  reads: MoonshotReads,
  window: MoonshotWindow,
  call: MoonshotCall,
  mode: RangeMode,
  params: RangeParams,
  tauSec: number,
  decimals: number,
): Promise<Reading<MoonshotQuote>> {
  const one = oneUnit(decimals);
  const capBase = moonshotPayoutCapBase(call.multiple, params.maxPayoutCapBase, one);
  if (mode.kind === "fixPayout" && mode.maxPayoutBase > capBase) return err(overCap(mode.maxPayoutBase, capBase));

  const read = await reads.previewBasis(window.marketId, window.asset);
  if (!read.ok) return read;
  let basis: SolveBasis = { ...read.value, tauSec };
  const solve = (b: SolveBasis) => solveStrike({ ...call, openingPrint: b.openingPrint, centerQE6: b.centerQE6, sigmaE8: b.sigmaE8, tauSec: b.tauSec, marginBps: params.marginBps, one });
  let band = solve(basis);
  let payout = mode.kind === "fixPayout" ? mode.maxPayoutBase : payoutForStake(mode.stakeBase, band, basis, params, one, capBase);
  if (payout === 0n) return err(underpriced(mode.kind === "fixStake" ? mode.stakeBase : 0n));

  let preview = await reads.previewOpen(toRangeBand(window, band), payout);
  if (!preview.ok) return preview;

  if (!rungHolds(preview.value.probRaw, call.multiple, one, params.marginBps)) {
    const b = preview.value.basis;
    basis = { openingPrint: preview.value.openingPrint, centerQE6: BigInt(b.centerQE6), sigmaE8: BigInt(b.sigmaE8), tauSec: b.tauSec };
    band = solve(basis);
    if (mode.kind === "fixStake") payout = payoutForStake(mode.stakeBase, band, basis, params, one, capBase);
    if (payout === 0n) return err(underpriced(mode.kind === "fixStake" ? mode.stakeBase : 0n));
    preview = await reads.previewOpen(toRangeBand(window, band), payout);
    if (!preview.ok) return preview;
  }

  if (mode.kind === "fixStake" && preview.value.stakeBase > mode.stakeBase) {
    const next = maxPayoutForStake(mode.stakeBase, preview.value.probRaw, one, params.marginBps);
    payout = next > capBase ? capBase : next;
    if (payout === 0n) return err(underpriced(mode.stakeBase));
    preview = await reads.previewOpen(toRangeBand(window, band), payout);
    if (!preview.ok) return preview;
  }

  const rangeBand = toRangeBand(window, band);
  const quote = toRangeQuote(preview.value, band.side, payout, one, decimals);
  return ok({ call, band, rangeBand, openingPrint: preview.value.openingPrint, basis: preview.value.basis, quote, houseLockedBase: payout - quote.stakeBase, payoutCapBase: capBase }, preview.asOfMs);
}

const LIVE_READS: MoonshotReads = { previewBasis: previewRangeBasis, previewOpen: previewRangeOpen };

export function quoteMoonshotOnchain(window: MoonshotWindow, call: MoonshotCall, mode: RangeMode, params: RangeParams, tauSec: number): Promise<Reading<MoonshotQuote>> {
  return solveMoonshotQuote(LIVE_READS, window, call, mode, params, tauSec, USD_DECIMALS);
}

export interface RangeCapacity {
  /** Whether the reserve would accept a round locking `houseLockedBase` on this expiry right now. */
  fits: boolean;
  /** The reserve's own refusal — `OverExpiryCap`, `InsufficientLiquidity`, `OverExposure` — when it would not. */
  refusal: Diagnosis | null;
  /** What the expiry already has locked against it, for the liability line. */
  lockedByExpiryBase: bigint;
}

/** The reserve's caps for a round, asked before the popup: `checkCapacity` is the exact check `openRange` runs after pricing. */
export async function readRangeCapacity(houseLockedBase: bigint, expirySec: number): Promise<Reading<RangeCapacity>> {
  const contract = await reserveContract();
  if (!contract) return err(diagnosis("not-deployed", NOT_DEPLOYED));
  const client = await reserveClient();
  const expiry = BigInt(expirySec);
  try {
    const [lockedByExpiryBase, refusal] = await Promise.all([
      client.readContract({ ...contract, functionName: "lockedByExpiry", args: [expiry] }),
      client.readContract({ ...contract, functionName: "checkCapacity", args: [houseLockedBase, expiry] }).then(
        () => null,
        (error: unknown) => diagnoseRange(error),
      ),
    ]);
    return ok({ fits: refusal === null, refusal, lockedByExpiryBase }, nowMs());
  } catch (error) {
    return err(diagnoseRange(error));
  }
}
