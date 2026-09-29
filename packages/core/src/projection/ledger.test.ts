// Ported from Masayume 68f7a09:packages/core/src/projection/ledger.test.ts
import { describe, expect, it } from "vitest";
import { toMarketId } from "../types/market";
import { buildLedgers } from "./ledger";
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
});
