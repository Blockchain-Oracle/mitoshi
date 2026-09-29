// Ported from Masayume 68f7a09:packages/core/src/games/matchmaking.test.ts
import { describe, expect, it } from "vitest";
import { BASE_BAND, findOpponent, isCompatible, MAX_BAND, queueKey, searchBand, type QueueEntry } from "./matchmaking";

const AT = 1_700_000_000_000;

function entry(overrides: Partial<QueueEntry> = {}): QueueEntry {
  return {
    wallet: "0x1111111111111111111111111111111111111111",
    rating: 1000,
    queuedAtMs: AT,
    connectionId: "c1",
    clientSeedCommitment: "0xseed",
    ...overrides,
  };
}

describe("matchmaking", () => {
  it("never mixes modes, tiers or regions in one room", () => {
    expect(queueKey("ranked", "t5", "eu")).toBe("ranked:t5:eu");
    expect(queueKey("free", "free", "eu")).not.toBe(queueKey("ranked", "free", "eu"));
  });

  it("widens the search every fifteen seconds and then stops", () => {
    expect(searchBand(0)).toBe(BASE_BAND);
    expect(searchBand(14_999)).toBe(100);
    expect(searchBand(15_000)).toBe(150);
    expect(searchBand(60_000)).toBe(300);
    expect(searchBand(10 * 60_000)).toBe(MAX_BAND);
  });

  it("lets the player who waited longer reach a newcomer outside the newcomer's own band", () => {
    const patient = entry({ wallet: "0xaaaa111111111111111111111111111111111111", rating: 1000, queuedAtMs: AT - 90_000 });
    const fresh = entry({ wallet: "0xbbbb111111111111111111111111111111111111", rating: 1300, queuedAtMs: AT });
    // 300 apart: outside the newcomer's ±100, inside the patient player's widened ±400.
    expect(isCompatible(fresh, patient, AT)).toBe(true);
    expect(Math.abs(fresh.rating - patient.rating)).toBeGreaterThan(BASE_BAND);
  });

  it("refuses a pairing nobody's band reaches, and never pairs a wallet with itself", () => {
    const a = entry({ wallet: "0xaaaa111111111111111111111111111111111111", rating: 1000 });
    const b = entry({ wallet: "0xbbbb111111111111111111111111111111111111", rating: 1600 });
    expect(isCompatible(a, b, AT)).toBe(false);
    expect(isCompatible(a, { ...a }, AT)).toBe(false);
  });

  it("drains the queue oldest first among everyone in band", () => {
    const self = entry({ wallet: "0x9999111111111111111111111111111111111111" });
    const newer = entry({ wallet: "0xaaaa111111111111111111111111111111111111", rating: 1010, queuedAtMs: AT - 1_000 });
    const older = entry({ wallet: "0xbbbb111111111111111111111111111111111111", rating: 1050, queuedAtMs: AT - 20_000 });
    expect(findOpponent(self, [newer, older], AT)?.wallet).toBe(older.wallet);
    expect(findOpponent(self, [], AT)).toBeNull();
  });
});
