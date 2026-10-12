import { describe, expect, it } from "vitest";
import type { VaultGrant } from "@cwf/core";
import type { SessionView } from "@/features/session/view";
import { MISSED_SALES_MS, missedSales, saleKey, serverExitState } from "./server-exits";
import type { TerminalPosition } from "./terminal-positions";

const KEEPER = "0x6ed3a4b6e42b2c45211074f8d7ba58dbb2faad0c";
const V2 = "0x6f05b0dcaa31c241a4f6e8ceb170090b41679e95";
const MARKET = `0x${"ab".repeat(32)}`;

const p = (over: Partial<TerminalPosition> = {}): TerminalPosition => ({
  id: `v:${V2}:${MARKET}:up`, via: "vault", vault: V2, entryKey: MARKET, marketId: MARKET as never, asset: "BTC", intervalSec: 300, expirySec: 2_000, side: "up", realizedBase: 0n,
  heldRaw: 1_000_000n, costBase: 600_000n, decimals: 6, entrySpot: null, trailStop: null, tpBase: null, slBase: null, openedAtMs: 0, ...over,
});
const exitGrant = (over: Partial<VaultGrant> = {}): VaultGrant => ({
  grantId: 8n, owner: "0xowner" as never, actor: KEEPER as never, kind: "exit", revoked: false, expiresAtSec: 9_000, spentDay: 0, spentTodayBase: 0n, openPositions: 0,
  caps: { maxStakePerTradeBase: 0n, maxDailySpendBase: 0n, maxOpenPositions: 0, maxPriceRaw: 0n, market: null }, budgetBase: 0n, exitToleranceBps: 1_500, ...over,
});
const view = (over: Partial<SessionView> = {}): SessionView => ({ status: "armed", owner: "0xowner" as never, keyAddress: null, grant: null, availableBase: 0n, deployed: true, vault: V2 as never, exitGrant: exitGrant(), ...over });

describe("where a position's exits run (S24.5)", () => {
  it("runs with the app closed only for a v2 Trading Balance position, armed, under an EXIT grant naming the keeper to the Window's end", () => {
    expect(serverExitState(p(), view(), KEEPER as never)).toBe("live");
    expect(serverExitState(p(), view({ exitGrant: null }), KEEPER as never)).toBe("needs-grant");
    expect(serverExitState(p(), view({ exitGrant: exitGrant({ revoked: true }) }), KEEPER as never)).toBe("needs-grant");
    expect(serverExitState(p(), view({ exitGrant: exitGrant({ expiresAtSec: 1_999 }) }), KEEPER as never)).toBe("needs-grant");
    expect(serverExitState(p(), view({ exitGrant: exitGrant({ actor: "0x1111111111111111111111111111111111111111" as never }) }), KEEPER as never)).toBe("needs-grant");
    expect(serverExitState(p(), view({ exitGrant: exitGrant({ caps: { ...exitGrant().caps, market: `0x${"cd".repeat(32)}` as never } }) }), KEEPER as never)).toBe("needs-grant");
  });

  it("stays in the tab for a wallet or Boost position, a v1 one, a disarmed session, or no keeper running", () => {
    expect(serverExitState(p({ via: "wallet", vault: undefined }), view(), KEEPER as never)).toBe("unavailable");
    expect(serverExitState(p({ via: "boost" }), view(), KEEPER as never)).toBe("unavailable");
    expect(serverExitState(p({ vault: "0x5e38dc0000000000000000000000000000000000" as never }), view(), KEEPER as never)).toBe("unavailable");
    expect(serverExitState(p(), view({ status: "disarmed" }), KEEPER as never)).toBe("unavailable");
    expect(serverExitState(p(), view(), null)).toBe("unavailable");
  });
});

describe("sales the keeper made while the app was closed", () => {
  const NOW = 1_800_000_000_000;
  let n = 0;
  const sale = (over: Record<string, unknown> = {}) => ({ market: MARKET, side: "down" as const, status: "fired" as const, trailStopE8: null, lastError: null, reason: "sl" as const, fireTx: `0x${(++n).toString(16).padStart(64, "0")}`, proceedsBase: "940000", firedAtMs: NOW - 60_000, symbol: "BTC", ...over });

  it("announces each unseen sale of the last day once (by its transaction), newest first, three at most", () => {
    const other = `0x${"cd".repeat(32)}`;
    const rows = [
      sale(),
      sale({ market: other, side: "up", firedAtMs: NOW - 5_000 }),
      sale({ market: `0x${"ef".repeat(32)}`, firedAtMs: NOW - MISSED_SALES_MS - 1 }),
      sale({ market: `0x${"01".repeat(32)}`, status: "armed" }),
      sale({ market: `0x${"02".repeat(32)}`, proceedsBase: null }),
    ];
    expect(missedSales(rows, new Set(), NOW).map((r) => r.market)).toEqual([other, MARKET]);
    expect(missedSales(rows, new Set([saleKey(rows[0]!.fireTx.toUpperCase())]), NOW).map((r) => r.market)).toEqual([other]);
    // The same Window and side selling again (a later position) is a new sale.
    expect(missedSales([...rows, sale({ firedAtMs: NOW - 1_000 })], new Set([saleKey(rows[0]!.fireTx)]), NOW).map((r) => r.firedAtMs)).toEqual([NOW - 1_000, NOW - 5_000]);
    const many = Array.from({ length: 5 }, (_, i) => sale({ market: `0x${String(i).repeat(64)}`, firedAtMs: NOW - i }));
    expect(missedSales(many, new Set(), NOW)).toHaveLength(3);
  });
});
