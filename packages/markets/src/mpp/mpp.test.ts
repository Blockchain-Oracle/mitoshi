import { decodeFunctionData, getAddress } from "viem";
import { Abis, Addresses } from "viem/tempo";
import { describe, expect, it } from "vitest";
import fixture from "./x10.fixture.json";
import { authorizePayerKeyCall, defaultPayerLimits, MPP_ESCROW, USDC_E } from "./access-key";
import { rankOffers, SpendLedger, type MppCaps } from "./caps";
import { offersOf, type MppOffer } from "./challenges";
import { currentReceiptScope, receiptRow, withReceiptScope } from "./receipts";

/** The real 402s recorded by spike X10 (scripts/mpp/probe.ts --fixture), replayed as responses — parsing only. */
const replay = (name: keyof typeof fixture.responses) => {
  const r = fixture.responses[name];
  return new Response(null, { status: r.status, headers: r.wwwAuthenticate ? { "www-authenticate": r.wwwAuthenticate } : {} });
};

const PATH_USD = "0x20c0000000000000000000000000000000000000";
const caps = (over: Partial<MppCaps> = {}): MppCaps => ({
  chainIds: [4217],
  currencies: { [USDC_E.toLowerCase()]: { perRequestBase: 2_000n, perDayBase: 2_000n }, [PATH_USD]: { perRequestBase: 2_000n, perDayBase: 2_000n } },
  intents: ["charge", "session"],
  ...over,
});

describe("X10 challenges", () => {
  it("anthropic offers charge in USDC.e / a second token / pathUSD and a session in USDC.e, all on mainnet with fees sponsored", () => {
    const offers = offersOf(replay("anthropic sonnet"));
    expect(offers.map((o) => o.intent)).toEqual(["charge", "charge", "charge", "session"]);
    expect(offers.every((o) => o.chainId === 4217 && o.feePayer && o.amountBase === 1_000n)).toBe(true);
    expect(offers[0]!.currency).toBe(getAddress(USDC_E));
    expect(offers[3]!.escrow).toBe(MPP_ESCROW);
  });
  it("the Tempo Indexer API offers only a session, charged on the queried network", () => {
    const [t] = offersOf(replay("tempo indexer testnet"));
    expect(t).toMatchObject({ intent: "session", chainId: 42431, amountBase: 100n, suggestedDepositBase: 10_000n, feePayer: false });
    expect(offersOf(replay("tempo indexer mainnet"))[0]!.chainId).toBe(4217);
  });
  it("a non-402 has no offers", () => {
    expect(offersOf(new Response("ok"))).toEqual([]);
  });
});

describe("caps", () => {
  const offers = () => offersOf(replay("anthropic sonnet"));
  it("prefers charge, drops currencies and chains that are not allowed", () => {
    const { allowed, refused } = rankOffers(offers(), caps());
    expect(allowed.map((o) => [o.intent, o.currency.toLowerCase()])).toEqual([
      ["charge", USDC_E.toLowerCase()],
      ["charge", PATH_USD],
      ["session", USDC_E.toLowerCase()],
    ]);
    expect(refused).toHaveLength(1);
    expect(rankOffers(offers(), caps({ chainIds: [42431] })).allowed).toEqual([]);
    expect(rankOffers(offers(), caps({ intents: ["charge"] })).allowed.every((o) => o.intent === "charge")).toBe(true);
  });
  it("refuses an amount above the per-request cap", () => {
    const tight = caps({ currencies: { [USDC_E.toLowerCase()]: { perRequestBase: 999n, perDayBase: 10_000n } } });
    expect(rankOffers(offers(), tight).refused.some((r) => /per-request cap/.test(r.reason))).toBe(true);
  });
  it("reserves against the daily budget, releases on failure and rolls over at UTC midnight", () => {
    let now = Date.UTC(2026, 8, 29, 23, 0);
    const ledger = new SpendLedger(caps(), () => now);
    const offer = offers()[0]!;
    const a = ledger.reserve(offer);
    const b = ledger.reserve(offer);
    expect("release" in a && "release" in b).toBe(true);
    expect(ledger.reserve(offer)).toMatchObject({ refused: expect.stringMatching(/daily budget/) });
    if ("release" in b) b.release();
    expect(ledger.spentToday(offer.currency)).toBe(1_000n);
    now = Date.UTC(2026, 8, 30, 0, 1);
    expect(ledger.spentToday(offer.currency)).toBe(0n);
  });
});

