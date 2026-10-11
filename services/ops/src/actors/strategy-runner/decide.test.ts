import { describe, expect, it } from "vitest";
import type { RunnerWindow } from "@cwf/markets/ops";
import { scanOracleFollow } from "./decide";

const w = (symbol: string, openE8: bigint, index = 1n): RunnerWindow => ({
  marketId: `0x${index.toString(16).padStart(64, "0")}`, seriesId: `0x${"7c".repeat(32)}`, index, spotSymbol: symbol, cadenceSec: 300, tradingStartSec: 0, lockAtSec: 300, expirySec: 300, openPriceE8: openE8,
  grid: { lotBase: 1_000n, tickBase: 1_000n, cashUnit: 1n, minLots: 1n, decimals: 6 },
});
const OPEN = 6_000_000_000_000n; // $60,000.00000000

describe("scanOracleFollow (the house model on Tempo Windows)", () => {
  it("momentum follows a move past the threshold from the opening print; reversion bets against it", () => {
    const up25 = () => ({ priceE8: (OPEN * 10_025n) / 10_000n });
    const momentum = scanOracleFollow([w("BTC", OPEN)], { preset: "momentum", lookback: 6, thresholdBps: 20 }, up25);
    expect(momentum.candidates.map((c) => [c.decision.side, c.decision.moveBps])).toEqual([["up", 25]]);
    const reversion = scanOracleFollow([w("BTC", OPEN)], { preset: "reversion", lookback: 4, thresholdBps: 20 }, up25);
    expect(reversion.candidates.map((c) => c.decision.side)).toEqual(["down"]);
  });

  it("sits out inside the threshold and says how far the trigger is", () => {
    const s = scanOracleFollow([w("BTC", OPEN)], { preset: "momentum", lookback: 6, thresholdBps: 20 }, () => ({ priceE8: (OPEN * 10_003n) / 10_000n }));
    expect(s.candidates).toEqual([]);
    expect(s.closestBps).toBe(17);
    expect(s.why).toBe("scanned 1 Window, closest trigger 17 bps away");
  });

  it("skips a Window with no fresh price rather than guessing one", () => {
    const s = scanOracleFollow([w("BTC", OPEN), w("ETH", OPEN, 2n)], { preset: "momentum", lookback: 6, thresholdBps: 20 }, (sym) => (sym === "BTC" ? { priceE8: OPEN } : null));
    expect(s.why).toContain("1 skipped (ETH #2: no fresh price)");
  });
});
