import { describe, expect, it } from "vitest";
import { PAYOUT_DENOMINATOR, rateDay, ratingEvidence, utcDayLabel } from "./rating";

const win = { txHash: "0x01", cashDeltaBase: 600_000n, tokenDeltaRaw: 1_000_000n, payoutNumerator: PAYOUT_DENOMINATOR };
const loss = { txHash: "0x02", cashDeltaBase: 400_000n, tokenDeltaRaw: 1_000_000n, payoutNumerator: 0n };
const voided = { txHash: "0x03", cashDeltaBase: 500_000n, tokenDeltaRaw: 1_000_000n, payoutNumerator: PAYOUT_DENOMINATOR / 2n };

describe("the agent rater's day score", () => {
  it("is the return on stake of the day's settled calls, in hundredths of a percent", () => {
    // Staked $1.00; won $1.00 back on the first ($0.60 cost), nothing on the second: net 0.
    expect(rateDay("2026-10-11", [win, loss])).toEqual({ day: "2026-10-11", settled: 2, stakedBase: 1_000_000n, netBase: 0n, valueCentiPct: 0n });
    expect(rateDay("2026-10-11", [win]).valueCentiPct).toBe(6_666n); // +66.66%
    expect(rateDay("2026-10-11", [loss]).valueCentiPct).toBe(-10_000n); // −100.00%
    expect(rateDay("2026-10-11", [voided]).netBase).toBe(0n);
    expect(rateDay("2026-10-11", []).valueCentiPct).toBeNull();
  });

  it("labels days in UTC and writes evidence anyone can recompute", () => {
    expect(utcDayLabel(1_791_763_199)).toBe("2026-10-11");
    const ev = JSON.parse(ratingEvidence({ agentId: 7n, strategyId: "1", rating: rateDay("2026-10-11", [win, loss]), fills: [win, loss] }));
    expect(ev).toMatchObject({ kind: "mitoshi-agent-day", agentId: "7", day: "2026-10-11", settled: 2, netBase: "0", fills: ["0x01", "0x02"] });
  });
});
