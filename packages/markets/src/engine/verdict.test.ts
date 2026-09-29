import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { toMarketId } from "@cwf/core";
import { pinVerdict, type PinInput } from "./verdict";

const ME = "0x00000000000000000000000000000000000000a1" as Address;
const SETTLER = "0x00000000000000000000000000000000000000b2" as Address;
const M = toMarketId(`0x${"cd".repeat(32)}`);
const held = { credit: 0n, yesFree: 2_000n, noFree: 0n, yesLocked: 0n, noLocked: 0n };
const input = (over: Partial<PinInput> = {}): PinInput => ({
  wallet: ME, snapshot: { marketId: M, state: "open", winningOutcome: null, lockAtSec: 1_000, decimals: 6 }, position: held, lotBase: 1000n,
  redeemed: [], costBasisBase: 1_100_000n, settledAtMs: null, nowSec: 900, ...over,
});
const redeemed = (by: Address, total: bigint, heldAsCredit = false) => ({
  marketId: M, holder: ME, by, yesLots: 2_000n, noLots: 0n, payout: total, credit: 0n, total, isPartial: false, heldAsCredit, txHash: `0x${"11".repeat(32)}` as const,
});
const won = { marketId: M, state: "resolved" as const, winningOutcome: 0 as const, lockAtSec: 1_000, decimals: 6 };

describe("the verdict pinned to the user's own position (D-048)", () => {
  it("is the call card while trading and settling after lock; nothing to pin without a position", () => {
    expect(pinVerdict(input())!.phase).toBe("call");
    expect(pinVerdict(input({ nowSec: 1_000 }))!.phase).toBe("settling");
    expect(pinVerdict(input({ position: null }))).toBeNull();
  });

  it("stamps a settled win while the payout is still due, then shows it paid automatically after the settler's redeemFor", () => {
    const due = pinVerdict(input({ snapshot: won, nowSec: 1_100 }))!;
    expect(due).toMatchObject({ phase: "stamped", paidBy: null });
    expect(due.verdict).toMatchObject({ outcome: "win", payoutBase: 2_000_000n, pnlBase: 900_000n });
    // The settler redeemed for the wallet: the engine deleted the position; the card keeps its stamp and legs.
    const auto = pinVerdict(input({ snapshot: won, nowSec: 1_200, position: null, redeemed: [redeemed(SETTLER, 2_000_000n)] }))!;
    expect(auto).toMatchObject({ phase: "paid", paidBy: "auto", paidBase: 2_000_000n });
    expect(auto.verdict).toMatchObject({ outcome: "win", payoutBase: 2_000_000n });
    const self = pinVerdict(input({ snapshot: won, position: null, redeemed: [redeemed(ME, 2_000_000n)] }))!;
    expect(self.paidBy).toBe("self");
  });

  it("never calls a held payout paid: a receive-policy hold is 'held' until the credit leaves", () => {
    const hold = pinVerdict(input({ snapshot: won, position: { ...held, yesFree: 0n, credit: 2_000_000n }, redeemed: [redeemed(SETTLER, 2_000_000n, true)] }))!;
    expect(hold).toMatchObject({ phase: "held", paidBy: null, paidBase: 2_000_000n });
    expect(hold.verdict!.outcome).toBe("win");
    const collected = pinVerdict(input({ snapshot: won, position: null, redeemed: [redeemed(SETTLER, 2_000_000n, true)] }))!;
    expect(collected).toMatchObject({ phase: "paid", paidBy: "self" });
  });

  it("a loss stays a stamp, even after the settler's zero-payout redeem", () => {
    const lost = { ...won, winningOutcome: 1 as const };
    expect(pinVerdict(input({ snapshot: lost }))).toMatchObject({ phase: "stamped", verdict: { outcome: "loss", payoutBase: 0n } });
    expect(pinVerdict(input({ snapshot: lost, position: null, redeemed: [redeemed(SETTLER, 0n)] }))).toMatchObject({ phase: "stamped", verdict: { outcome: "loss" } });
  });

  it("a void pays both held sides at half", () => {
    const v = pinVerdict(input({ snapshot: { ...won, state: "voided", winningOutcome: null }, position: { ...held, noFree: 2_000n } }))!;
    expect(v.verdict).toMatchObject({ outcome: "void", payoutBase: 2_000_000n });
  });
});
