import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { exitForCall, exitLimitOwnTicks, lotsAtOrAbove } from "./exits";

const ONE = 1_000_000n;
const TICK = 1_000n;
const VAULT = "0x6f05b0dcaa31c241a4f6e8ceb170090b41679e95";

/** The vault's own check (`VenueGateway._sidePrice` against `exitFloorRaw`) for the price `exitFor` sends. */
function sidePriceSent(side: "up" | "down", ownTicks: number): bigint {
  const { args } = decodeFunctionData({ abi: eventVaultV2Abi, data: exitForCall(VAULT, { grantId: 3n, marketId: `0x${"ab".repeat(32)}`, side, ownTicks, tickBase: TICK, quantityRaw: 2_000_000n, expireNs: 1n, proof: "0x" }).data });
  const [, , outcomeIdx, priceRaw] = args as unknown as readonly [bigint, string, number, bigint];
  return outcomeIdx === 0 ? priceRaw : ONE - priceRaw;
}

describe("the exit keeper's limit", () => {
  it("rounds the floor up onto the grid, so the vault never sees a sale under its floor — on either side", () => {
    for (const floor of [612_345n, 612_000n, 1n, 998_001n]) {
      const own = exitLimitOwnTicks(floor, TICK)!;
      for (const side of ["up", "down"] as const) {
        const sent = sidePriceSent(side, own);
        expect(sent).toBeGreaterThanOrEqual(floor);
        expect(sent - floor).toBeLessThan(TICK);
      }
    }
    expect(exitLimitOwnTicks(612_345n, TICK)).toBe(613);
    expect(exitLimitOwnTicks(0n, TICK)).toBe(1);
    expect(exitLimitOwnTicks(999_001n, TICK)).toBeNull();
  });

  it("counts only the depth at or above the limit, in the side's own terms", () => {
    const book = { bids: [[620, 5n], [610, 7n]] as const, asks: [[380, 4n], [390, 6n]] as const };
    expect(lotsAtOrAbove(book as never, "up", 613)).toBe(5n);
    expect(lotsAtOrAbove(book as never, "up", 600)).toBe(12n);
    // Down sells NO into the YES asks: 1000 − 380 = 620, 1000 − 390 = 610.
    expect(lotsAtOrAbove(book as never, "down", 613)).toBe(4n);
    expect(lotsAtOrAbove(book as never, "down", 621)).toBe(0n);
  });
});
