import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import venueSpec from "@cwf/core/venue-spec.json" with { type: "json" };
import { decidePosition, type BookMark } from "./decide";
import { spotProofOf } from "./spot-proof";

const P = { positionId: 7n, marketId: "0xabc" as const, quantityRaw: 32_000_000n };
const healthy: BookMark = { markRaw: 18_559_999n, filledRaw: 32_000_000n, lineRaw: 12_000_000n, knockable: false };
const under: BookMark = { markRaw: 11_199_999n, filledRaw: 32_000_000n, lineRaw: 12_000_000n, knockable: true };

describe("leverage keeper decisions", () => {
  it("settles a decided Window whatever the book says", () => {
    expect(decidePosition(P, true, under, null).kind).toBe("settle");
    expect(decidePosition(P, true, null, null).kind).toBe("settle");
  });

  it("holds while rested depth marks the position over the line", () => {
    const a = decidePosition(P, false, healthy, null);
    expect(a.kind).toBe("hold");
    expect(a.kind === "hold" && a.needsSpot).toBe(false);
  });

  it("asks for a spot before a knock-out, and knocks out only when the model agrees (PD-2)", () => {
    const needs = decidePosition(P, false, under, null);
    expect(needs.kind === "hold" && needs.needsSpot).toBe(true);
    const refused = decidePosition(P, false, under, { fairMarkRaw: 18_900_000n, knockable: false });
    expect(refused.kind).toBe("hold");
    expect(refused.why).toMatch(/PD-2/);
    expect(decidePosition(P, false, under, { fairMarkRaw: 1_100_000n, knockable: true }).kind).toBe("knock-out");
  });

  it("never knocks out a position rested depth cannot take whole (D-114)", () => {
    const thin = { markRaw: 6_000_000n, filledRaw: 20_000_000n, lineRaw: 12_000_000n, knockable: false };
    const a = decidePosition(P, false, thin, { fairMarkRaw: 1n, knockable: true });
    expect(a.kind).toBe("hold");
    expect(a.why).toMatch(/D-114/);
    expect(decidePosition(P, false, null, null).why).toBe("mark unreadable");
  });
});

describe("spot proof from a real RedStone latest response", () => {
  const text = readFileSync(join(import.meta.dirname, "../reference-writer/fixtures/redstone-latest-1790666930.json"), "utf8");
  const signers = new Set(venueSpec.redstone.signers.map((s) => s.toLowerCase()));

  it("builds the verifier payload at the timestamp most configured signers share", () => {
    const proof = spotProofOf(text, "TSLA", signers, venueSpec.redstone.threshold);
    expect(proof).not.toBeNull();
    expect(proof!.signers).toBeGreaterThanOrEqual(3);
    // 142 bytes a package + 14 bytes of trailer, hex-encoded.
    expect((proof!.payload.length - 2) / 2).toBe(142 * proof!.signers + 14);
    expect(proof!.payload.endsWith("000002ed57011e0000")).toBe(true);
    expect(proof!.medianE8).toBeGreaterThan(0n);
  });

  it("refuses a feed with too few configured signers, or one it does not carry", () => {
    expect(spotProofOf(text, "TSLA", new Set(), 3)).toBeNull();
    expect(spotProofOf(text, "NOPE", signers, 3)).toBeNull();
  });
});
