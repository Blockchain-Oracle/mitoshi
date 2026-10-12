// The Trade history's rows (R4-0, D-227): DEMO's paper trades read as the wallet's rounds do — the tag, the Window and
// the money in base units.
import type { SettledRound } from "@cwf/core";
import { winStreaks } from "@cwf/core";
import { describe, expect, it } from "vitest";
import type { PaperTrade } from "./demo";
import { paperRows, walletRows } from "./history-rows";

const M = `0x${"ab".repeat(32)}`;
const trade = (over: Partial<PaperTrade>): PaperTrade => ({
  id: `${M}:up:1000:2000`, kind: "close", asset: "BTC", side: "up", intervalSec: 300, costBase: "5000000", pnlBase: "1250000", openedAtMs: 1000, closedAtMs: 2_000_000, ...over,
});

describe("paper history rows", () => {
  it("tags a close, a reduce and a trail as closed, keeping the Window, the side and base units", () => {
    const [close, reduce, trail] = paperRows([trade({}), trade({ kind: "reduce", side: "down", pnlBase: "-400000" }), trade({ kind: "trail" })]);
    expect(close).toEqual({ key: `${M}:up:1000:2000`, source: "paper", marketId: M, asset: "BTC", up: true, outcome: "closed", intervalSec: 300, stakeBase: 5_000_000n, pnlBase: 1_250_000n, decimals: 6, settledAtMs: 2_000_000, expirySec: 2_000 });
    expect(reduce!.outcome).toBe("closed");
    expect(reduce!.up).toBe(false);
    expect(reduce!.pnlBase).toBe(-400_000n);
    expect(trail!.outcome).toBe("closed");
  });

  it("reads a settle as the Window's verdict: void when voided whatever its PnL, won at or over cost, else lost", () => {
    const rows = paperRows([
      trade({ kind: "settle", pnlBase: "4800000" }),
      trade({ kind: "settle", pnlBase: "0" }),
      trade({ kind: "settle", pnlBase: "-5000000" }),
      trade({ kind: "settle", pnlBase: "-2500000", voided: true }),
      trade({ kind: "settle", pnlBase: "100000", voided: true }),
    ]);
    expect(rows.map((r) => r.outcome)).toEqual(["win", "win", "loss", "void", "void"]);
  });

  it("times the row at the Window's close, as a wallet row is — a settle recorded on the next visit keeps it", () => {
    const [late, older] = paperRows([trade({ kind: "settle", closedAtMs: 9_000_000, expirySec: 1_800 }), trade({ closedAtMs: 2_500_999 })]);
    expect(late!.expirySec).toBe(1_800);
    expect(late!.settledAtMs).toBe(9_000_000);
    // Stored before the Window's close was kept: when it closed.
    expect(older!.expirySec).toBe(2_500);
  });

  it("counts streaks over settled verdicts only, as the wallet's history does", () => {
    const at = (closedAtMs: number, kind: PaperTrade["kind"], pnlBase: string) => trade({ id: `${M}:up:1:${closedAtMs}`, kind, pnlBase, closedAtMs });
    // Newest first, as demo.ts keeps them: win, close, win, loss.
    const rows = paperRows([at(4_000, "settle", "1"), at(3_000, "close", "-9"), at(2_000, "settle", "2"), at(1_000, "settle", "-3")]);
    expect(winStreaks(rows)).toEqual({ best: 2, current: 2 });
  });
});

describe("wallet history rows", () => {
  it("keeps the round's outcome, side, money and decimals", () => {
    const round = { marketId: M, asset: "ETH", intervalSec: 900, expirySec: 5_000, decimals: 6, outcome: "loss", sidesTraded: [1], stakeBase: 2_000_000n, pnlBase: -2_000_000n, settledAtMs: 5_000_500, openedAtMs: 4_200_000, source: "vault" } as unknown as SettledRound;
    expect(walletRows([round])).toEqual([{ key: `vault:${M}:4200000`, source: "vault", marketId: M, asset: "ETH", up: false, outcome: "loss", intervalSec: 900, stakeBase: 2_000_000n, pnlBase: -2_000_000n, decimals: 6, settledAtMs: 5_000_500, expirySec: 5_000 }]);
  });
});
