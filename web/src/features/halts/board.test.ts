import { describe, expect, it } from "vitest";
import { boardRows, episodeLine } from "./board";

const NOW = 1_791_653_000; // Sat 2026-10-10 ~13:23 ET
const OCT7 = 1_791_387_540; // Wed 2026-10-07 15:39Z = 11:39 ET

describe("the halts board", () => {
  const eps = [
    { asset: "MSFT-24", reason: "redstone-signers" as const, startSec: OCT7, endSec: OCT7 + 180 },
    { asset: "AAPL", reason: "exchange-halt" as const, startSec: OCT7, endSec: OCT7 + 600 },
  ];
  const rows = boardRows(eps, { "TSLA-24": { reason: "redstone-stale", sinceSec: NOW - 60 } }, OCT7 - 86_400, NOW);
  it("has one row per ticker, its halt now from the live board, and SPCX unwatched", () => {
    expect(rows).toHaveLength(13);
    expect(rows.find((r) => r.symbol === "TSLA")!.now).toEqual({ reason: "redstone-stale", sinceSec: NOW - 60, feed: "24/7" });
    expect(rows.find((r) => r.symbol === "SPCX")!.unwatched).toBe(true);
    expect(rows.find((r) => r.symbol === "BTC")!.now).toBeNull();
  });
  it("marks each ET day by its halts, and days before the log as unknown", () => {
    const msft = rows.find((r) => r.symbol === "MSFT")!;
    const day = msft.days.find((d) => d.date === "2026-10-07")!;
    expect(day.tone).toBe("stale");
    expect(day.lines).toEqual(["Signed price stale · 24/7 feed · 11:39–11:42 ET (3 min)"]);
    expect(rows.find((r) => r.symbol === "AAPL")!.days.find((d) => d.date === "2026-10-07")!.tone).toBe("halted");
    expect(msft.days.find((d) => d.date === "2026-10-08")!.tone).toBe("clear");
    expect(msft.days[0]!.tone).toBe("none");
    expect(msft.days.at(-1)!.date).toBe("2026-10-10");
    expect(msft.last?.reason).toBe("redstone-signers");
  });
  it("words an open halt as running to now", () => {
    expect(episodeLine({ asset: "TSLA", reason: "exchange-halt", startSec: NOW - 3_600 * 3, endSec: null }, NOW)).toMatch(/^Trading halted · Regular feed · \d\d:\d\d–now \(3 h\)$/);
  });
});
