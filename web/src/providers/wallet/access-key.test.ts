import { describe, expect, it } from "vitest";
import { normalizeKeyAuthorization, walletKeyRule } from "@cwf/markets/server";
import { accessKeyPolicy, requestArm, walletKeyRpcParams, walletKeyTerms } from "./access-key";

const KEY_ID = "0x00000000000000000000000000000000000000aa";

describe("wallet-mode key terms (D-047, D-136)", () => {
  it("are the exact shape the relay's engine rule sponsors publishing", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const terms = walletKeyTerms(nowSec)!;
    expect(terms).not.toBeNull();
    // What the accounts SDK publishes: the RPC params we send, plus the key it generated.
    const published = normalizeKeyAuthorization({ ...walletKeyRpcParams(terms), address: KEY_ID });
    expect(walletKeyRule.check(published!, nowSec)).toBeNull();
    expect(published!.limits).toEqual([{ token: terms.limits[0]!.token, limit: 25_000_000n, periodSec: 86_400 }]);
  });

  it("widening any term is refused, so the UI cannot drift from the relay", () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const terms = walletKeyTerms(nowSec)!;
    const wider = { ...walletKeyRpcParams({ ...terms, limits: [{ ...terms.limits[0]!, limit: 26_000_000n }] }), address: KEY_ID };
    expect(walletKeyRule.check(normalizeKeyAuthorization(wider)!, nowSec)).toMatch(/over the cap/);
  });

  it("the connector hook answers only while an arm runs (sign-up never adds a prompt)", () => {
    expect(accessKeyPolicy()).toBeUndefined();
    requestArm(true);
    expect(accessKeyPolicy()?.scopes.length).toBe(6);
    requestArm(false);
    expect(accessKeyPolicy()).toBeUndefined();
  });
});
