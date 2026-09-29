// Ported from Masayume 68f7a09:packages/core/src/claims/payout.test.ts
import { describe, expect, it } from "vitest";
import { enumerateClaimables, type SettledMarket } from "./enumerate";
import { estPayoutBase } from "./payout";

const market: SettledMarket = {
  marketId: `0x${"1".padStart(64, "0")}` as SettledMarket["marketId"],
  asset: "BTC",
  intervalSec: 300,
  expirySec: 1_000,
  decimals: 6,
  state: "resolved",
  winningOutcome: 0,
  resolvedAtMs: null,
};

describe("estPayoutBase", () => {
  it("pays a win net of the settlement fee", () => {
    expect(estPayoutBase(1_000_000n, "win", 0)).toBe(1_000_000n);
    expect(estPayoutBase(1_000_000n, "win", 250)).toBe(975_000n);
  });

  it("pays a void at half, gross — no fee is skimmed on a void", () => {
    expect(estPayoutBase(1_000_000n, "void", 250)).toBe(500_000n);
  });
});

describe("enumerateClaimables", () => {
  it("never rows a losing side and rows a void once with both legs", () => {
    const loss = enumerateClaimables([{ market, holdings: { upRaw: 0n, downRaw: 5n }, feeBps: 0 }]);
    expect(loss).toEqual([]);

    const voided = enumerateClaimables([{ market: { ...market, state: "voided", winningOutcome: null }, holdings: { upRaw: 4n, downRaw: 2n }, feeBps: 250 }]);
    expect(voided).toHaveLength(1);
    expect(voided[0]?.legs.map((leg) => leg.payoutBase)).toEqual([2n, 1n]);
    expect(voided[0]?.netPayoutBase).toBe(3n);
  });
});
