// Ported from Masayume 68f7a09:packages/core/src/private/protocol.test.ts
import { describe, expect, it } from "vitest";
import { PRIVATE_AUTH_TTL_MS, privateAuthFresh, privateOpenMessage } from "./protocol";
import { privateCashoutRequestSchema, privateOpenRequestSchema } from "./protocol-schema";

const INPUT = {
  owner: "0xD357A1b7F6E1C2d3E4F5061728394A5B6C7D9358",
  contract: "0x4356F421bFAf8BFEEf5188C3A511aD79A5947c67",
  chainId: 50312,
  marketId: `0x${"11".repeat(32)}`,
  asset: "BTC",
  cadenceText: "5m",
  expirySec: 1_788_400_300,
  side: "up" as const,
  stakeText: "10.00",
  symbol: "tUSDC",
  issuedAtMs: 1_788_400_000_000,
  commitment: `0x${"cc".repeat(32)}`,
};

describe("privateOpenMessage", () => {
  it("names the actual bet, in a fixed order the desk rebuilds byte for byte", () => {
    expect(privateOpenMessage(INPUT)).toBe(
      [
        "Mitoshi — private bet",
        "",
        "Side: UP",
        "Stake: 10.00 tUSDC",
        "Window: BTC 5m, closes 2026-09-03T01:51:40.000Z",
        `Market: 0x${"11".repeat(32)}`,
        "Desk: 0x4356f421bfaf8bfeef5188c3a511ad79a5947c67 on chain 50312",
        "Wallet: 0xd357a1b7f6e1c2d3e4f5061728394a5b6c7d9358",
        `Keys: 0x${"cc".repeat(32)}`,
        "Issued: 2026-09-03T01:46:40.000Z",
        "",
        "Signing lets the desk place this one bet from your private balance. It moves no funds by itself and costs nothing. Kept separate from your wallet, so it is harder to link back to you — not anonymous.",
      ].join("\n"),
    );
  });

  it("changes with every field that changes the bet", () => {
    const base = privateOpenMessage(INPUT);
    expect(privateOpenMessage({ ...INPUT, side: "down" })).not.toBe(base);
    expect(privateOpenMessage({ ...INPUT, commitment: `0x${"ce".repeat(32)}` })).not.toBe(base);
    expect(privateOpenMessage({ ...INPUT, stakeText: "10.01" })).not.toBe(base);
    expect(privateOpenMessage({ ...INPUT, issuedAtMs: INPUT.issuedAtMs + 1 })).not.toBe(base);
    expect(privateOpenMessage({ ...INPUT, chainId: 1 })).not.toBe(base);
    expect(privateOpenMessage({ ...INPUT, contract: `0x${"ab".repeat(20)}` })).not.toBe(base);
  });
});

describe("privateAuthFresh", () => {
  it("accepts inside the window and refuses stale or future-dated", () => {
    const now = 1_788_400_100_000;
    expect(privateAuthFresh(now - 1_000, now)).toBe(true);
    expect(privateAuthFresh(now - PRIVATE_AUTH_TTL_MS - 1, now)).toBe(false);
    expect(privateAuthFresh(now + 30_000, now)).toBe(true);
    expect(privateAuthFresh(now + 61_000, now)).toBe(false);
  });
});

describe("the wire schemas", () => {
  it("refuse a claim with a stake that is not a decimal string or an outcome that is not 0/1", () => {
    const claim = { owner: INPUT.owner, slotId: `0x${"aa".repeat(32)}`, creditKey: `0x${"bb".repeat(32)}`, marketId: INPUT.marketId, outcomeIdx: 0, stakeBase: "10000000", issuedAtMs: 1 };
    expect(privateCashoutRequestSchema.safeParse({ claim, signature: "0xab" }).success).toBe(true);
    expect(privateCashoutRequestSchema.safeParse({ claim: { ...claim, stakeBase: "10.5" }, signature: "0xab" }).success).toBe(false);
    expect(privateCashoutRequestSchema.safeParse({ claim: { ...claim, outcomeIdx: 2 }, signature: "0xab" }).success).toBe(false);
  });

  it("accepts the open request the browser sends", () => {
    const parsed = privateOpenRequestSchema.safeParse({ owner: INPUT.owner, marketId: INPUT.marketId, side: "up", stakeBase: "10000000", minQuantityRaw: "15000000", issuedAtMs: INPUT.issuedAtMs, signature: "0xab", secret: `0x${"dd".repeat(32)}` });
    expect(parsed.success).toBe(true);
  });
});
