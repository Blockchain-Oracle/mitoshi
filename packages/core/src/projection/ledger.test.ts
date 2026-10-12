// Ported from Masayume 68f7a09:packages/core/src/projection/ledger.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import { buildLedgers, heldCostOf, openCostOf, realizedOf, soldShare } from "./ledger";
import type { LedgerFill, LedgerSetAction } from "./types";

const ONE = 1_000_000n;
const M = toMarketId(`0x${"a1".padStart(64, "0")}`);
const TX = "0xabc" as const;

const fill = (side: LedgerFill["side"], qty: bigint, yesPrice: bigint, atMs: number): LedgerFill => ({ marketId: M, side, quantityRaw: qty, yesPriceRaw: yesPrice, atMs, txHash: TX });

describe("buildLedgers", () => {
  it("books buys at the side's own price — DOWN pays the complement of the YES print", () => {
    const ledger = buildLedgers([fill("BUY_YES", 10n * ONE, 400_000n, 1), fill("BUY_NO", 5n * ONE, 400_000n, 2)], [], 6).get(M)!;
    expect(ledger.heldUpRaw).toBe(10n * ONE);
    expect(ledger.heldDownRaw).toBe(5n * ONE);
    expect(ledger.costBase).toBe(4n * ONE + 3n * ONE);
    expect(ledger.sidesTraded).toEqual([0, 1]);
  });

  it("treats a sell beyond inventory as a short: the remainder becomes a buy of the other side", () => {
    const ledger = buildLedgers([fill("SELL_YES", 5n * ONE, 959_000n, 1)], [], 6).get(M)!;
    expect(ledger.heldUpRaw).toBe(0n);
    expect(ledger.heldDownRaw).toBe(5n * ONE);
    expect(ledger.costBase).toBe(205_000n);
    expect(ledger.proceedsBase).toBe(0n);
    expect(ledger.shortCount).toBe(1);
  });

  it("splits a sell across inventory and short, and replays in time order regardless of input order", () => {
    const fills = [fill("SELL_YES", 8n * ONE, 500_000n, 20), fill("BUY_YES", 6n * ONE, 300_000n, 10)];
    const ledger = buildLedgers(fills, [], 6).get(M)!;
    expect(ledger.heldUpRaw).toBe(0n);
    expect(ledger.heldDownRaw).toBe(2n * ONE);
    expect(ledger.proceedsBase).toBe(3n * ONE);
    expect(ledger.costBase).toBe(18n * ONE / 10n + 1n * ONE);
    expect(ledger.entryTxHash).toBe(TX);
    expect(ledger.firstAtMs).toBe(10);
  });

  it("mints a pair at one collateral per set and merges only what is held", () => {
    const actions: LedgerSetAction[] = [
      { marketId: M, kind: "mint", amountRaw: 4n * ONE, atMs: 1, txHash: TX },
      { marketId: M, kind: "merge", amountRaw: 9n * ONE, atMs: 2, txHash: TX },
    ];
    const ledger = buildLedgers([], actions, 6).get(M)!;
    expect(ledger.heldUpRaw).toBe(0n);
    expect(ledger.heldDownRaw).toBe(0n);
    expect(ledger.costBase).toBe(4n * ONE);
    expect(ledger.proceedsBase).toBe(4n * ONE);
  });

  // D-227: the open cost of what is held, at average cost. Every figure below is worked by hand in dollars.
  it("a Reduce takes its share of the cost out: buy 10 @ 50¢, sell 5 @ 70¢ — 5 left at $2.50, $1.00 realised", () => {
    const ledger = buildLedgers([fill("BUY_YES", 10n * ONE, 500_000n, 1), fill("SELL_YES", 5n * ONE, 700_000n, 2)], [], 6).get(M)!;
    expect(ledger.heldUpRaw).toBe(5n * ONE);
    expect(ledger.openCostUpBase).toBe(2_500_000n);
    expect(ledger.costBase).toBe(5n * ONE);
    expect(ledger.proceedsBase).toBe(3_500_000n);
    // The 5 left are worth 5 × 70¢ = $3.50 against $2.50: +$1.00 (+40 %), not −$1.50.
    expect(3_500_000n - openCostOf(ledger)).toBe(1n * ONE);
    expect(realizedOf(ledger)).toBe(1n * ONE);
  });

  it("a re-entry after a full close starts from its own cost: buy 10 @ 50¢, sell 10 @ 60¢, buy 10 @ 55¢", () => {
    const fills = [fill("BUY_YES", 10n * ONE, 500_000n, 1), fill("SELL_YES", 10n * ONE, 600_000n, 2), fill("BUY_YES", 10n * ONE, 550_000n, 3)];
    const ledger = buildLedgers(fills, [], 6).get(M)!;
    expect(ledger.heldUpRaw).toBe(10n * ONE);
    expect(ledger.openCostUpBase).toBe(5_500_000n);
    expect(ledger.costBase).toBe(10_500_000n);
    // $6.00 back on $5.00: +$1.00 realised; the new 10 cost $5.50, so a flat book reads flat.
    expect(realizedOf(ledger)).toBe(1n * ONE);
  });

  it("averages the cost across adds and keeps it per side on a hedge (DOWN at the complement)", () => {
    const fills = [fill("BUY_YES", 4n * ONE, 400_000n, 1), fill("BUY_YES", 6n * ONE, 600_000n, 2), fill("BUY_NO", 10n * ONE, 300_000n, 3), fill("SELL_YES", 5n * ONE, 500_000n, 4)];
    const ledger = buildLedgers(fills, [], 6).get(M)!;
    // Up: $1.60 + $3.60 = $5.20 for 10 (52¢ avg); half sold keeps $2.60. Down: 10 × 70¢ = $7.00, untouched.
    expect(ledger.openCostUpBase).toBe(2_600_000n);
    expect(ledger.openCostDownBase).toBe(7n * ONE);
    expect(ledger.heldUpRaw).toBe(5n * ONE);
    // Sold 5 Up for $2.50 that cost $2.60: −$0.10.
    expect(realizedOf(ledger)).toBe(-100_000n);
  });

  it("a short's complement leg is a held Down at its own cost; a later sale of it is costed pro rata", () => {
    const fills = [fill("SELL_YES", 4n * ONE, 800_000n, 1), fill("SELL_NO", 1n * ONE, 300_000n, 2)];
    const ledger = buildLedgers(fills, [], 6).get(M)!;
    // Selling 4 Up held at none buys 4 Down at 20¢ = $0.80; selling 1 Down at 70¢ takes $0.20 of it out, $0.70 in.
    expect(ledger.heldDownRaw).toBe(3n * ONE);
    expect(ledger.openCostDownBase).toBe(600_000n);
    expect(ledger.openCostUpBase).toBe(0n);
    expect(realizedOf(ledger)).toBe(500_000n);
  });

  it("a mint costs half a dollar a side; a merge takes both sides' share out and pays a dollar a pair", () => {
    const actions: LedgerSetAction[] = [
      { marketId: M, kind: "mint", amountRaw: 3n * ONE + 1n, atMs: 1, txHash: TX },
      { marketId: M, kind: "merge", amountRaw: 1n * ONE, atMs: 3, txHash: TX },
    ];
    const ledger = buildLedgers([fill("BUY_YES", 2n * ONE, 250_000n, 2)], actions, 6).get(M)!;
    // Mint 3.000001 pairs: Up $1.5 (floor), Down $1.500001. Buy 2 Up @ 25¢: Up 5.000001 held at $2.00.
    // Merge 1 pair: Up loses 2.00 × 1 / 5.000001, Down loses 1.500001 × 1 / 3.000001.
    expect(ledger.heldUpRaw).toBe(4n * ONE + 1n);
    expect(ledger.heldDownRaw).toBe(2n * ONE + 1n);
    expect(ledger.openCostUpBase).toBe(2n * ONE - (2n * ONE * ONE) / (5n * ONE + 1n));
    expect(ledger.openCostDownBase).toBe(1_500_001n - (1_500_001n * ONE) / (3n * ONE + 1n));
    expect(ledger.proceedsBase).toBe(1n * ONE);
  });

  it("a sale of everything held takes all of its cost, never leaving a rounding residue", () => {
    expect(soldShare(1_000_001n, 3n, 3n)).toBe(1_000_001n);
    expect(soldShare(1_000_001n, 1n, 3n)).toBe(333_333n);
    expect(soldShare(5n, 0n, 3n)).toBe(0n);
    expect(soldShare(5n, 1n, 0n)).toBe(0n);
    const ledger = buildLedgers([fill("BUY_NO", 3n * ONE, 666_667n, 1), fill("SELL_NO", 3n * ONE, 500_000n, 2)], [], 6).get(M)!;
    expect(ledger.openCostDownBase).toBe(0n);
  });

  it("costs the head-fresh balance: the ledger's own count, scaled at its average while indexing lags, stale when unseen", () => {
    // In step: 5 held at $2.50.
    expect(heldCostOf(5n * ONE, 2_500_000n, 5n * ONE)).toEqual({ costBase: 2_500_000n, stale: false });
    // An Add of 5 not indexed yet: 10 at the ledger's 50¢ average = $5.00, not $2.50 (a false profit).
    expect(heldCostOf(5n * ONE, 2_500_000n, 10n * ONE)).toEqual({ costBase: 5n * ONE, stale: false });
    // A sale not indexed yet: 2 left of 5 keep 2/5 of the cost.
    expect(heldCostOf(5n * ONE, 2_500_000n, 2n * ONE)).toEqual({ costBase: 1n * ONE, stale: false });
    // A first fill not indexed: no cost to scale.
    expect(heldCostOf(0n, 0n, 3n * ONE)).toEqual({ costBase: 0n, stale: true });
    expect(heldCostOf(4n * ONE, 1n * ONE, 0n)).toEqual({ costBase: 0n, stale: false });
  });
});
