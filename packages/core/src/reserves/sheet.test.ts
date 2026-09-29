// Ported from Agari 03b30ab:packages/core/src/reserves/sheet.test.ts
import { describe, expect, it } from "vitest";
import { boostSheet, makerSheet, parlaySheet, rangeSheet, realizedYield, sharePriceRawOf, supplierPosition, type ReserveSheet } from "./sheet";

const ONE = 1_000_000n;

const sheet = (over: Partial<ReserveSheet> = {}): ReserveSheet => ({
  kind: "range",
  decimals: 6,
  paused: false,
  liquidBase: 400_000_000n,
  committedBase: 600_000_000n,
  totalValueBase: 1_000_000_000n,
  utilizationBps: 6_000,
  supplyShares: 1_000_000_000n,
  sharePriceRaw: ONE,
  ...over,
});

describe("sharePriceRawOf", () => {
  it("is par before anyone supplies — the programs' own first-supply rule", () => {
    expect(sharePriceRawOf(0n, 0n, 6)).toBe(ONE);
    expect(sharePriceRawOf(50_000_000n, 0n, 6)).toBe(ONE);
  });
  it("carries a win and a loss into the price", () => {
    expect(sharePriceRawOf(1_100_000_000n, 1_000_000_000n, 6)).toBe(1_100_000n);
    expect(sharePriceRawOf(900_000_000n, 1_000_000_000n, 6)).toBe(900_000n);
  });
  it("floors rather than rounding up, so equity is never overstated", () => {
    expect(sharePriceRawOf(1_000_000_001n, 3n, 6)).toBe(333_333_333_666_666n);
    expect(sharePriceRawOf(2n, 3n, 6)).toBe(666_666n);
  });
});

describe("supplierPosition", () => {
  it("pays the whole position when liquid covers it", () => {
    const position = supplierPosition(sheet({ liquidBase: 400_000_000n }), 100_000_000n, 100_000_000n);
    expect(position).toEqual({ shares: 100_000_000n, worthBase: 100_000_000n, idleBase: 100_000_000n, idleShares: 100_000_000n, committedBase: 0n });
  });
  it("clamps to free capital and names the rest — the reserve refuses more (InsufficientLiquidity)", () => {
    const position = supplierPosition(sheet({ liquidBase: 40_000_000n }), 100_000_000n, 100_000_000n);
    expect(position.idleBase).toBe(40_000_000n);
    expect(position.idleShares).toBe(40_000_000n);
    expect(position.committedBase).toBe(60_000_000n);
  });
  it("floors the shares it asks for, so the amount the program pays never exceeds free capital", () => {
    // 3 shares worth 10 base units, 7 of them free: 7/10 of 3 shares is 2.1, and 2 shares are worth 6 — under 7.
    const position = supplierPosition(sheet({ liquidBase: 7n }), 3n, 10n);
    expect(position.idleShares).toBe(2n);
    expect((position.idleShares * 10n) / 3n).toBeLessThanOrEqual(7n);
  });
  it("is empty for a wallet that never supplied, and for shares a loss wiped out", () => {
    expect(supplierPosition(sheet(), 0n, 0n)).toEqual({ shares: 0n, worthBase: 0n, idleBase: 0n, idleShares: 0n, committedBase: 0n });
    expect(supplierPosition(sheet(), 5n, 0n).idleShares).toBe(0n);
  });
});

describe("the four reserves keep one sheet", () => {
  const common = { deployment: {} as never, params: {} as never, liquidBase: 40n, totalValueBase: 100n, utilizationBps: 6_000, supplyShares: 50n, paused: false, decimals: 6 };
  it("names what each reserve has promised, and prices its shares the same way", () => {
    expect(rangeSheet({ ...common, lockedBase: 60n })).toMatchObject({ kind: "range", committedBase: 60n, sharePriceRaw: 2_000_000n });
    expect(parlaySheet({ ...common, lockedBase: 60n })).toMatchObject({ kind: "parlay", committedBase: 60n, sharePriceRaw: 2_000_000n });
    expect(boostSheet({ ...common, outstandingBase: 60n, openPositions: 2 })).toMatchObject({ kind: "boost", committedBase: 60n, sharePriceRaw: 2_000_000n });
  });
  it("takes the maker vault's own share price, which prices Windows it is still holding", () => {
    const vault = { ...common, maker: null, deployedBase: 60n, sharePriceRaw: 1_234_000n, openWindows: [] };
    expect(makerSheet(vault as never)).toMatchObject({ kind: "maker", committedBase: 60n, sharePriceRaw: 1_234_000n });
  });
});

describe("realizedYield", () => {
  it("counts nothing as earned until every unit supplied has come back", () => {
    expect(realizedYield({ suppliedBase: 100n, withdrawnBase: 0n, worthBase: 130n })).toEqual({ realizedBase: 0n, costStillInBase: 100n, unrealizedBase: 30n });
    expect(realizedYield({ suppliedBase: 100n, withdrawnBase: 60n, worthBase: 70n })).toEqual({ realizedBase: 0n, costStillInBase: 40n, unrealizedBase: 30n });
  });
  it("is money already in the wallet once cost is whole", () => {
    expect(realizedYield({ suppliedBase: 100n, withdrawnBase: 130n, worthBase: 0n })).toEqual({ realizedBase: 30n, costStillInBase: 0n, unrealizedBase: 0n });
    expect(realizedYield({ suppliedBase: 100n, withdrawnBase: 130n, worthBase: 15n })).toEqual({ realizedBase: 30n, costStillInBase: 0n, unrealizedBase: 15n });
  });
  it("shows a carried loss rather than hiding it", () => {
    expect(realizedYield({ suppliedBase: 100n, withdrawnBase: 0n, worthBase: 82n })).toEqual({ realizedBase: 0n, costStillInBase: 100n, unrealizedBase: -18n });
  });
  it("is empty for a wallet that never supplied", () => {
    expect(realizedYield({ suppliedBase: 0n, withdrawnBase: 0n, worthBase: 0n })).toEqual({ realizedBase: 0n, costStillInBase: 0n, unrealizedBase: 0n });
  });
});
