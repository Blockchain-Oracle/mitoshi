import { describe, expect, it } from "vitest";
import { isRuleModel, mainSkip, parseRunnerBeat, ruleCallReason, ruleCallWhy, ruleModelOf } from "./calls";

const rev = { preset: "reversion", lookback: 4, thresholdBps: 5 } as const;
const mom = { preset: "momentum", lookback: 4, thresholdBps: 10 } as const;

describe("a rule's call in words", () => {
  it("says which way the price ran and what the rule bets", () => {
    expect(ruleCallWhy(rev, "ETH", "up", -8)).toBe("ETH fell 0.08% from its opening print; it bets on a pullback.");
    expect(ruleCallWhy(mom, "BTC", "up", 12)).toBe("BTC rose 0.12% from its opening print; it bets the move runs on.");
    expect(ruleCallWhy(rev, null, "down", null)).toBe("The price rose at least 0.05% from its opening print; it bets on a pullback.");
    expect(ruleCallWhy({ preset: "mirror", trader: "0x1ef9d7ec85393f9b68dca8980d266b574cc2ac18", withinSec: 60 }, "BTC", "down", null)).toBe("0x1ef9…ac18 is net DOWN on this Window; it takes the same side.");
    expect(ruleCallReason(rev, { side: "up", moveBps: -8, thresholdBps: 5 })).toBe("0.08% move, past its 0.05% trigger");
    expect(ruleModelOf("reversion")).toBe("rule/reversion");
    expect(isRuleModel("rule/mirror")).toBe(true);
    expect(isRuleModel("anthropic/claude-opus-5-5")).toBe(false);
  });
});

describe("a stored runner beat", () => {
  it("reads only a known shape", () => {
    expect(parseRunnerBeat({ kind: "idle", idle: "no-copier", copiers: 0 })).toEqual({ kind: "idle", idle: "no-copier", copiers: 0 });
    expect(parseRunnerBeat({ kind: "scan", copiers: 1, windows: 1, closestBps: 3, calls: 0, filled: 0, skipped: { budget: 2, nope: 4, book: 0 } })).toEqual({ kind: "scan", copiers: 1, windows: 1, closestBps: 3, calls: 0, filled: 0, skipped: { budget: 2 } });
    expect(parseRunnerBeat({ kind: "idle", idle: "napping", copiers: 0 })).toBeNull();
    expect(parseRunnerBeat({ kind: "scan", copiers: -1 })).toBeNull();
    expect(parseRunnerBeat(null)).toBeNull();
    expect(mainSkip({ budget: 2, book: 1 })).toBe("budget");
    expect(mainSkip({})).toBeNull();
  });
});
