import { describe, expect, it } from "vitest";
import { decideQuote, needsQuote } from "./decide";

const base = { bestBidTicks: 0, bestAskTicks: 0, halfSpreadTicks: 15, minSpreadTicks: 20, minTicks: 50, maxTicks: 950 };

describe("decideQuote", () => {
  it("rests a half spread either side of the model on an empty book", () => {
    expect(decideQuote({ ...base, fairUpE6: 431_600n })).toEqual({ kind: "quote", bidTicks: 417, askTicks: 447, midTicks: 432 });
  });

  it("never crosses what already rests (PostOnly)", () => {
    expect(decideQuote({ ...base, fairUpE6: 500_000n, bestBidTicks: 505, bestAskTicks: 520 })).toEqual({ kind: "quote", bidTicks: 485, askTicks: 515, midTicks: 500 });
    expect(decideQuote({ ...base, fairUpE6: 500_000n, bestBidTicks: 470, bestAskTicks: 490 })).toEqual({ kind: "quote", bidTicks: 485, askTicks: 515, midTicks: 500 });
    // The house's ask under the model's bid: the bid steps under it, still ≥ the floor apart.
    expect(decideQuote({ ...base, fairUpE6: 500_000n, bestAskTicks: 480 })).toEqual({ kind: "quote", bidTicks: 479, askTicks: 515, midTicks: 500 });
  });

  it("keeps inside the vault's band and refuses under its spread floor", () => {
    // Near the band's edge the bid is held at the floor; past it the bid would pay more than the model: no quote.
    expect(decideQuote({ ...base, fairUpE6: 60_000n })).toEqual({ kind: "quote", bidTicks: 50, askTicks: 75, midTicks: 60 });
    expect(decideQuote({ ...base, fairUpE6: 30_000n }).kind).toBe("skip");
    expect(decideQuote({ ...base, fairUpE6: 990_000n }).kind).toBe("skip");
    // Near the top of the band the ask is held at 950: 933 / 950 is under the 20-tick floor.
    expect(decideQuote({ ...base, fairUpE6: 948_000n })).toEqual({ kind: "skip", why: "spread 17 under the vault's floor 20" });
  });
});

describe("needsQuote", () => {
  it("quotes a new Window, requotes on a move or with age, and leaves a quiet one alone", () => {
    expect(needsQuote(undefined, 500, 1_000, 30, 120)).toBe(true);
    expect(needsQuote({ midTicks: 500, atSec: 1_000 }, 520, 1_050, 30, 120)).toBe(false);
    expect(needsQuote({ midTicks: 500, atSec: 1_000 }, 531, 1_050, 30, 120)).toBe(true);
    expect(needsQuote({ midTicks: 500, atSec: 1_000 }, 500, 1_120, 30, 120)).toBe(true);
  });
});
