import { describe, expect, it } from "vitest";
import { pausedWords } from "./lane-note";

describe("the roller's reason on the Window chip", () => {
  it("names a corporate action, a halt and a missing source; anything else is not paused", () => {
    expect(pausedWords("paused: corporate action (TSLA multiplier 1 → 3 (Robinhood ERC-8056))")).toBe("paused: corporate action — TSLA multiplier 1 → 3 (Robinhood ERC-8056)");
    expect(pausedWords("paused: halted (exchange-halt)")).toBe("paused: trading halted");
    expect(pausedWords("paused: halted (redstone-stale)")).toBe("paused: signed price stale");
    expect(pausedWords("paused: no signed source (no RedStone 24/7 feed)")).toBe("paused: no signed price source");
    expect(pausedWords("closed: no session")).toBeNull();
    expect(pausedWords("open #22 → 1791653400")).toBeNull();
    expect(pausedWords(null)).toBeNull();
  });
});
