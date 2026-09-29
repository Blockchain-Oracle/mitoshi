// Ported from Masayume 68f7a09:packages/core/src/projection/settle.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import { settleRound, toVerdict } from "./settle";
import type { MarketLedger, RoundMarket } from "./types";

const ONE = 1_000_000n;
const M = toMarketId(`0x${"b2".padStart(64, "0")}`);

const ledger = (overrides: Partial<MarketLedger>): MarketLedger => ({
  marketId: M, heldUpRaw: 10n * ONE, heldDownRaw: 0n, costBase: 4n * ONE, proceedsBase: 0n, sidesTraded: [0], fillCount: 1, shortCount: 0, firstAtMs: 1_000, lastAtMs: 1_000, entryTxHash: "0x1", ...overrides,
});
const market = (overrides: Partial<RoundMarket>): RoundMarket => ({
  marketId: M, asset: "BTC", intervalSec: 300, expirySec: 2_000, decimals: 6, settled: true, voided: false, winningOutcome: 0, resolvedAtMs: 2_001_000, ...overrides,
});

describe("settleRound", () => {
  it("returns null while the Window is open", () => {
    expect(settleRound({ ledger: ledger({}), market: market({ settled: false, winningOutcome: null }), feeBps: 0, liveHoldings: null })).toBeNull();
  });

  it("stamps a win net of the fee, with the fee itself on record, and reads a redeemed leg as paid", () => {
    const round = settleRound({ ledger: ledger({}), market: market({}), feeBps: 100, liveHoldings: { upRaw: 0n, downRaw: 0n } })!;
    expect(round.outcome).toBe("win");
    expect(round.payoutBase).toBe(9_900_000n);
    expect(round.feeBase).toBe(100_000n);
    expect(round.pnlBase).toBe(5_900_000n);
    expect(round.claim).toBe("paid");
  });

  it("keeps a held winning leg as to-collect, and an unreadable balance as unknown, never paid", () => {
    expect(settleRound({ ledger: ledger({}), market: market({}), feeBps: 0, liveHoldings: { upRaw: 10n * ONE, downRaw: 0n } })!.claim).toBe("to-collect");
    expect(settleRound({ ledger: ledger({}), market: market({}), feeBps: 0, liveHoldings: null })!.claim).toBe("unknown");
  });

  it("lists a losing leg at payout 0 with nothing to claim", () => {
    const round = settleRound({ ledger: ledger({}), market: market({ winningOutcome: 1 }), feeBps: 0, liveHoldings: { upRaw: 10n * ONE, downRaw: 0n } })!;
    expect(round.outcome).toBe("loss");
    expect(round.legs).toEqual([{ outcomeIdx: 0, amountRaw: 10n * ONE, payoutBase: 0n }]);
    expect(round.pnlBase).toBe(-4n * ONE);
    expect(round.claim).toBe("none");
  });

  it("pays a void half on both sides, gross, and stamps one net card for a hedge", () => {
    const hedged = ledger({ heldDownRaw: 4n * ONE, costBase: 7n * ONE, sidesTraded: [0, 1] });
    const voided = settleRound({ ledger: hedged, market: market({ voided: true, winningOutcome: null }), feeBps: 500, liveHoldings: null })!;
    expect(voided.outcome).toBe("void");
    expect(voided.payoutBase).toBe(7n * ONE);
    expect(voided.feeBase).toBe(0n);
    const decided = settleRound({ ledger: hedged, market: market({ winningOutcome: 1 }), feeBps: 0, liveHoldings: null })!;
    expect(decided.outcome).toBe("loss");
    expect(decided.legs.map((leg) => leg.payoutBase)).toEqual([0n, 4n * ONE]);
  });

  it("closes a round that sold out before expiry on its realised result alone", () => {
    const closed = settleRound({ ledger: ledger({ heldUpRaw: 0n, proceedsBase: 5n * ONE }), market: market({}), feeBps: 0, liveHoldings: null })!;
    expect(closed.outcome).toBe("closed");
    expect(closed.legs).toEqual([]);
    expect(closed.pnlBase).toBe(1n * ONE);
    expect(closed.claim).toBe("none");
    expect(toVerdict(closed).outcome).toBe("win");
    expect(toVerdict(closed).costBasisBase).toBe(-1n * ONE);
  });
});
