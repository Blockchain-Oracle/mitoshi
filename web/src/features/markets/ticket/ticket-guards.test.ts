import { describe, expect, it } from "vitest";
import { ok, type Quote } from "@cwf/core";
import { commonBlocker, deriveBlocker, type TicketBlockerInput } from "./ticket-guards";

const quote = (over: Partial<Quote> = {}): Quote => ({
  side: "up", stakeBase: 5_000_000n, contractsRaw: 9_000_000n, expectedCostBase: 4_950_000n, maxCostBase: 5_000_000n, limitPriceRaw: 560_000n, avgPriceBps: 5_500,
  oddsCents: 55, payoutIfRightBase: 9_000_000n, fillableStakeBase: 5_000_000n, partial: false, feeBps: 0, decimals: 6, quotedAtMs: 0, ...over,
});
const base: TicketBlockerInput = {
  connected: true, connecting: false, rightChain: true, hasSigner: true, regionHeld: false, phase: "trading", placing: false, side: "up",
  availableBase: 100_000_000n, stakeBase: 5_000_000n, decimals: 6, quote: ok(quote(), 0), quoting: false, quoteStale: false,
};

describe("ticket blockers (the CTA names its blocker, D-045)", () => {
  it("a live quote on a trading Window unblocks the call", () => expect(deriveBlocker(base)).toBeNull());
  it("names the first fixable reason, in order", () => {
    expect(deriveBlocker({ ...base, connected: false })).toBe("disconnected");
    expect(deriveBlocker({ ...base, regionHeld: true })).toBe("region-restricted");
    expect(deriveBlocker({ ...base, placing: true })).toBe("placing");
    expect(deriveBlocker({ ...base, phase: "noEntryBuffer" })).toBe("no-entry-buffer");
    expect(deriveBlocker({ ...base, availableBase: 0n })).toBe("no-funds");
    expect(deriveBlocker({ ...base, stakeBase: 200_000_000n })).toBe("over-balance");
    expect(deriveBlocker({ ...base, quote: ok(null, 0) })).toBe("no-liquidity-at-size");
    expect(deriveBlocker({ ...base, quote: ok(quote({ partial: true }), 0) })).toBe("over-book");
    expect(deriveBlocker({ ...base, quoteStale: true })).toBe("stale-quote");
  });
  it("a Listed Window takes a scheduled call (D-088) only where the caller allows it", () => {
    expect(commonBlocker({ ...base, phase: "upcoming" })).toBe("upcoming");
    expect(commonBlocker({ ...base, phase: "upcoming" }, { upcoming: true })).toBeNull();
  });
});
