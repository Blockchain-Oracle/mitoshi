// Ported from Masayume 68f7a09:packages/markets/src/range/moonshot.test.ts
import { bandProbE6, floorStake, rungHolds, sideProbRaw, solveStrike, type RangeParams } from "@cwf/core/range";
import { err, ok } from "@cwf/core";
import { diagnosis, toMarketId } from "@cwf/core/types";
import { describe, expect, it } from "vitest";
import { solveMoonshotQuote, type MoonshotReads } from "./moonshot";
import type { RangeBand, RangePreview } from "./read";

const ONE = 1_000_000n;
const DECIMALS = 6;
const OPEN = 7_673_523n;
const SIGMA = 6_200n;
const TAU_SEC = 240;
const WINDOW = { marketId: toMarketId(`0x${"ab".repeat(32)}`), asset: "BTC" };
const PARAMS: RangeParams = {
  marginBps: 1_200,
  maxExposureBps: 6_000,
  maxSpreadRaw: 200_000n,
  centerDepthRaw: 20n * ONE,
  minCenterQE6: 30_000,
  maxCenterQE6: 970_000,
  minProbRaw: 20_000n,
  maxProbRaw: 970_000n,
  minTimeLeftSec: 60,
  maxHorizonSec: 172_800,
  staleAfterSec: 21_600,
  maxPayoutCapBase: 500n * ONE,
  maxExpiryLockedBase: 1_000n * ONE, minRestSec: 20, maxDriftE4: 20_000,
};

/** The contract's `previewOpen`, as `RangePricing._price` computes it, at the chain's own basis. */
function chainPreview(centerQE6: bigint, tauSec: number) {
  return (band: RangeBand, maxPayoutBase: bigint): RangePreview => {
    const probRaw = sideProbRaw(bandProbE6(OPEN, band.lowPrint, band.highPrint, centerQE6, SIGMA, tauSec), band.side, ONE);
    return { stakeBase: floorStake(maxPayoutBase, probRaw, ONE, PARAMS.marginBps), probRaw, openingPrint: OPEN, basis: { centerQE6: Number(centerQE6), sigmaE8: Number(SIGMA), tauSec } };
  };
}

/** Reads whose basis answer and whose pricing basis can differ, with every `previewOpen` call recorded. */
function reads(basisCenterQE6: bigint, chainCenterQE6: bigint, chainTauSec = TAU_SEC) {
  const calls: { band: RangeBand; maxPayoutBase: bigint }[] = [];
  const preview = chainPreview(chainCenterQE6, chainTauSec);
  const r: MoonshotReads = {
    previewBasis: async () => ok({ openingPrint: OPEN, centerQE6: basisCenterQE6, sigmaE8: SIGMA }, 0),
    previewOpen: async (band, maxPayoutBase) => {
      calls.push({ band, maxPayoutBase });
      return ok(preview(band, maxPayoutBase), 0);
    },
  };
  return { reads: r, calls };
}

