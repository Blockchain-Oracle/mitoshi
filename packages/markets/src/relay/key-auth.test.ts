import { describe, expect, it } from "vitest";
import { normalizeKeyAuthorization } from "./key-auth";

const ENGINE = "0x113Ca86bE942671E5290Ed57d86297F0Ecd61b6a";
const PATH = "0x20C0000000000000000000000000000000000000";

describe("tx-level key authorization in a sponsorship request (D-136)", () => {
  it("reads viem's shape (signature strings resolved to selectors)", () => {
    const k = normalizeKeyAuthorization({ address: "0x00000000000000000000000000000000000000c3", "expiry": 1_086_400, limits: [{ token: PATH, limit: 25_000_000n, period: 86_400 }], scopes: [{ address: ENGINE, selector: "redeem(bytes32)" }, { address: PATH, selector: "0x095ea7b3", recipients: [ENGINE] }] })!;
    expect(k).toMatchObject({ isAdmin: false, expirySec: 1_086_400, limits: [{ limit: 25_000_000n, periodSec: 86_400 }] });
    expect(k.scopes![0]!.selector).toBe("0xeda1122c");
    expect(k.scopes![1]).toMatchObject({ selector: "0x095ea7b3", recipients: [ENGINE] });
  });

  it("reads the node's RPC shape (keyId, hex limits, allowedCalls with selector rules) and marks a missing rule set unrestricted-per-target", () => {
    const k = normalizeKeyAuthorization({ keyId: "0x00000000000000000000000000000000000000c3", "expiry": "0x10937c", isAdmin: false, limits: [{ token: PATH, limit: "0x17d7840", period: "0x15180" }], allowedCalls: [{ target: ENGINE, selectorRules: [{ selector: "0xeda1122c" }] }, { target: PATH }] })!;
    expect(k).toMatchObject({ expirySec: 1_086_332, limits: [{ limit: 25_000_000n, periodSec: 86_400 }] });
    expect(k.scopes!.map((s) => s.selector)).toEqual(["0xeda1122c", "0x00000000"]);
  });

  it("absent → null; no scopes field → unrestricted (null scopes); malformed → throws", () => {
    expect(normalizeKeyAuthorization(undefined)).toBeNull();
    expect(normalizeKeyAuthorization({ address: "0x00000000000000000000000000000000000000c3" })!.scopes).toBeNull();
    expect(() => normalizeKeyAuthorization({ address: "nope" })).toThrow();
  });
});
