import { describe, expect, it } from "vitest";
import { pickExemplar } from "./exemplar";

const row = (rank: number, owner: string, pnl: string, settled: number) => ({ rank, owner, pnlBase: pnl, settledTrades: settled });

describe("pickExemplar", () => {
  it("takes the profitable, non-house wallet with the most settled Windows (ties: higher P&L)", () => {
    const rows = [row(1, "0xa", "38000000", 1), row(11, "0xb", "4690000", 9), row(12, "0xc", "5000000", 9), row(13, "0xh", "9000000", 20)];
    expect(pickExemplar(rows, new Set(["0xh"]), 161)).toEqual({ address: "0xc", rank: 12, settled: 9, of: 161 });
  });

  it("needs at least five settled Windows and a positive P&L", () => {
    expect(pickExemplar([row(1, "0xa", "100", 4), row(2, "0xb", "-5", 30), row(3, "0xc", "0", 8)], new Set(), 3)).toBeNull();
  });
});
