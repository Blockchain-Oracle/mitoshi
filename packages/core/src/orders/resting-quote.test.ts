// Ported from Agari 03b30ab:packages/core/src/orders/resting-quote.test.ts
import { describe, expect, it } from "vitest";
import { restExpirySec, restUntilOf } from "./rest-expiry";
import { restingQuote, yesTicksOf } from "./resting-quote";

/** The devnet Series grid (events-accounts.md §2): one base unit per lot-tick, 1,000 outcome units per lot, 1,000 lots minimum. */
const GRID = { lotBase: 1_000n, tickBase: 1_000n, cashUnit: 1n, minLots: 1_000n };
const TUSDC = 1_000_000n;
const quote = (side: "up" | "down", priceCents: number, stakeBase: bigint) => restingQuote({ side, priceCents, stakeBase, grid: GRID, decimals: 6, quotedAtMs: 1 });

describe("restingQuote", () => {
  it("rests UP at 55¢ as BUY_YES at 550 ticks, escrowing lots × 550", () => {
    const q = quote("up", 55, 55n * TUSDC / 10n);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.sizing).toEqual({ ownTicks: 550, yesTicks: 550, lots: 10_000n, escrowBase: 5_500_000n, minStakeBase: 550_000n });
    expect(q.quote.limitPriceRaw).toBe(550_000n);
    expect(q.quote.maxCostBase).toBe(5_500_000n);
    expect(q.quote.expectedCostBase).toBe(5_500_000n);
    expect(q.quote.contractsRaw).toBe(10_000_000n);
    expect(q.quote.payoutIfRightBase).toBe(10_000_000n);
    expect(q.quote.avgPriceBps).toBe(5_500);
    expect(q.quote.oddsCents).toBe(55);
    expect(q.quote.partial).toBe(false);
  });

  it("rests DOWN at 55¢ as BUY_NO at 450 YES ticks with the same escrow per lot", () => {
    const q = quote("down", 55, 55n * TUSDC / 10n);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.sizing.yesTicks).toBe(450);
    expect(q.sizing.ownTicks).toBe(550);
    expect(q.quote.limitPriceRaw).toBe(450_000n);
    expect(q.quote.maxCostBase).toBe(5_500_000n);
    expect(yesTicksOf("down", 44)).toBe(560);
  });

  it("floors to whole lots and never escrows more than the stake", () => {
    const q = quote("up", 55, 3n * TUSDC);
    expect(q.ok).toBe(true);
    if (!q.ok) return;
    expect(q.sizing.lots).toBe(5_454n);
    expect(q.quote.maxCostBase).toBe(2_999_700n);
    expect(q.quote.maxCostBase <= 3n * TUSDC).toBe(true);
  });

  it("refuses a stake under min_lots at the price, naming the floor", () => {
    const q = quote("up", 55, TUSDC / 2n);
    expect(q.ok).toBe(false);
    if (q.ok) return;
    expect(q.blocker).toBe("too-small");
    expect(q.sizing?.minStakeBase).toBe(550_000n);
    expect(quote("up", 70, 0n)).toMatchObject({ ok: false, blocker: "no-stake" });
  });

  it("refuses a price off the 1..99¢ grid", () => {
    expect(quote("up", 0, TUSDC)).toMatchObject({ ok: false, blocker: "no-price" });
    expect(quote("up", 100, TUSDC)).toMatchObject({ ok: false, blocker: "no-price" });
    expect(quote("down", 55.5, TUSDC)).toMatchObject({ ok: false, blocker: "no-price" });
  });
});

describe("restExpirySec", () => {
  const w = { tradingStartSec: 10_000, lockAtSec: 10_300 };
  it("defaults to 90 s after the bell, or 90 s from now once the bell has rung", () => {
    expect(restExpirySec(9_000, w)).toBe(10_090);
    expect(restExpirySec(10_050, w)).toBe(10_140);
    expect(restExpirySec(10_250, w)).toBe(10_300);
    expect(restExpirySec(10_300, w)).toBeNull();
  });
  it("rests until the lock on request, and never past it", () => {
    expect(restExpirySec(9_000, w, "lock")).toBe(10_300);
    expect(restExpirySec(10_300, w, "lock")).toBeNull();
    expect(restUntilOf(10_090, w)).toBe("bell");
    expect(restUntilOf(10_300, w)).toBe("lock");
  });
});
