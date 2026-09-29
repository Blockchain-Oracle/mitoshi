// Ported from Masayume 68f7a09:packages/core/src/sizing/cost-cap.test.ts
import { describe, expect, it } from "vitest";
import { bufferToSlippageBps, costCapBufferBps } from "./cost-cap";

describe("costCapBufferBps", () => {
  it("interpolates 1.6× at 60s to 1.1× at 3600s and clamps outside", () => {
    expect(costCapBufferBps(30)).toBe(16_000);
    expect(costCapBufferBps(60)).toBe(16_000);
    expect(costCapBufferBps(1830)).toBe(13_500);
    expect(costCapBufferBps(3600)).toBe(11_000);
    expect(costCapBufferBps(86_400)).toBe(11_000);
  });

  it("converts to the SDK's slippage vocabulary", () => {
    expect(bufferToSlippageBps(16_000)).toBe(6_000);
    expect(bufferToSlippageBps(11_000)).toBe(1_000);
  });
});
