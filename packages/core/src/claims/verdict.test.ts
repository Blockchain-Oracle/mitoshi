// Ported from Masayume 68f7a09:packages/core/src/claims/verdict.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import { deriveVerdict, type VerdictInput } from "./verdict";

const ONE = 1_000_000n;
const marketId = toMarketId(`0x${"1".padStart(64, "0")}`);

const base = (overrides: Partial<VerdictInput>): VerdictInput => ({
  marketId,
  settlement: { state: "resolved", winningOutcome: 0 },
  holdings: { upRaw: 10n * ONE, downRaw: 0n },
  feeBps: 0,
  decimals: 6,
  costBasisBase: 5n * ONE,
  settledAtMs: null,
  ...overrides,
});

describe("deriveVerdict", () => {
  it("stamps a win with payout net of the fee against the cost basis", () => {
    const verdict = deriveVerdict(base({ feeBps: 100 }));
    expect(verdict?.outcome).toBe("win");
    expect(verdict?.payoutBase).toBe(9_900_000n);
    expect(verdict?.pnlBase).toBe(4_900_000n);
  });

  it("stamps one net card when both sides were held, listing both legs", () => {
    const verdict = deriveVerdict(base({ holdings: { upRaw: 4n * ONE, downRaw: 10n * ONE }, costBasisBase: 7n * ONE }));
    expect(verdict?.outcome).toBe("loss");
    expect(verdict?.legs.map((leg) => [leg.outcomeIdx, leg.payoutBase])).toEqual([
      [0, 4n * ONE],
      [1, 0n],
    ]);
    expect(verdict?.pnlBase).toBe(-3n * ONE);
  });

  it("pays a void gross at half on both sides and never stamps an unsettled or empty window", () => {
    const voided = deriveVerdict(base({ settlement: { state: "voided", winningOutcome: null }, holdings: { upRaw: 10n * ONE, downRaw: 2n * ONE }, feeBps: 500 }));
    expect(voided?.outcome).toBe("void");
    expect(voided?.payoutBase).toBe(6n * ONE);
    expect(deriveVerdict(base({ settlement: { state: "open", winningOutcome: null } }))).toBeNull();
    expect(deriveVerdict(base({ holdings: { upRaw: 0n, downRaw: 0n } }))).toBeNull();
  });
});
