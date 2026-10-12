import { describe, expect, it } from "vitest";
import { exitCaption, exitError, modeText, priceText, targetFromMode, targetFromPrice, type ExitCtx } from "./exits-form";

// A linear stand-in for the fair model: $1 of exit value per $10 of spot above 62,000 from a $5 anchor.
const valueAt = (spot: number) => BigInt(Math.round((5 + (spot - 62_000) / 10) * 1e6));
const spotAt = (base: bigint) => 62_000 + (Number(base) / 1e6 - 5) * 10;
const ctx: ExitCtx = { costBase: 5_000_000n, maxBase: 10_000_000n, nowBase: 5_000_000n, refSpot: 62_000, valueAt, spotAt };

describe("the TP/SL drawer's linked inputs (RV-51, D-200)", () => {
  it("reads every mode as an exit-value target", () => {
    expect(targetFromMode("roi", "25", ctx)).toBe(6_250_000n);
    expect(targetFromMode("roi", "−50%", ctx)).toBe(2_500_000n);
    expect(targetFromMode("pnl", "+$1.50", ctx)).toBe(6_500_000n);
    expect(targetFromMode("pnl", "-2", ctx)).toBe(3_000_000n);
    expect(targetFromMode("change", "0.1", ctx)).toBe(valueAt(62_062));
    expect(targetFromPrice("62,020", ctx)).toBe(7_000_000n);
  });

  it("gives nothing for text that doesn't parse, or a Change % without a reference spot", () => {
    expect(targetFromMode("roi", "abc", ctx)).toBeNull();
    expect(targetFromMode("pnl", "", ctx)).toBeNull();
    expect(targetFromMode("change", "1", { ...ctx, refSpot: null })).toBeNull();
    expect(targetFromPrice("0", ctx)).toBeNull();
  });

  it("shows the same target in every mode", () => {
    expect(modeText("roi", 6_250_000n, ctx)).toBe("25.0");
    expect(modeText("pnl", 3_000_000n, ctx)).toBe("-2.00");
    expect(modeText("change", valueAt(62_062), ctx)).toBe("0.10");
    expect(priceText(7_000_000n, ctx)).toBe("62020.00");
    expect(modeText("roi", null, ctx)).toBe("");
  });

  it("validates in exit-value terms, as Tradash does in price terms", () => {
    expect(exitError("tp", null, false, ctx)).toBeNull();
    expect(exitError("tp", null, true, ctx)).toMatch(/trigger price/);
    expect(exitError("tp", 4_000_000n, false, ctx)).toMatch(/above what you staked/);
    expect(exitError("tp", 11_000_000n, false, ctx)).toMatch(/unreachable/);
    expect(exitError("tp", 6_000_000n, false, { ...ctx, nowBase: 6_100_000n })).toMatch(/already been passed/);
    expect(exitError("sl", 6_000_000n, false, ctx)).toMatch(/below what you staked/);
    expect(exitError("sl", 0n, false, ctx)).toMatch(/above \$0/);
    expect(exitError("sl", 3_000_000n, false, { ...ctx, nowBase: 2_900_000n })).toMatch(/already been passed/);
    expect(exitError("tp", 6_250_000n, false, ctx)).toBeNull();
    expect(exitError("sl", 2_500_000n, false, ctx)).toBeNull();
  });

  it("captions a set target with its trigger price, and an unset one with Tradash's words", () => {
    expect(exitCaption("tp", 6_000_000n, ctx)).toBe("Closes at ≈ $62,010.00 for +$1.00 (+20.0%)");
    expect(exitCaption("sl", 4_000_000n, { ...ctx, spotAt: () => null })).toBe("Closes when Close pays $4.00 — −$1.00 (−20.0%)");
    expect(exitCaption("tp", null, ctx)).toMatch(/no automatic exit in profit/);
    expect(exitCaption("sl", null, ctx)).toBe("Not set.");
  });
});
