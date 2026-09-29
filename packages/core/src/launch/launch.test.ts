import { describe, expect, it } from "vitest";
import vectors from "./vectors.json";
import { graduationProgressBps, isWellFormedSymbol, STABLECOIN_CURRENCY, typedConfirmMatches } from "./index";

describe("launch guards", () => {
  it("accepts only well-formed symbols", () => {
    for (const [symbol, ok] of Object.entries(vectors.symbols)) expect(isWellFormedSymbol(symbol)).toBe(ok);
  });
  it.each(vectors.progress)("progress $reserve / $threshold = $bps bps", (v) => {
    expect(graduationProgressBps(BigInt(v.reserve), BigInt(v.threshold))).toBe(v.bps);
  });
  it("needs the exact typed currency code", () => {
    expect(typedConfirmMatches(" USD ", STABLECOIN_CURRENCY)).toBe(true);
    expect(typedConfirmMatches("usd", STABLECOIN_CURRENCY)).toBe(false);
  });
});
