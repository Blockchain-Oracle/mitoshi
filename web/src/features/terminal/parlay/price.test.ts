import { CALENDAR_YEAR_SEC, sigmaE8FromBps } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { bandChanceE6, legChanceE6, markParlayBase, markRangeBase, printToE8 } from "./price";

const $ = (d: number) => BigInt(Math.round(d * 1e6));
const OPEN = 62_000n * 100_000_000n;
const SIGMA = sigmaE8FromBps(5_000, CALENDAR_YEAR_SEC);

describe("an open parlay at fair value (D-227, Owarine `markParlay`)", () => {
  it("is the payout times every open leg's chance: $10 paying $40, legs at 50 % and 40 % → $8.00", () => {
    const legs = [{ status: "pending", chanceE6: 500_000n, entryChanceE6: 0n }, { status: "pending", chanceE6: 400_000n, entryChanceE6: 0n }] as const;
    expect(markParlayBase(legs, $(10), $(40))).toBe($(8));
  });
  it("counts a landed leg as certain, falls back to the entry price, and voids or loses as a whole", () => {
    expect(markParlayBase([{ status: "won", chanceE6: null, entryChanceE6: 300_000n }, { status: "pending", chanceE6: null, entryChanceE6: 250_000n }], $(10), $(40))).toBe($(10));
    expect(markParlayBase([{ status: "void", chanceE6: null, entryChanceE6: 0n }, { status: "pending", chanceE6: 900_000n, entryChanceE6: 0n }], $(10), $(40))).toBe($(10));
    expect(markParlayBase([{ status: "lost", chanceE6: null, entryChanceE6: 0n }, { status: "pending", chanceE6: 900_000n, entryChanceE6: 0n }], $(10), $(40))).toBe(0n);
  });
});

describe("a leg's and a band's chance on the fair model", () => {
  it("is a half at the line, and the two sides sum to one", () => {
    const up = legChanceE6("up", OPEN, OPEN, SIGMA, 300)!;
    expect(up).toBe(500_000n);
    const above = OPEN + 5_000_000_000n;
    expect(legChanceE6("down", above, OPEN, SIGMA, 300)! + legChanceE6("up", above, OPEN, SIGMA, 300)!).toBe(1_000_000n);
    expect(legChanceE6("up", null, OPEN, SIGMA, 300)).toBeNull();
    expect(legChanceE6("up", OPEN, OPEN, 0n, 300)).toBeNull();
  });
  it("puts a band around the spot inside more often than not, and outside is the rest", () => {
    const inside = bandChanceE6(OPEN, OPEN - 10_000_000_000n, OPEN + 10_000_000_000n, SIGMA, 300, "inside")!;
    expect(inside > 500_000n).toBe(true);
    expect(bandChanceE6(OPEN, OPEN - 10_000_000_000n, OPEN + 10_000_000_000n, SIGMA, 300, "outside")).toBe(1_000_000n - inside);
    // $5 paying $12.50 at a 40 % band: $5.00.
    expect(markRangeBase(400_000n, 0n, $(12.5))).toBe($(5));
    expect(markRangeBase(null, 250_000n, $(12.5))).toBe(3_125_000n);
    expect(printToE8(6_200_000n)).toBe(OPEN);
  });
});