describe("receipt hook", () => {
  const offer: MppOffer = offersOf(replay("mpp.dev ping (testnet)"))[0]!;
  it("scopes nest and survive awaits", async () => {
    await withReceiptScope({ decisionId: "d1" }, async () => {
      await new Promise((r) => setTimeout(r, 1));
      await withReceiptScope({ purpose: "p" }, async () => {
        expect(currentReceiptScope()).toEqual({ decisionId: "d1", purpose: "p" });
      });
    });
    expect(currentReceiptScope()).toEqual({});
  });
  it("a charge row carries the transfer reference; a missing receipt is a failed row", () => {
    const paid = withReceiptScope({ decisionId: "d2" }, () =>
      receiptRow({ url: "https://mpp.dev/api/ping/paid", offer, payer: getAddress("0x1E8407b15C8Db0A73A17fb18E50dD4735Da59c0b"), receipt: JSON.parse('{"method":"tempo","reference":"0xabc","status":"success","timestamp":"t"}'), nowMs: 1 }),
    );
    expect(paid).toMatchObject({ status: "paid", intent: "charge", reference: "0xabc", amountBase: 100_000n, chainId: 42431, host: "mpp.dev", scope: { decisionId: "d2" }, channelId: null });
    const failed = receiptRow({ url: "https://mpp.dev/api/ping/paid", offer, payer: getAddress("0x1E8407b15C8Db0A73A17fb18E50dD4735Da59c0b"), receipt: null, failure: "status 500" });
    expect(failed).toMatchObject({ status: "failed", reference: null, raw: { failure: "status 500" } });
  });
});

describe("payer access key", () => {
  it("encodes authorizeKey with enforced daily limits, no any-call, token transfer scopes and the escrow", () => {
    const keyId = getAddress("0x962FDD761CE177bCce66326ff936212A75d91575");
    const call = authorizePayerKeyCall({ keyId, limits: defaultPayerLimits("mainnet") });
    expect(call.to).toBe(getAddress(Addresses.accountKeychain));
    const { functionName, args } = decodeFunctionData({ abi: Abis.accountKeychain, data: call.data });
    expect(functionName).toBe("authorizeKey");
    const [id, sigType, config] = args as unknown as [string, number, Record<"expiry", bigint> & { enforceLimits: boolean; allowAnyCalls: boolean; limits: { period: bigint }[]; allowedCalls: { target: string; selectorRules: unknown[] }[] }];
    expect(id).toBe(keyId);
    expect(sigType).toBe(0);
    expect(config.enforceLimits).toBe(true);
    expect(config.allowAnyCalls).toBe(false);
    expect(config.expiry).toBe(2n ** 64n - 1n);
    expect(config.limits.every((l) => l.period === 86_400n)).toBe(true);
    expect(config.allowedCalls.map((c) => c.target)).toEqual([getAddress(USDC_E), getAddress(PATH_USD), MPP_ESCROW]);
    expect(config.allowedCalls[2]!.selectorRules).toEqual([]);
  });
  it("refuses duplicate or empty limits", () => {
    const keyId = getAddress("0x962FDD761CE177bCce66326ff936212A75d91575");
    expect(() => authorizePayerKeyCall({ keyId, limits: [] })).toThrow(/at least one/);
    const l = defaultPayerLimits("testnet")[0]!;
    expect(() => authorizePayerKeyCall({ keyId, limits: [l, l] })).toThrow(/duplicate/);
  });
});

describe("payer from env", () => {
  const key = `0x${"11".repeat(32)}`;
  const root = "0x1E8407b15C8Db0A73A17fb18E50dD4735Da59c0b";
  it("refuses mainnet without the owner's go (Q-020) and names what is missing", async () => {
    const { mppPayerFromEnv } = await import("./env");
    expect(mppPayerFromEnv(undefined, { NETWORK: "mainnet", MPP_PAYER_PRIVATE_KEY: key, MPP_ROOT_ADDRESS: root })).toMatchObject({ payer: null, reason: expect.stringMatching(/Q-020/) });
    expect(mppPayerFromEnv(undefined, { NETWORK: "testnet" })).toMatchObject({ payer: null, reason: expect.stringMatching(/MPP_PAYER_PRIVATE_KEY/) });
    const ok = mppPayerFromEnv(undefined, { NETWORK: "testnet", MPP_PAYER_PRIVATE_KEY: key, MPP_ROOT_ADDRESS: root, MPP_MAX_PER_DAY_BASE: "1000" });
    expect(ok.payer?.account.address).toBe(root);
    expect("caps" in ok && ok.caps.currencies[PATH_USD]).toEqual({ perRequestBase: 50_000n, perDayBase: 1_000n });
  });
});
