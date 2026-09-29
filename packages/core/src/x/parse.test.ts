// Ported from Masayume 68f7a09:packages/core/src/x/parse.test.ts
import { describe, expect, it } from "vitest";
import { parseInstruction } from "./parse";

const DEC = 6;
const ok = (text: string) => {
  const parsed = parseInstruction(text, { decimals: DEC });
  if (!parsed.ok) throw new Error(`expected ok, got ${parsed.reason}`);
  return parsed.instruction;
};
const refused = (text: string) => {
  const parsed = parseInstruction(text, { decimals: DEC });
  if (parsed.ok) throw new Error("expected a refusal");
  return parsed.reason;
};

describe("parseInstruction", () => {
  it("reads the canonical grammar", () => {
    expect(ok("@masayume_app btc up 5 15m")).toEqual({ side: "up", asset: "BTC", cadence: "15m", intervalSec: 900, stakeBase: 5_000_000n });
  });
  it("accepts any token order, a $ sign, decimals and synonyms", () => {
    expect(ok("@masayume_app 1h $10.5 DOWN eth")).toEqual({ side: "down", asset: "ETH", cadence: "1h", intervalSec: 3_600, stakeBase: 10_500_000n });
    expect(ok("bitcoin long 25 usdc 5m please")).toMatchObject({ side: "up", asset: "BTC", cadence: "5m" });
    expect(ok("short ether 1 4h")).toMatchObject({ side: "down", asset: "ETH", cadence: "4h" });
  });
  it.each(["BTC long 5 5 minutes", "btc up 5 5min", "BTC up 5 5 mins"])("accepts written minute units: %s", text => {
    expect(ok(text)).toMatchObject({ asset: "BTC", side: "up", stakeBase: 5_000_000n, intervalSec: 300 });
  });
  it.each(["1d", "24h", "24 hours", "1 day"])("accepts the venue's daily Window: %s", duration => {
    expect(ok(`BTC up 5 ${duration}`)).toMatchObject({ cadence: "1d", intervalSec: 86400 });
  });
  it("refuses every ambiguity by name", () => {
    expect(refused("@masayume_app btc up down 5 15m")).toBe("two-sides");
    expect(refused("btc eth up 5 15m")).toBe("two-assets");
    expect(refused("btc up 5 10 15m")).toBe("two-stakes");
    expect(refused("btc up 5 15m 1h")).toBe("two-cadences");
  });
  it("refuses what is missing or unknown", () => {
    expect(refused("btc 5 15m")).toBe("no-side");
    expect(refused("up 5 15m")).toBe("no-asset");
    expect(refused("sol up 5 15m")).toBe("unknown-asset");
    expect(refused("btc up 15m")).toBe("no-stake");
    expect(refused("btc up 5")).toBe("no-cadence");
    expect(refused("btc up 5 30m")).toBe("cadence-not-listed");
    expect(refused("btc up 0 15m")).toBe("bad-stake");
    expect(refused("btc up 5 15m 3x")).toBe("unknown-token");
    expect(refused("@masayume_app")).toBe("empty");
  });
  it("refuses a stake finer than the collateral", () => {
    expect(refused("btc up 0.0000001 15m")).toBe("bad-stake");
  });
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("never treats inherited dictionary key %s as an asset or side", (token) => {
    expect(refused(`${token} btc 5 15m`)).toBe("no-side");
    expect(refused(`${token} up 5 15m`)).toBe("no-asset");
    expect(ok(`${token} btc up 5 15m`)).toMatchObject({ side: "up", asset: "BTC" });
  });
});
