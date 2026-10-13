import { describe, expect, it } from "vitest";
import { plainWhy, rowDetail } from "./rows-copy";

// Frames from ops `/health` on 2026-10-13.
describe("status rows in plain words", () => {
  it("reads each keeper's structured detail", () => {
    expect(rowDetail("chain-head", { head: 39470079, lagMs: 1899 }, "head 39470079 (2s old)")).toBe("New block 2 s ago");
    expect(rowDetail("indexer", { lagBlocks: 3 }, "live 39470082..39470084 (+0 events) · 0 behind · vault 0xdbb3Fa")).toBe("Up to date");
    expect(rowDetail("indexer", { lagBlocks: 40 }, "")).toBe("40 blocks behind");
    expect(rowDetail("spot-feed", { feeds: 19, of: 19 }, "")).toBe("19 of 19 fresh");
    expect(rowDetail("price-relay", { liveWindows: 67, due: 0 }, "")).toBe("67 Windows · none due");
    expect(rowDetail("display-crypto", {}, "BTC 8338730000000, SOL 10682000000, ETH 250811000000 · socket 0/3")).toBe("BTC, SOL, ETH streaming");
    expect(rowDetail("display-stocks", {}, "post: 10 ticker(s) on IEX")).toBe("10 stocks streaming");
    expect(rowDetail("window-roller", { lanes: { "BTC-5m": "waiting: next", "TSLA-5m": "closed", "AMD-24h": "paused: no source", "ETH-5m": "open #3" } }, "")).toBe("4 lanes · 1 open · 1 paused");
    expect(rowDetail("seed-maker", { quoting: 30, trading: 30 }, "")).toBe("Quoting 30 of 30");
    expect(rowDetail("earn-quoter", {}, "1 quoted of 6 live crypto Windows · 8/8 held · 135 txs")).toBe("Quoting 1 of 6 crypto Windows");
    expect(rowDetail("settler", { tracked: 20 }, "20 Windows tracked · 0 due · settle 80")).toBe("20 tracked · none due");
    expect(rowDetail("exit-keeper", { armed: 0 }, "")).toBe("No armed exits");
    expect(rowDetail("leverage-keeper", { live: 2 }, "")).toBe("2 open");
    expect(rowDetail("halt-watch", { halts: {} }, "")).toBe("No halts");
    expect(rowDetail("calendar", {}, "Opens Wed 09:30 ET · 10 sessions ahead · 0 disagreements")).toBe("Opens Wed 09:30 ET");
  });
  it("falls back to the actor's own words without addresses or raw numbers", () => {
    expect(plainWhy("house fill: ETH-5m IOC BUY_NO 1000 @ 560 · 0xcfc677b81d71009f7636a85fbe7aaaf00b3517b4 | more")).toBe("house fill: ETH-5m IOC BUY_NO 1000 @ 560");
    expect(rowDetail("archive", undefined, "up to date")).toBe("up to date");
  });
});
