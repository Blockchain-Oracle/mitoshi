import { describe, expect, it } from "vitest";
import { gateOf, gateWords, whyOf } from "./gate-words";

const read = (over: Partial<Parameters<typeof whyOf>[0]>) => ({ model: "anthropic/claude-opus-5-5", verdictSide: "down" as const, why: "No book confirmation.", gate: "held" as const, gateReason: "", ...over });

describe("the gate's ruling in words", () => {
  it("never shows the raw line; the model's reason is the quote, said once", () => {
    expect(gateWords("agent bets down (0.76): fading the spike", "trade")).toBe("Down, 76% sure");
    expect(gateWords("confidence 0.55 under the guarded floor 0.60: thin move", "held")).toBe("Held — 55% sure, under its 60% floor");
    expect(gateWords("agent held: no book confirmation", "held")).toBe("Held by the model");
    expect(gateWords("model unavailable: timeout — no answer in 20000 ms", "failed")).toBe("No answer — the model timed out");
    expect(gateWords("something older", "held")).toBe("Held");
    expect(whyOf(read({}))).toBe("“No book confirmation.”");
    // A failed read's `why` is the error: never quoted as the model's words.
    expect(whyOf(read({ verdictSide: "none", why: "upstream: 529 overloaded", gate: "failed", gateReason: "model unavailable: upstream — 529" }))).toBeNull();
    expect(gateOf(read({ model: "rule/reversion", gate: "trade", gateReason: "0.08% move, past its 0.05% trigger" }))).toBe("0.08% move, past its 0.05% trigger");
  });
});
