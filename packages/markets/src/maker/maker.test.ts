import { describe, expect, it } from "vitest";
import { decodeFunctionData, maxUint256, type Address, type Hex } from "viem";
import { marketMakerVaultAbi } from "@cwf/clients/abis/MarketMakerVault";
import { TEMPO } from "@cwf/clients";
import { OPEN_POSTURE, toMarketId, type TxIntent } from "@cwf/core";
import { evaluate } from "../relay/engine";
import { POLICIES } from "../relay/policies";
import type { RelayRequest } from "../relay/types";
import { encodeMakerIntent } from "./calls";
import { makerVenueOf } from "./deployment";
import { foldSupplyLedger, reserveAt } from "./ledger";
import { isSettledStatus, toMakerParams, toMakerWindowView } from "./read";

const CHAIN = 42431;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const M = toMarketId(`0x${"c3".repeat(32)}`);
const config = { chainId: CHAIN, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "d", region: OPEN_POSTURE, nowSec: 1_000 };
const req = (calls: { to: Address; data: Hex }[]): RelayRequest => ({ chainId: CHAIN, from: USER, calls: calls.map((c) => ({ ...c, value: 0n })), gas: 1_000_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null });
const enc = (i: TxIntent) => {
  const r = encodeMakerIntent(i, { chainId: CHAIN, wallet: USER });
  if (!r?.ok) throw new Error(`not encoded: ${r ? r.diagnosis.technical : "unclaimed"}`);
  return r.value;
};

describe("maker vault intents → the relay (D-118)", () => {
  it("is deployed on Moderato and is the ledger's maker reserve", () => {
    const d = makerVenueOf(CHAIN);
    expect(d?.marketMakerVault).toBe("0xa31F6B5a585fF331cC13Fd1c6FAa282024Ca32a6");
    expect(reserveAt("maker", CHAIN)).toEqual({ address: d!.marketMakerVault, fromBlock: d!.fromBlock });
    expect(reserveAt("range", CHAIN)?.address).toBeDefined();
  });

  it("supply is [approve(vault, exact), supply]: self-paid, and the relay refuses it as capital intake", async () => {
    const s = enc({ kind: "maker-supply", amountBase: 25_000_000n });
    expect(s.sponsored).toBe(false);
    expect(s.calls).toHaveLength(2);
    expect(s.calls[0]!.to).toBe(TEMPO.pathUSD);
    const supply = decodeFunctionData({ abi: marketMakerVaultAbi, data: s.calls[1]!.data });
    expect(supply).toMatchObject({ functionName: "supply", args: [25_000_000n] });
    expect(await evaluate(config, req(s.calls), ctx)).toMatchObject({ ok: false, code: "never" });
  });

  it("withdraw, merge, settle and pull are one sponsored call each", async () => {
    for (const i of [{ kind: "maker-withdraw", shares: 1_000_000n }, { kind: "maker-merge", marketId: M }, { kind: "maker-settle", marketId: M }, { kind: "maker-pull", marketId: M }] as TxIntent[]) {
      const e = enc(i);
      expect(e.sponsored).toBe(true);
      expect(e.calls).toHaveLength(1);
      expect(await evaluate(config, req(e.calls), ctx)).toMatchObject({ ok: true, area: "maker" });
    }
  });

  it("refuses a zero supply or withdraw before anything is signed, and an undeployed chain", () => {
    expect(encodeMakerIntent({ kind: "maker-supply", amountBase: 0n }, { chainId: CHAIN, wallet: USER })).toMatchObject({ ok: false, diagnosis: { errorName: "ZeroAmount" } });
    expect(encodeMakerIntent({ kind: "maker-withdraw", shares: 0n }, { chainId: CHAIN, wallet: USER })).toMatchObject({ ok: false, diagnosis: { errorName: "ZeroAmount" } });
    expect(encodeMakerIntent({ kind: "maker-supply", amountBase: 1n }, { chainId: 4217, wallet: USER })).toMatchObject({ ok: false, diagnosis: { kind: "not-deployed" } });
    expect(encodeMakerIntent({ kind: "noop" }, { chainId: CHAIN, wallet: USER })).toBeNull();
  });
});

describe("the vault's figures as the page reads them", () => {
  it("params in declaration order", () => {
    expect(toMakerParams([6000, 20_000n, 50_000n, 950_000n, 20_000_000n, 200_000_000n, 8, 45])).toEqual({
      maxExposureBps: 6000, minSpreadRaw: 20_000n, minPriceRaw: 50_000n, maxPriceRaw: 950_000n, maxQuantityRaw: 20_000_000n, maxWindowDeployedBase: 200_000_000n, maxOpenWindows: 8, minTimeLeftSec: 45,
    });
  });

  it("a Window's book: deployed floors at zero, realized only once settled (the S8 gate's Window: +0.118)", () => {
    const open = toMakerWindowView(M, { escrowOut: 3_840_000n, escrowBack: 958_000n, merged: 2_000_000n, payout: 0n, realized: 0n, openedAtSec: 1n, settledAtSec: 0n, quoteCount: 2, settled: false }, [2_000_000n, 0n]);
    expect(open).toMatchObject({ deployedBase: 882_000n, realizedBase: null, settledAtSec: null, yesRaw: 2_000_000n, quoteCount: 2 });
    const settled = toMakerWindowView(M, { escrowOut: 3_840_000n, escrowBack: 958_000n, merged: 2_000_000n, payout: 1_000_000n, realized: 118_000n, openedAtSec: 1n, settledAtSec: 9n, quoteCount: 2, settled: true }, [0n, 0n]);
    expect(settled).toMatchObject({ deployedBase: 0n, realizedBase: 118_000n, settledAtSec: 9 });
  });

  it("settle lands only once the engine resolved or voided the Window (the earn-quoter's own rule)", () => {
    expect([0, 1, 2, 4, 5].map(isSettledStatus)).toEqual([false, false, false, true, true]);
  });

  it("the supply ledger folds supplies and redemptions apart", () => {
    const l = foldSupplyLedger([{ kind: "supplied", amountBase: 50_000_000n }, { kind: "redeemed", amountBase: 25_059_000n }, { kind: "supplied", amountBase: 1n }], 10n, 20n);
    expect(l).toEqual({ suppliedBase: 50_000_001n, withdrawnBase: 25_059_000n, supplies: 2, withdrawals: 1, fromBlock: 10n, toBlock: 20n });
  });
});
