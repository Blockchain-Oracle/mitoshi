import { describe, expect, it } from "vitest";
import type { LeveragePosition } from "../leverage/types";
import { toMarketId } from "../types/market";
import type { VaultBet } from "../vault/types";
import { boostRound, mergeRounds, vaultRound } from "./account";

const ONE = 1_000_000n;
const M = toMarketId(`0x${"b2".padStart(64, "0")}`);
const bet = (o: Partial<VaultBet>): VaultBet => ({
  vault: "0x0000000000000000000000000000000000000001", marketId: M, asset: "BTC", intervalSec: 300, expirySec: 2_000, lockAtSec: 1_990, decimals: 6, state: "open",
  winningOutcome: null, resolvedAtMs: null, upRaw: 0n, downRaw: 0n, costBase: 0n, proceedsBase: 0n, payoutBase: 0n, boughtUpRaw: 0n, boughtDownRaw: 0n, soldUpRaw: 0n, soldDownRaw: 0n,
  costUpBase: 0n, costDownBase: 0n, settledAtSec: 0, lastAtSec: 1_500, firstAtSec: 1_400, ...o,
});
const boost = (o: Partial<LeveragePosition>): LeveragePosition => ({
  positionId: 7n, owner: "0x0000000000000000000000000000000000000002", status: "closed", side: "up", leverageBps: 30_000, marketId: M, openedAtSec: 1_000, expirySec: 2_000, exitedAtSec: 1_800,
  quantityRaw: 0n, stakeBase: 1n * ONE, frontedBase: 0n, premiumBase: 0n, entryPriceRaw: 500_000n, proceedsBase: 0n, reclaimedBase: 0n, returnedBase: 0n, ...o,
});
const W = { asset: "BTC", intervalSec: 300, decimals: 6, voided: false, winningOutcome: null, resolvedAtMs: null } as const;

describe("one account history (D-227)", () => {
  it("leaves an open Trading Balance Window out while it holds, and counts it sold out: $5 in, $6 back = +$1", () => {
    expect(vaultRound(bet({ costBase: 5n * ONE, boughtUpRaw: 10n * ONE, upRaw: 10n * ONE }), 1_600)).toBeNull();
    const r = vaultRound(bet({ costBase: 5n * ONE, proceedsBase: 6n * ONE, boughtUpRaw: 10n * ONE, soldUpRaw: 10n * ONE }), 1_600)!;
    expect(r).toMatchObject({ source: "vault", outcome: "closed", stakeBase: 5n * ONE, pnlBase: 1n * ONE, settledAtMs: 1_500_000, sidesTraded: [0] });
  });

  it("settles a Trading Balance Window on what it held at the close: 10 Up for $4, 4 sold for $2, Up wins → 6 + 2 − 4 = +$4", () => {
    const won = vaultRound(bet({ state: "resolved", winningOutcome: 0, resolvedAtMs: 2_010_000, costBase: 4n * ONE, proceedsBase: 2n * ONE, boughtUpRaw: 10n * ONE, soldUpRaw: 4n * ONE, settledAtSec: 2_020, payoutBase: 6n * ONE }), 2_100)!;
    expect(won).toMatchObject({ outcome: "win", payoutBase: 6n * ONE, pnlBase: 4n * ONE, claim: "paid", settledAtMs: 2_010_000 });
    const lost = vaultRound(bet({ state: "resolved", winningOutcome: 1, costBase: 4n * ONE, boughtUpRaw: 10n * ONE }), 2_100)!;
    expect(lost).toMatchObject({ outcome: "loss", payoutBase: 0n, pnlBase: -4n * ONE, settledAtMs: 2_000_000 });
    // Void: half a dollar a contract back — 10 × 50¢ = $5 on $4.
    const voided = vaultRound(bet({ state: "voided", costBase: 4n * ONE, boughtUpRaw: 10n * ONE }), 2_100)!;
    expect(voided).toMatchObject({ outcome: "void", payoutBase: 5n * ONE, pnlBase: 1n * ONE, claim: "to-collect" });
  });

  it("books a Boost once it is no longer live: returned − stake, its outcome from its status", () => {
    expect(boostRound(boost({ status: "live" }), W)).toBeNull();
    expect(boostRound(boost({ status: "closed", returnedBase: 1_400_000n }), W)).toMatchObject({ source: "boost", outcome: "closed", pnlBase: 400_000n, stakeBase: 1n * ONE, settledAtMs: 1_800_000 });
    expect(boostRound(boost({ status: "knocked-out", returnedBase: 100_000n }), W)).toMatchObject({ outcome: "loss", pnlBase: -900_000n });
    expect(boostRound(boost({ status: "settled", returnedBase: 6n * ONE }), { ...W, winningOutcome: 0 })).toMatchObject({ outcome: "win", payoutBase: 6n * ONE, pnlBase: 5n * ONE });
    expect(boostRound(boost({ status: "settled", returnedBase: 0n }), { ...W, winningOutcome: 1 })).toMatchObject({ outcome: "loss", pnlBase: -1n * ONE });
    expect(boostRound(boost({ status: "settled", returnedBase: 200_000n, exitedAtSec: null }), { ...W, voided: true, resolvedAtMs: 2_005_000 })).toMatchObject({ outcome: "void", pnlBase: -800_000n, settledAtMs: 2_005_000 });
  });

  it("merges every source newest first", () => {
    const a = boostRound(boost({ status: "closed", exitedAtSec: 1_700 }), W)!;
    const b = vaultRound(bet({ costBase: 1n * ONE, proceedsBase: 1n * ONE, boughtUpRaw: 2n * ONE, soldUpRaw: 2n * ONE, lastAtSec: 1_900 }), 1_950)!;
    const c = boostRound(boost({ status: "closed", exitedAtSec: 1_800 }), W)!;
    expect(mergeRounds([a], [b, c]).map((r) => r.settledAtMs)).toEqual([1_900_000, 1_800_000, 1_700_000]);
  });
});
