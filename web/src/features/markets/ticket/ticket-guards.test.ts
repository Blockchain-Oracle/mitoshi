import { describe, expect, it } from "vitest";
import { ok, type Quote } from "@cwf/core";
import { blockerLabel } from "@cwf/core/copy";
import { commonBlocker, deriveBlocker, laneBlocker, type LaneGuardInput, type TicketBlockerInput } from "./ticket-guards";

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

describe("session and lane blockers (S6, Agari's laneBlocker)", () => {
  const lane = (over: Partial<LaneGuardInput> = {}): LaneGuardInput => ({ basis: "regular", sessionOpen: true, halt: null, laneState: "open #22", ...over });
  const halt = { reason: "exchange-halt" as const, sinceSec: 1 };
  it("a halt holds a Window open to calls, before the generic phase word", () => {
    expect(deriveBlocker({ ...base, lane: lane({ halt }) })).toBe("halted");
    expect(laneBlocker("upcoming", lane({ halt }))).toBe("halted");
    expect(laneBlocker("locked", lane({ halt }))).toBeNull();
    expect(blockerLabel("halted", { haltStale: false })).toBe("Trading halted — no new calls");
    expect(blockerLabel("halted", { haltStale: true })).toBe("Signed price stale — no new calls");
  });
  it("a paused lane holds a Window waiting on its open; a corporate action is named as such", () => {
    expect(laneBlocker("upcoming", lane({ laneState: "paused: corporate action (TSLA split 2026-10-12)" }))).toBe("corporate-action");
    expect(laneBlocker("pendingOpeningPrint", lane({ laneState: "paused: no signed source (no RedStone 24/7 feed)" }))).toBe("lane-paused");
    expect(laneBlocker("trading", lane({ laneState: "paused: no signed source" }))).toBeNull();
  });
  it("a settled Regular Window outside the session says when the market opens", () => {
    expect(laneBlocker("finalized", lane({ sessionOpen: false }))).toBe("session-closed");
    expect(laneBlocker("finalized", lane({ basis: "stock24", sessionOpen: false }))).toBeNull();
    expect(laneBlocker("finalized", lane({ sessionOpen: null }))).toBeNull();
    expect(blockerLabel("session-closed", { opensText: "Mon 14:30 (09:30 ET)" })).toBe("Market closed — opens Mon 14:30 (09:30 ET)");
  });
  it("without session facts nothing is claimed", () => {
    expect(deriveBlocker({ ...base, lane: null })).toBeNull();
    expect(laneBlocker("trading", undefined)).toBeNull();
  });
});