describe("solveMoonshotQuote", () => {
  it("prices a fixed payout on the solved band with the contract's own figures", async () => {
    const { reads: r, calls } = reads(500_000n, 500_000n);
    const q = await solveMoonshotQuote(r, WINDOW, { direction: "long", multiple: 5 }, { kind: "fixPayout", maxPayoutBase: 20n * ONE }, PARAMS, TAU_SEC, DECIMALS);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    const expected = solveStrike({ direction: "long", multiple: 5, openingPrint: OPEN, centerQE6: 500_000n, sigmaE8: SIGMA, tauSec: TAU_SEC, marginBps: 1_200, one: ONE });
    expect(calls).toHaveLength(1);
    expect(q.value.band.strikePrint).toBe(expected.strikePrint);
    expect(q.value.rangeBand).toEqual({ ...WINDOW, side: "inside", lowPrint: expected.lowPrint, highPrint: OPEN * 4n });
    expect(q.value.quote.maxPayoutBase).toBe(20n * ONE);
    expect(q.value.quote.stakeBase).toBe(3_999_453n);
    expect(q.value.houseLockedBase).toBe(20n * ONE - 3_999_453n);
    expect(q.value.quote.multiplierMilli).toBeGreaterThanOrEqual(5_000);
    expect(q.value.payoutCapBase).toBe(500n * ONE);
    expect(q.value.basis.centerQE6).toBe(500_000);
  });

  it("re-solves once when the contract's basis has moved against the rung", async () => {
    // The book leaned up between the basis read and the price: a LONG strike solved at even odds is now too likely.
    const { reads: r, calls } = reads(500_000n, 620_000n);
    const q = await solveMoonshotQuote(r, WINDOW, { direction: "long", multiple: 10 }, { kind: "fixPayout", maxPayoutBase: 5n * ONE }, PARAMS, TAU_SEC, DECIMALS);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(calls).toHaveLength(2);
    expect(calls[1]!.band.lowPrint).toBeGreaterThan(calls[0]!.band.lowPrint);
    const moved = solveStrike({ direction: "long", multiple: 10, openingPrint: OPEN, centerQE6: 620_000n, sigmaE8: SIGMA, tauSec: TAU_SEC, marginBps: 1_200, one: ONE });
    expect(q.value.band.strikePrint).toBe(moved.strikePrint);
    expect(rungHolds(q.value.quote.probRaw, 10, ONE, 1_200)).toBe(true);
    expect(q.value.quote.stakeBase * 10n).toBeLessThanOrEqual(5n * ONE);
  });

  it("leaves a moved basis alone when the rung still holds there", async () => {
    // The book leaned down: the LONG strike solved at even odds is now less likely, so the multiple is above the rung.
    const { reads: r, calls } = reads(500_000n, 453_500n);
    const q = await solveMoonshotQuote(r, WINDOW, { direction: "long", multiple: 5 }, { kind: "fixPayout", maxPayoutBase: 20n * ONE }, PARAMS, TAU_SEC, DECIMALS);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(calls).toHaveLength(1);
    expect(q.value.quote.multiplierMilli).toBeGreaterThan(5_000);
  });

  it("solves a fixed stake to a payout the contract charges no more than the stake for", async () => {
    const { reads: r } = reads(500_000n, 500_000n);
    const q = await solveMoonshotQuote(r, WINDOW, { direction: "short", multiple: 3 }, { kind: "fixStake", stakeBase: ONE }, PARAMS, TAU_SEC, DECIMALS);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.value.quote.stakeBase).toBeLessThanOrEqual(ONE);
    expect(q.value.quote.maxPayoutBase).toBeGreaterThanOrEqual(3n * q.value.quote.stakeBase);
    expect(q.value.band.lowPrint).toBe(1n);
  });

  it("re-solves a fixed stake from the contract's probability when the basis moved against it", async () => {
    const { reads: r, calls } = reads(500_000n, 620_000n);
    const q = await solveMoonshotQuote(r, WINDOW, { direction: "long", multiple: 2 }, { kind: "fixStake", stakeBase: 5n * ONE }, PARAMS, TAU_SEC, DECIMALS);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(q.value.quote.stakeBase).toBeLessThanOrEqual(5n * ONE);
    expect(q.value.quote.multiplierMilli).toBeGreaterThanOrEqual(1_999);
  });

  it("caps a long rung's payout under the contract's cap, and refuses a fixed payout over it before asking the chain", async () => {
    const { reads: r, calls } = reads(500_000n, 500_000n);
    const stake = await solveMoonshotQuote(r, WINDOW, { direction: "long", multiple: 25 }, { kind: "fixStake", stakeBase: 1_000n * ONE }, PARAMS, TAU_SEC, DECIMALS);
    expect(stake.ok).toBe(true);
    if (!stake.ok) return;
    expect(stake.value.payoutCapBase).toBe(100n * ONE);
    expect(stake.value.quote.maxPayoutBase).toBe(100n * ONE);
    expect(stake.value.quote.stakeBase).toBeLessThan(5n * ONE);

    const before = calls.length;
    const payout = await solveMoonshotQuote(r, WINDOW, { direction: "long", multiple: 25 }, { kind: "fixPayout", maxPayoutBase: 150n * ONE }, PARAMS, TAU_SEC, DECIMALS);
    expect(payout.ok).toBe(false);
    if (payout.ok) return;
    expect(payout.error.errorName).toBe("OverPayoutCap");
    expect(calls).toHaveLength(before);
  });

  it("passes the reserve's refusals through", async () => {
    const refused: MoonshotReads = {
      previewBasis: async () => err(diagnosis("thin-book", "ThinBook(0x, 3000000, 20000000)", { errorName: "ThinBook" })),
      previewOpen: async () => {
        throw new Error("never asked");
      },
    };
    const q = await solveMoonshotQuote(refused, WINDOW, { direction: "long", multiple: 5 }, { kind: "fixPayout", maxPayoutBase: ONE }, PARAMS, TAU_SEC, DECIMALS);
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.error.errorName).toBe("ThinBook");
  });
});
