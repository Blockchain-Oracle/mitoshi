import { describe, expect, it } from "vitest";
import { decodeFunctionData, getAddress, type Address } from "viem";
import { Abis } from "viem/tempo";
import { eventVaultAbi } from "@cwf/clients/abis/EventVault";
import { toMarketId, type TxIntent, type VaultGrant } from "@cwf/core";
import { OrderRefusedError } from "../submitter/errors";
import { encodeVaultIntent } from "./calls";
import { eventVaultV2Abi } from "@cwf/clients/abis/EventVaultV2";
import { legacyVaultDeploymentsOf, vaultDeploymentAt } from "./read";
import { assertGrantCovers } from "./order";
import { vaultDeploymentOf, vaultOutcomeId } from "./read";

const MODERATO = 42431;
const OWNER = "0x118d23ee8f38666be9987e95f023b4b444651ff0" as Address;
const KEY = "0x8ae1c05a4038bad04d17b763a15bfd791f524d0a" as Address;
const M = toMarketId("0x42bd67a68cdb00c58657eb826592605acc9787a014ce132c85e08e8c1b7ea56c");
const OTHER = toMarketId(`0x${"77".repeat(32)}`);
const vault = vaultDeploymentOf(MODERATO)!;
const terms = { kind: "session" as const, actor: KEY, caps: { maxStakePerTradeBase: 2_000_000n, maxDailySpendBase: 5_000_000n, maxOpenPositions: 3, maxPriceRaw: 950_000n, market: null }, expiresAtSec: 2_000_000_000, budgetBase: 5_000_000n };
const encode = (intent: TxIntent) => {
  const r = encodeVaultIntent(intent, { chainId: MODERATO, wallet: OWNER });
  if (!r?.ok) throw new Error("expected an encoding");
  return r.value;
};
const fn = (data: `0x${string}`) => decodeFunctionData({ abi: eventVaultAbi, data }).functionName;

describe("vault intents → calls (C.2.3 vault rows)", () => {
  it("targets the current Moderato vault (v2, S24.1) with pathUSD as its collateral; the previous ones stay to empty", () => {
    expect(vault.eventVault).toBe(getAddress("0x6f05b0dcaa31c241a4f6e8ceb170090b41679e95"));
    expect(vault.version).toBe(2);
    const legacy = legacyVaultDeploymentsOf(42431);
    const v1 = legacy.at(-1)!;
    expect(v1.eventVault).toBe(getAddress("0x5E38dc8b7402FFB608134872a64663e5D75235b8"));
    expect([v1.version, v1.fromBlock]).toEqual([1, 37_385_655n]);
    expect(vaultDeploymentAt(42431, v1.eventVault)?.version).toBe(1);
    // A withdraw may empty any previous vault, each on its own area; every other intent goes to the current one.
    for (const previous of legacy) {
      const out = encodeVaultIntent({ kind: "vault-withdraw", amountBase: 1n, vault: previous.eventVault }, { chainId: 42431 } as never);
      expect(out?.ok && [out.value.calls[0]!.to, out.value.area]).toEqual([previous.eventVault, previous.version === 2 ? "vault2" : "vault"]);
    }
  });

  it("the EXIT grant names the keeper, its tolerance and its slack, on the current vault only (D-213)", () => {
    const e = encode({ kind: "vault-grant-exit", actor: KEY, market: null, expiresAtSec: 2_000_000_000, toleranceBps: 1_500, slackBps: 1_000 });
    expect([e.area, e.sponsored, e.calls[0]!.to]).toEqual(["vault2", false, vault.eventVault]);
    const call = decodeFunctionData({ abi: eventVaultV2Abi, data: e.calls[0]!.data });
    expect([call.functionName, ...(call.args ?? [])]).toEqual(["grantExit", getAddress(KEY), `0x${"0".repeat(64)}`, 2_000_000_000n, 1_500, 1_000]);
  });

  it("capital intake and delegation setup are root-signed and never sponsored; intake carries its exact approve", () => {
    const arm = encode({ kind: "vault-deposit-and-grant", amountBase: 5_000_000n, terms });
    expect(arm.sponsored).toBe(false);
    expect(arm.calls.map((c) => c.to)).toEqual([vault.collateral, vault.eventVault]);
    const approve = decodeFunctionData({ abi: Abis.tip20, data: arm.calls[0]!.data });
    expect(approve.functionName).toBe("approve");
    expect(approve.args).toEqual([vault.eventVault, 5_000_000n]);
    const call = decodeFunctionData({ abi: eventVaultAbi, data: arm.calls[1]!.data });
    expect(call.functionName).toBe("depositAndGrant");
    const [, kind, actor, caps] = call.args as unknown as [bigint, number, Address, { market: string }];
    expect([kind, actor.toLowerCase(), caps.market]).toEqual([0, KEY, `0x${"0".repeat(64)}`]);
    for (const intent of [{ kind: "vault-deposit", amountBase: 1n }, { kind: "vault-grant", terms }, { kind: "vault-fund-grant", grantId: 3n, amountBase: 25_000_000n }, { kind: "vault-move-private", amountBase: 1n }, { kind: "vault-deposit-and-fund", grantId: 3n, amountBase: 25_000_000n }] as TxIntent[]) {
      expect(encode(intent).sponsored, intent.kind).toBe(false);
    }
  });

  it("add to budget from the wallet is one root transaction: exact approve, deposit, fundGrant", () => {
    const add = encode({ kind: "vault-deposit-and-fund", grantId: 3n, amountBase: 25_000_000n });
    expect(add.sponsored).toBe(false);
    expect(add.calls.map((c) => c.to)).toEqual([vault.collateral, vault.eventVault, vault.eventVault]);
    expect([fn(add.calls[1]!.data), fn(add.calls[2]!.data)]).toEqual(["deposit", "fundGrant"]);
  });

  it("exits and housekeeping are one sponsored call each", () => {
    const cases: [TxIntent, string][] = [
      [{ kind: "vault-withdraw", amountBase: 4_980_000n }, "withdraw"],
      [{ kind: "vault-withdraw-private", amountBase: 1n }, "withdrawPrivate"],
      [{ kind: "vault-revoke", grantId: 1n }, "revoke"],
      [{ kind: "vault-crank-settle", owner: OWNER, marketId: M }, "crankSettle"],
      [{ kind: "vault-sweep", marketId: M }, "sweep"],
    ];
    for (const [intent, name] of cases) {
      const e = encode(intent);
      expect([e.sponsored, e.calls.length, fn(e.calls[0]!.data), e.area]).toEqual([true, 1, name, "vault2"]);
    }
  });

  it("refuses a zero amount before encoding, and answers not-deployed where there is no vault", () => {
    expect(encodeVaultIntent({ kind: "vault-withdraw", amountBase: 0n }, { chainId: MODERATO, wallet: OWNER })).toMatchObject({ ok: false, diagnosis: { errorName: "ZeroAmount" } });
    expect(encodeVaultIntent({ kind: "vault-withdraw", amountBase: 1n }, { chainId: 4217, wallet: OWNER })).toMatchObject({ ok: false, diagnosis: { kind: "not-deployed" } });
    expect(encodeVaultIntent({ kind: "redeem", marketId: M }, { chainId: MODERATO, wallet: OWNER })).toBeNull();
  });

  it("outcome ids are the contract's keccak256(abi.encode(marketId, idx))", () => {
    // Read back from the deployed vault (`outcomeId(0x42bd…, 0)`, cast call, 2026-09-30).
    expect(vaultOutcomeId(M, 0)).toBe(1668092575005841711436417078272434100954967236830413069866059771981297743249n);
    expect(vaultOutcomeId(M, 1)).toBe(12306587273293151523687017327685211085036561535532823087865240206611222522152n);
  });
});

