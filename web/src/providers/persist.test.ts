// Ported from Masayume 68f7a09:web/src/providers/persist.test.ts (Tempo keys)
import type { MarketId } from "@cwf/core";
import { keys } from "@cwf/markets/react";
import { describe, expect, it } from "vitest";
import { isPersistable } from "./persist";

const WALLET = "0xd357000000000000000000000000000000009358";
const MARKET = `0x${"ab".repeat(32)}` as unknown as MarketId;

describe("read-cache persistence allowlist", () => {
  it("stores the public, slowly changing facts that make a reload cheap", () => {
    expect(isPersistable(keys.bookParams("0xseries"))).toBe(true);
    expect(isPersistable(keys.lanes())).toBe(true);
  });

  it("never stores anything scoped to an account", () => {
    for (const key of [keys.positions(WALLET), keys.balanceSheet(WALLET), keys.history(WALLET), keys.vault(WALLET), keys.claimables(WALLET), keys.keychain(WALLET)]) {
      expect(isPersistable(key)).toBe(false);
    }
  });

  it("never stores a number that goes stale in seconds, nor the clock", () => {
    for (const key of [keys.onchain(MARKET), keys.price("ETH"), keys.market(MARKET), keys.clock()]) expect(isPersistable(key)).toBe(false);
  });
});
