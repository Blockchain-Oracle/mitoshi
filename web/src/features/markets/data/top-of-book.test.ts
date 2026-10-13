import { describe, expect, it } from "vitest";
import { err, ok, type BookDepth } from "@cwf/core";
import { bpsToOddsCents } from "@cwf/core/units";
import { topOf } from "./useTopOfBook";

const level = (priceBps: number) => ({ priceRaw: BigInt(priceBps) * 100n, priceBps, quantityRaw: 1_000_000n });
const depth = (up: number[], down: number[]): BookDepth => ({ upBids: [], upAsks: up.map(level), downBids: [], downAsks: down.map(level), decimals: 6 });

describe("topOf (D-184): a card's top from the list's reading, as useTopOfBook reads it", () => {
  it("is the best ask on each side in cents", () => {
    const top = topOf(ok(depth([5_240, 5_300], [4_860]), 1));
    expect(top).toEqual({ upCents: bpsToOddsCents(5_240), downCents: bpsToOddsCents(4_860), hydrating: false, failed: false });
  });
  it("an empty side reads nothing, never an even price", () => {
    expect(topOf(ok(depth([], [4_860]), 1))).toEqual({ upCents: null, downCents: bpsToOddsCents(4_860), hydrating: false, failed: false });
  });
  it("before any answer it is hydrating; a failed read shows no price and says it failed, never an empty book", () => {
    expect(topOf(null)).toEqual({ upCents: null, downCents: null, hydrating: true, failed: false });
    expect(topOf(err({ kind: "rpc-down", message: "down" } as never))).toEqual({ upCents: null, downCents: null, hydrating: false, failed: true });
  });
});
