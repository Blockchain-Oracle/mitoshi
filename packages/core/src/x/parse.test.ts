// Ported from Masayume 68f7a09:packages/core/src/x/parse.test.ts — Mitoshi's tickers, stock cashtags and cadences (S11).
import { describe, expect, it } from "vitest";
import { parseInstruction, parseStakeBase, xInstructionText } from "./parse";

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
  it("reads the work order's call", () => {
    expect(ok("@Mitoshi_app BTC up 5m $5")).toEqual({ side: "up", asset: "BTC", cadence: "5m", intervalSec: 300, stakeBase: 5_000_000n });
  });
  it("reads stock cashtags apart from a dollar stake", () => {
    expect(ok("@Mitoshi_app $TSLA down 15m $10")).toEqual({ side: "down", asset: "TSLA", cadence: "15m", intervalSec: 900, stakeBase: 10_000_000n });
    expect(ok("$nvda long 1h 25")).toMatchObject({ asset: "NVDA", side: "up", cadence: "1h", stakeBase: 25_000_000n });
    expect(ok("NVDA $NVDA up 5m $1")).toMatchObject({ asset: "NVDA" });
    expect(refused("$DOGE up 5m $5")).toBe("unknown-asset");
    expect(refused("$TSLA $NVDA up 5m $5")).toBe("two-assets");
  });
  it("accepts any order, company names, decimals and written units", () => {
    expect(ok("1h $10.5 DOWN eth")).toMatchObject({ side: "down", asset: "ETH", cadence: "1h", stakeBase: 10_500_000n });
    expect(ok("tesla long 25 usd 5 minutes please")).toMatchObject({ side: "up", asset: "TSLA", cadence: "5m" });
    expect(ok("short solana 1 60m")).toMatchObject({ side: "down", asset: "SOL", cadence: "1h" });
    expect(ok("btc up 5 1 hour")).toMatchObject({ cadence: "1h", intervalSec: 3_600 });
  });
  it("refuses every ambiguity by name", () => {
    expect(refused("btc up down 5 15m")).toBe("two-sides");
    expect(refused("btc eth up 5 15m")).toBe("two-assets");
    expect(refused("btc up 5 10 15m")).toBe("two-stakes");
    expect(refused("btc up 5 15m 1h")).toBe("two-cadences");
  });
  it("refuses what is missing or not listed", () => {
    expect(refused("btc 5 15m")).toBe("no-side");
    expect(refused("up 5 15m")).toBe("no-asset");
    expect(refused("doge up 5 15m")).toBe("unknown-asset");
    expect(refused("btc up 15m")).toBe("no-stake");
    expect(refused("btc up $5")).toBe("no-cadence");
    expect(refused("btc up 5 4h")).toBe("cadence-not-listed");
    expect(refused("btc up 5 24h")).toBe("cadence-not-listed");
    expect(refused("btc up 0 15m")).toBe("bad-stake");
    expect(refused("btc up 0.0000001 15m")).toBe("bad-stake");
    expect(refused("btc up 5 15m 3x")).toBe("unknown-token");
    expect(refused("@Mitoshi_app")).toBe("empty");
  });
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])("never treats inherited key %s as an asset or side", (token) => {
    expect(refused(`${token} btc 5 15m`)).toBe("no-side");
    expect(refused(`${token} up 5 15m`)).toBe("no-asset");
    expect(ok(`${token} btc up 5 15m`)).toMatchObject({ side: "up", asset: "BTC" });
  });
  it("builds the post the builder copies, and it parses back to the same call", () => {
    const text = xInstructionText("Mitoshi_app", "TSLA", "down", "15m", "2.5");
    expect(text).toBe("@Mitoshi_app $TSLA DOWN 15m $2.5");
    expect(ok(text)).toEqual({ side: "down", asset: "TSLA", cadence: "15m", intervalSec: 900, stakeBase: 2_500_000n });
    expect(xInstructionText("@Mitoshi_app", "BTC", "up", "5m", "5")).toBe("@Mitoshi_app BTC UP 5m $5");
  });
  it("reads a share link's stake field with the same rules", () => {
    expect(parseStakeBase("$5", DEC)).toBe(5_000_000n);
    expect(parseStakeBase("0", DEC)).toBeNull();
    expect(parseStakeBase("5.0000001", DEC)).toBeNull();
    expect(parseStakeBase("abc", DEC)).toBeNull();
  });
});
