import { describe, expect, it } from "vitest";
import { depthFromBook, exitFromBook, holdToConfirmed, ownLimitTicksOf, quoteFromBook, type Grid, type YesBook } from "./quote";

// The launch grid on Moderato (lens `seriesOf`): lot = tick = 1000, cashUnit 1, minLots 1000 (one contract).
const GRID: Grid = { lotBase: 1000n, tickBase: 1000n, cashUnit: 1n, minLots: 1000n, decimals: 6 };
const book: YesBook = { bids: [[430, 5_000n], [420, 10_000n]], asks: [[450, 3_000n], [460, 20_000n]] };

describe("quote kernels over lens levels", () => {
  it("an Up stake walks the YES asks and pads the limit by max(3%, 10 ticks); cost never exceeds the stake", () => {
    const q = quoteFromBook(book, GRID, "up", 2_000_000n, 1)!;
    // 3,000 lots at 450 (1.35M) then 1,413 at 460; limit 460 + 13 = 473 → ⌊2M / 473⌋ = 4,228 lots affordable.
    expect(ownLimitTicksOf(q, GRID)).toBe(473);
    expect(q.limitPriceRaw).toBe(473_000n);
    expect(q.contractsRaw).toBe(4_228n * 1000n);
    expect(q.maxCostBase).toBe(4_228n * 473n);
    expect(q.maxCostBase).toBeLessThanOrEqual(2_000_000n);
    expect(q.expectedCostBase).toBe(3_000n * 450n + 1_228n * 460n);
    expect(q.payoutIfRightBase).toBe(q.contractsRaw);
    expect(q.partial).toBe(false);
  });

  it("a Down stake walks the YES bids inverted (NO at 1000 − p) and the order price is back in YES terms", () => {
    const q = quoteFromBook(book, GRID, "down", 1_000_000n, 1)!;
    expect(ownLimitTicksOf(q, GRID)).toBe(570 + 17);
    expect(q.limitPriceRaw).toBe(BigInt(1000 - 587) * 1000n);
  });

  it("is partial when the book runs out before the stake, and null below one contract", () => {
    const thin: YesBook = { bids: [], asks: [[500, 1_500n]] };
    const q = quoteFromBook(thin, GRID, "up", 5_000_000n, 1)!;
    expect(q.partial).toBe(true);
    expect(q.contractsRaw).toBe(1_500_000n);
    expect(q.fillableStakeBase).toBe(q.maxCostBase);
    expect(quoteFromBook(thin, GRID, "up", 400_000n, 1)).toBeNull();
    expect(quoteFromBook({ bids: [], asks: [] }, GRID, "up", 5_000_000n, 1)).toBeNull();
  });

  it("an exit sells into the bids with the limit padded down; its floor is lots × limit", () => {
    const e = exitFromBook(book, GRID, "up", 8_000n, 1)!;
    expect(e.contractsRaw).toBe(8_000_000n);
    expect(e.proceedsBase).toBe(5_000n * 430n + 3_000n * 420n);
    expect(e.limitPriceTicks).toBe(420 - 12);
    expect(e.minProceedsBase).toBe(8_000n * 408n);
    expect(e.partial).toBe(false);
    const down = exitFromBook(book, GRID, "down", 2_000n, 1)!;
    expect(down.proceedsBase).toBe(2_000n * 550n);
    expect(exitFromBook({ bids: [], asks: [] }, GRID, "up", 2_000n, 1)).toBeNull();
  });

  it("depth reads each column in its own terms", () => {
    const d = depthFromBook(book, GRID);
    expect(d.upAsks[0]).toEqual({ priceRaw: 450_000n, priceBps: 4_500, quantityRaw: 3_000_000n });
    expect(d.downAsks[0]!.priceBps).toBe(5_700);
    expect(d.downBids[0]!.priceBps).toBe(5_500);
  });
  it("a cheaper book keeps the confirmed contracts within the cap; a dearer one is a requote (D-208)", () => {
    // Live, testnet 2026-10-08: a $1 Up shown at 60.6¢; at the tap the maker's ask is 60.1¢.
    const shown = quoteFromBook({ bids: [], asks: [[606, 10_000n]] }, GRID, "up", 1_000_000n, 1)!;
    expect(shown.contractsRaw).toBe(1_602n * 1000n);
    expect(shown.maxCostBase).toBe(1_602n * 624n);
    const cheaper: YesBook = { bids: [], asks: [[601, 10_000n]] };
    const fresh = quoteFromBook(cheaper, GRID, "up", 1_000_000n, 2)!;
    // More lots at a lower limit, yet their escrow rounds above the confirmed one: escrow is no price signal.
    expect(fresh.maxCostBase).toBeGreaterThan(shown.maxCostBase);
    const held = holdToConfirmed(cheaper, GRID, fresh, shown)!;
    expect(held.contractsRaw).toBe(shown.contractsRaw);
    expect(held.payoutIfRightBase).toBe(shown.contractsRaw);
    expect(held.limitPriceRaw).toBe(619_000n);
    expect(held.maxCostBase).toBe(1_602n * 619n);
    expect(held.maxCostBase).toBeLessThanOrEqual(shown.maxCostBase);
    expect(held.expectedCostBase).toBe(1_602n * 601n);
    // The same book is the confirmed quote; a dearer one buys fewer contracts.
    expect(holdToConfirmed({ bids: [], asks: [[606, 10_000n]] }, GRID, quoteFromBook({ bids: [], asks: [[606, 10_000n]] }, GRID, "up", 1_000_000n, 3)!, shown)).toMatchObject({ contractsRaw: shown.contractsRaw, maxCostBase: shown.maxCostBase });
    const dearer: YesBook = { bids: [], asks: [[612, 10_000n]] };
    expect(holdToConfirmed(dearer, GRID, quoteFromBook(dearer, GRID, "up", 1_000_000n, 4)!, shown)).toBeNull();
  });

  it("holds a Down quote in its own terms: a higher NO limit is a requote", () => {
    // Down buys NO at 1000 − YES bid: the bid falling from 400 to 390 makes NO dearer (600 → 610).
    const shown = quoteFromBook({ bids: [[400, 10_000n]], asks: [] }, GRID, "down", 1_000_000n, 1)!;
    const dearer: YesBook = { bids: [[390, 10_000n]], asks: [] };
    expect(holdToConfirmed(dearer, GRID, quoteFromBook(dearer, GRID, "down", 1_000_000n, 2)!, shown)).toBeNull();
    const cheaper: YesBook = { bids: [[405, 10_000n]], asks: [] };
    const held = holdToConfirmed(cheaper, GRID, quoteFromBook(cheaper, GRID, "down", 1_000_000n, 2)!, shown)!;
    expect(held.contractsRaw).toBe(shown.contractsRaw);
    expect(ownLimitTicksOf(held, GRID)).toBeLessThan(ownLimitTicksOf(shown, GRID));
  });
});
