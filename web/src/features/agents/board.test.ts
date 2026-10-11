import { describe, expect, it } from "vitest";
import type { StrategyWire } from "../strategies/protocol";
import { rankAgents } from "./board";

const s = (id: string, agentId: string | null, entrusted: string, trades: number, net: string, settled: number, subscribers = 0): StrategyWire =>
  ({ strategyId: id, agentId, subscribers, record: { entrustedBase: entrusted, copyTrades: trades, netBase: net, settled } } as unknown as StrategyWire);

describe("rankAgents (Q-001)", () => {
  const list = [s("1", "7", "5000000", 3, "-2000000", 3), s("2", "8", "9000000", 1, "500000", 1), s("3", null, "99000000", 50, "9000000", 40), s("4", "9", "5000000", 3, "0", 0, 4)];
  it("inherited: entrusted capital, then copy trades, then copiers — results never move a row; only agents rank", () => {
    expect(rankAgents(list, "inherited").map((x) => x.strategyId)).toEqual(["2", "4", "1"]);
  });
  it("by P&L when the owner switches the sort", () => {
    expect(rankAgents(list, "pnl").map((x) => x.strategyId)).toEqual(["2", "4", "1"]);
    expect(rankAgents([s("5", "1", "1", 1, "300", 1), s("6", "2", "1", 1, "300", 4)], "pnl").map((x) => x.strategyId)).toEqual(["6", "5"]);
  });
});