describe("a session tap against its grant (the contract's order)", () => {
  const grant: VaultGrant = { grantId: 1n, owner: OWNER, actor: KEY, kind: "session", revoked: false, expiresAtSec: 2_000_000_000, spentDay: 0, spentTodayBase: 0n, openPositions: 0, caps: { ...terms.caps, market: M }, budgetBase: 5_000_000n };
  const tap = { grant, actor: KEY, marketId: M, side: "up" as const, limitPriceRaw: 520_000n, contractsRaw: 1_000_000n, worstCostBase: 520_000n, heldRaw: 0n, nowSec: 1_800_000_000, decimals: 6 };
  const nameOf = (f: () => void) => {
    try {
      f();
      return null;
    } catch (e) {
      return e instanceof OrderRefusedError ? e.diagnosis.errorName : "threw";
    }
  };

  it("passes inside every cap", () => expect(nameOf(() => assertGrantCovers(tap))).toBeNull());
  it("names each refusal the way the vault reverts", () => {
    expect(nameOf(() => assertGrantCovers({ ...tap, actor: OWNER }))).toBe("NotGrantActor");
    expect(nameOf(() => assertGrantCovers({ ...tap, marketId: OTHER }))).toBe("OutsideGrantMarket");
    expect(nameOf(() => assertGrantCovers({ ...tap, limitPriceRaw: 990_000n }))).toBe("OverPriceCap");
    expect(nameOf(() => assertGrantCovers({ ...tap, grant: { ...grant, budgetBase: 1_000_000n }, worstCostBase: 2_400_000n, contractsRaw: 4_000_000n, limitPriceRaw: 600_000n }))).toBe("Insufficient");
    expect(nameOf(() => assertGrantCovers({ ...tap, grant: { ...grant, spentDay: 20_833, spentTodayBase: 4_800_000n } }))).toBe("OverDailyCap");
    expect(nameOf(() => assertGrantCovers({ ...tap, grant: { ...grant, openPositions: 3 } }))).toBe("OverPositionCap");
    expect(nameOf(() => assertGrantCovers({ ...tap, grant: { ...grant, revoked: true } }))).toBe("GrantIsRevoked");
  });
  it("checks the per-tap cap at the worst the fill can charge, so it never passes a tap the chain would refuse", () => {
    expect(nameOf(() => assertGrantCovers({ ...tap, worstCostBase: 2_000_001n, contractsRaw: 4_000_000n, limitPriceRaw: 500_000n }))).toBe("OverStakeCap");
  });
});
