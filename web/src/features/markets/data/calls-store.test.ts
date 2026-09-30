import { describe, expect, it } from "vitest";
import type { Hex, MarketId } from "@cwf/core";
import { withCall, type PlacedCall } from "./calls-store";

const call = (over: Partial<PlacedCall> = {}): PlacedCall => ({
  marketId: `0x${"1".repeat(64)}` as MarketId, asset: "BTC", lane: "crypto24", intervalSec: 300, tradingStartSec: 1_000, expirySec: 1_300, decimals: 6,
  side: "up", contractsRaw: 5_000_000n, costBase: 2_600_000n, txHash: `0x${"a".repeat(64)}` as Hex, placedAtMs: 1_100_000, ...over,
});

describe("pinned calls (D-048: the verdict pins to the user's position)", () => {
  it("keeps a call on screen after the hero moves on — only the user or six hours after close remove it", () => {
    const list = withCall([], call(), 1_100_000);
    expect(list).toHaveLength(1);
    expect(withCall(list, call({ marketId: `0x${"2".repeat(64)}` as MarketId }), 1_300_000 + 6 * 3600_000 - 1)).toHaveLength(2);
    expect(withCall(list, call({ marketId: `0x${"2".repeat(64)}` as MarketId, expirySec: 99_999 }), 1_300_000 + 6 * 3600_000 + 1)).toHaveLength(1);
  });

  it("a second fill on the same side adds to the call instead of a second card", () => {
    const list = withCall(withCall([], call(), 1_100_000), call({ contractsRaw: 1_000_000n, costBase: 500_000n, placedAtMs: 1_200_000 }), 1_200_000);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ contractsRaw: 6_000_000n, costBase: 3_100_000n, placedAtMs: 1_100_000 });
  });
});
