import { describe, expect, it } from "vitest";
import { simulateCaps, utcDayOf, type Address, type MarketsSubmitter, type OrderOutcome, type VaultGrant, type VaultSnapshot } from "@cwf/core";
import type { MarketsSubmitter as Submitter } from "@cwf/markets";
import { routeTaps } from "@/providers/wallet/tap-session";
import { fallbackOf, PRESETS, termsOf, topUpBase } from "./caps";
import { deriveStatus } from "./view";

const OWNER = "0x00000000000000000000000000000000000000a1" as Address;
const KEY = "0x00000000000000000000000000000000000000b2" as Address;
const NOW = 1_790_760_000;
const grant = (over: Partial<VaultGrant> = {}): VaultGrant => ({
  grantId: 7n, owner: OWNER, actor: KEY, kind: "session", revoked: false, expiresAtSec: NOW + 3600, spentDay: utcDayOf(NOW), spentTodayBase: 0n, openPositions: 0,
  caps: { maxStakePerTradeBase: 5_000_000n, maxDailySpendBase: 25_000_000n, maxOpenPositions: 4, maxPriceRaw: 950_000n, market: null }, budgetBase: 25_000_000n, ...over,
});
const snapshot = (g: VaultGrant | null): VaultSnapshot => ({ deployment: { chainId: 42431, eventVault: OWNER, collateral: OWNER, fromBlock: 0n }, account: { availableBase: 0n, privateAvailableBase: 0n, totalDepositedBase: 0n, totalWithdrawnBase: 0n }, grants: { session: g, executor: null, strategy: null }, decimals: 6 });
const status = (over: Partial<Parameters<typeof deriveStatus>[0]>) => deriveStatus({ owner: OWNER, passkey: true, snapshot: snapshot(grant()), keyLoaded: true, keyAddress: KEY, nowSec: NOW, ...over });

describe("tap-trading status (one place, facts only)", () => {
  it("is armed only when this browser holds the grant's own key and the grant is live", () => {
    expect(status({})).toBe("armed");
    expect(status({ keyAddress: null })).toBe("grant-without-key");
    expect(status({ keyAddress: OWNER })).toBe("grant-without-key");
    expect(status({ nowSec: NOW + 3601 })).toBe("expired");
    expect(status({ snapshot: snapshot(grant({ revoked: true })) })).toBe("disarmed");
    expect(status({ snapshot: snapshot(null) })).toBe("disarmed");
  });
  it("names what is missing before it: no wallet, a wallet that can't, no vault, still reading", () => {
    expect(status({ owner: null })).toBe("no-wallet");
    expect(status({ passkey: false })).toBe("not-passkey");
    expect(status({ snapshot: null })).toBe("not-deployed");
    expect(status({ snapshot: undefined })).toBe("loading");
    expect(status({ keyLoaded: false })).toBe("loading");
  });
});

describe("the arm's terms and the CTA's fallback reasons", () => {
  it("sets aside the budget as the deposit, session kind, any Window, the preset's caps", () => {
    const { amountBase, terms } = termsOf(PRESETS.standard, "h24", KEY, NOW);
    expect(amountBase).toBe(25_000_000n);
    expect(terms).toMatchObject({ kind: "session", actor: KEY, expiresAtSec: NOW + 86_400, budgetBase: 25_000_000n, caps: { maxStakePerTradeBase: 5_000_000n, maxDailySpendBase: 25_000_000n, maxOpenPositions: 4, maxPriceRaw: 950_000n, market: null } });
  });
  it("a used budget reads 'Budget used — add $X' and its fix adds to the budget", () => {
    const used = grant({ budgetBase: 400_000n, spentTodayBase: 3_000_000n });
    const v = simulateCaps({ grant: used, nowSec: NOW, sidePriceRaw: 500_000n, quantityRaw: 2_000_000n, spendBase: 1_000_000n, one: 1_000_000n, opensNewPosition: true });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(fallbackOf(v.refusal, used)).toEqual({ reason: "Budget used — add $24.60", fix: "add-budget" });
    expect(topUpBase(used)).toBe(24_600_000n);
  });
  it("every other refusal is named on the CTA; only expiry and budget carry a one-step fix", () => {
    const g = grant();
    expect(fallbackOf({ kind: "daily", wouldBeBase: 26_000_000n, capBase: 25_000_000n }, g)).toEqual({ reason: "Today's $25 used — resets 00:00 UTC", fix: null });
    expect(fallbackOf({ kind: "stake", spendBase: 6_000_000n, capBase: 5_000_000n }, g)).toEqual({ reason: "Over your $5 per tap — lower the stake", fix: null });
    expect(fallbackOf({ kind: "price", sidePriceRaw: 990_000n, capRaw: 950_000n }, g)).toEqual({ reason: "Dearer than your 95¢ cap", fix: null });
    expect(fallbackOf({ kind: "positions", wouldBe: 5, cap: 4 }, g).fix).toBeNull();
    expect(fallbackOf({ kind: "expired", expiresAtSec: NOW - 1 }, g)).toEqual({ reason: "Tap-trading expired — renew", fix: "renew" });
  });
});

describe("routing taps (S7): vault-grant calls to the session key, everything else keeps its signer", () => {
  const stub = (name: string, calls: string[]): Submitter => ({
    journal: {} as never, wallet: name as Address, hasSigner: () => true,
    submitTx: async () => (calls.push(`${name}:tx`), { status: "confirmed", txHash: "0x1" }),
    submitCashOut: async () => (calls.push(`${name}:cashout`), { status: "nothingFilled", txHash: "0x1" }),
    submitOrder: async (r) => (calls.push(`${name}:order:${r.route?.kind ?? "wallet"}:${r.wallet}`), { status: "confirmed", booked: { costBase: 970_000n } } as unknown as OrderOutcome),
  });
  it("sends a vault-grant call as the session key and books its cost; a wallet call goes to the wallet key", async () => {
    const calls: string[] = [];
    const booked: bigint[] = [];
    const routed: MarketsSubmitter = routeTaps(stub("walletKey", calls), stub("user", calls), stub("sessionKey", calls), (c) => booked.push(c));
    await routed.submitOrder({ route: { kind: "vault-grant", grantId: 7n }, wallet: OWNER } as never);
    await routed.submitOrder({ route: { kind: "wallet" }, wallet: OWNER } as never);
    await routed.submitTx({ kind: "noop" });
    await routed.submitCashOut({} as never);
    expect(calls).toEqual(["sessionKey:order:vault-grant:sessionKey", `walletKey:order:wallet:${OWNER}`, "walletKey:tx", "walletKey:cashout"]);
    expect(booked).toEqual([970_000n]);
  });
  it("without a wallet key, non-vault writes go to the account's own session", async () => {
    const calls: string[] = [];
    const routed = routeTaps(null, stub("user", calls), stub("sessionKey", calls), () => undefined);
    await routed.submitOrder({ route: { kind: "wallet" }, wallet: OWNER } as never);
    expect(calls).toEqual([`user:order:wallet:${OWNER}`]);
  });
});
