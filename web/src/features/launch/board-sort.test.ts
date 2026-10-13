import { isTeamLauncher, type LaunchBoardRowWire } from "@cwf/core";
import { describe, expect, it } from "vitest";
import { sortBoard } from "./board-sort";

const row = (token: string, over: Partial<LaunchBoardRowWire> = {}): LaunchBoardRowWire => ({
  token, kind: "memecoin", name: token, symbol: token.toUpperCase(), logoURI: null, creator: "0xabc", team: false, createdSec: 100, stage: "trading", progressBps: 0,
  priceE18: "1", mcapBase: "1", totalSupply: "1", vol24hBase: "0", trades24h: 0, holders: 0, spark: [], raisedBase: "0", graduatedSec: null, ...over,
});

describe("sortBoard", () => {
  const rows = [
    row("a", { vol24hBase: "500", trades24h: 2, createdSec: 10 }),
    row("b", { vol24hBase: "500", trades24h: 5, createdSec: 5 }),
    row("c", { vol24hBase: "900", createdSec: 1, progressBps: 6200 }),
    row("d", { stage: "graduated", graduatedSec: 50, createdSec: 2 }),
    row("e", { stage: "complete", graduatedSec: null, createdSec: 3 }),
    row("f", { kind: "stablecoin", createdSec: 99 }),
    row("g", { stage: "graduated", graduatedSec: 80, createdSec: 4 }),
  ];

  it("trending: 24 h volume, then 24 h trades, then newest", () => {
    expect(sortBoard(rows, "trending").map((r) => r.token)).toEqual(["c", "b", "a", "f", "g", "e", "d"]);
  });

  it("new: newest first, stablecoins included", () => {
    expect(sortBoard(rows, "new").map((r) => r.token)).toEqual(["f", "a", "b", "g", "e", "d", "c"]);
  });

  it("graduating: memecoins on the curve only, furthest along first, ties newest", () => {
    expect(sortBoard(rows, "graduating").map((r) => r.token)).toEqual(["c", "a", "b"]);
  });

  it("graduated: completed (graduating now) first, then the latest graduation; no stablecoins", () => {
    expect(sortBoard(rows, "graduated").map((r) => r.token)).toEqual(["e", "g", "d"]);
  });
});

describe("team launches", () => {
  it("are the launch area's deployer and the house keys, case-insensitive; anyone else is the market", () => {
    expect(isTeamLauncher("testnet", "0x64B70CDD6dC30C3ff3eB79493ba17487a1071c96")).toBe(true);
    expect(isTeamLauncher("testnet", "0x6ed3a4b6e42b2c45211074f8d7ba58dbb2faad0c")).toBe(true);
    expect(isTeamLauncher("testnet", "0xb7c8d5eea552508e8c5c5093ad9c544ec3cb26a3")).toBe(false);
    expect(isTeamLauncher("mainnet", "0x64B70CDD6dC30C3ff3eB79493ba17487a1071c96")).toBe(false);
  });
});
