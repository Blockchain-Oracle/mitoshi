import { describe, expect, it } from "vitest";
import { haltEpisodes, overlapSec } from "./episodes";

const row = (id: number, sec: number, confirmed: Record<string, string>, fixture: string | null = null) => ({ id: String(id), pass_sec: String(sec), confirmed, fixture });

describe("halt episodes from halt-watch's log", () => {
  it("opens an episode when an asset joins the board and closes it when it leaves", () => {
    const eps = haltEpisodes([row(1, 100, {}), row(2, 110, { AAPL: "redstone-stale", "MSFT-24": "redstone-stale" }), row(3, 115, { AAPL: "redstone-stale", "MSFT-24": "redstone-stale" }), row(4, 400, { "MSFT-24": "redstone-stale" }), row(5, 500, {})]);
    expect(eps).toEqual([
      { asset: "AAPL", reason: "redstone-stale", startSec: 110, endSec: 400 },
      { asset: "MSFT-24", reason: "redstone-stale", startSec: 110, endSec: 500 },
    ]);
  });
  it("splits an episode when the reason changes, and keeps a halt still on the board open", () => {
    const eps = haltEpisodes([row(1, 10, { "MSFT-24": "redstone-signers" }), row(2, 13, { "MSFT-24": "redstone-stale" }), row(3, 20, { TSLA: "exchange-halt", "MSFT-24": "redstone-stale" })]);
    expect(eps).toEqual([
      { asset: "MSFT-24", reason: "redstone-signers", startSec: 10, endSec: 13 },
      { asset: "MSFT-24", reason: "redstone-stale", startSec: 13, endSec: null },
      { asset: "TSLA", reason: "exchange-halt", startSec: 20, endSec: null },
    ]);
  });
  it("skips a fixture run and an unknown reason", () => {
    expect(haltEpisodes([row(1, 10, { AAPL: "exchange-halt" }, "halted-session"), row(2, 20, { AAPL: "pyth-wide" })])).toEqual([]);
  });
  it("measures an episode's share of a span", () => {
    const ep = { asset: "AAPL", reason: "redstone-stale" as const, startSec: 100, endSec: 400 };
    expect(overlapSec(ep, 0, 200, 1_000)).toBe(100);
    expect(overlapSec(ep, 500, 600, 1_000)).toBe(0);
    expect(overlapSec({ ...ep, endSec: null }, 300, 2_000, 1_000)).toBe(700);
  });
});
