import { describe, expect, it } from "vitest";
import { encodeErrorResult, maxUint256, type Address, type Hex } from "viem";
import { OPEN_POSTURE, postureOf, toMarketId, type TxIntent } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { parlayReserveAbi } from "@cwf/clients/abis/ParlayReserve";
import { evaluate } from "../relay/engine";
import { POLICIES } from "../relay/policies";
import type { RelayRequest } from "../relay/types";
import { encodeParlayIntent } from "./encoders";
import { diagnoseParlay } from "./errors";
import { parlayVenueOf } from "./deployment";
import { parseRefusal } from "./refusal";

const CHAIN = 42431;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const A = toMarketId(`0x${"a1".repeat(32)}`);
const B = toMarketId(`0x${"b2".repeat(32)}`);
const config = { chainId: CHAIN, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "dev-1", region: OPEN_POSTURE, nowSec: 1_000 };
const req = (calls: { to: Address; data: Hex }[]): RelayRequest => ({
  chainId: CHAIN, from: USER, calls: calls.map((c) => ({ ...c, value: 0n })), gas: 2_000_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null,
});
const encode = (intent: TxIntent) => {
  const r = encodeParlayIntent(intent, { chainId: CHAIN, wallet: USER });
  if (!r?.ok) throw new Error(`not encoded: ${JSON.stringify(r)}`);
  return r.value;
};

describe("parlay intents → the relay (D-166)", () => {
  const open: TxIntent = { kind: "parlay-open", legs: [{ marketId: A, side: "up" }, { marketId: B, side: "down" }], maxPayoutBase: 20_000_000n, maxStakeBase: 6_100_000n, spotProofs: ["0x01", "0x02"] };

  it("an open is one sponsored transaction: an exact approve to the reserve, then openParlay with a proof per leg", async () => {
    const e = encode(open);
    const reserve = parlayVenueOf(CHAIN)!.parlayReserve;
    expect(e.area).toBe("parlay");
    expect(e.sponsored).toBe(true);
    expect(e.calls.map((c) => c.to.toLowerCase())).toEqual([TEMPO.pathUSD.toLowerCase(), reserve.toLowerCase()]);
    expect(await evaluate(config, req(e.calls), ctx)).toMatchObject({ ok: true, area: "parlay" });
  });

  it("refuses an open whose proofs do not match its legs before anything is sent", () => {
    const r = encodeParlayIntent({ ...open, spotProofs: ["0x01"] } as TxIntent, { chainId: CHAIN, wallet: USER });
    expect(r).toMatchObject({ ok: false, diagnosis: { errorName: "BadProofCount" } });
  });

  it("settle, claim and withdraw are sponsored; supply is capital intake and never is", async () => {
    for (const intent of [
      { kind: "parlay-resolve-leg", parlayId: 1n, legIdx: 0, marketId: A },
      { kind: "parlay-claim", parlayId: 1n },
      { kind: "parlay-withdraw", shares: 5n },
    ] as TxIntent[]) {
      expect(await evaluate(config, req(encode(intent).calls), ctx)).toMatchObject({ ok: true, area: "parlay" });
    }
    const supply = encode({ kind: "parlay-supply", amountBase: 1_000_000n });
    expect(supply.sponsored).toBe(false);
    expect(await evaluate(config, req(supply.calls), ctx)).toMatchObject({ ok: false, code: "never" });
  });

  it("an open is the markets entry: refused for a restricted region, while a claim still goes through", async () => {
    const us = { ...ctx, region: postureOf("US") };
    expect(await evaluate(config, req(encode(open).calls), us)).toMatchObject({ ok: false, code: "region" });
    expect(await evaluate(config, req(encode({ kind: "parlay-claim", parlayId: 1n }).calls), us)).toMatchObject({ ok: true });
  });
});

describe("parlay refusals by name", () => {
  const revert = (errorName: string, args: readonly unknown[]) => {
    const data = encodeErrorResult({ abi: parlayReserveAbi, errorName: errorName as never, args: args as never });
    return Object.assign(new Error("execution reverted"), { cause: { data } });
  };

  it("ThinBook and BelowFairValue come back with their leg and figures", () => {
    const thin = diagnoseParlay(revert("ThinBook", [A, 20_000_000n, 100_000_000n]));
    expect(thin).toMatchObject({ kind: "thin-book", errorName: "ThinBook" });
    expect(parseRefusal(thin)).toEqual({ kind: "thin-book", marketId: A, filledRaw: 20_000_000n, depthRaw: 100_000_000n });
    const fair = diagnoseParlay(revert("BelowFairValue", [B, 420_000n, 587_349n]));
    expect(fair).toMatchObject({ kind: "outside-band", errorName: "BelowFairValue" });
    expect(parseRefusal(fair)).toEqual({ kind: "below-fair", marketId: B, priceRaw: 420_000n, fairRaw: 587_349n });
  });

  it("a moved book is a requote; D-108's order is not-settled", () => {
    expect(diagnoseParlay(revert("StakeAboveMax", [6_200_000n, 6_100_000n]))).toMatchObject({ kind: "requote" });
    expect(diagnoseParlay(revert("LegOutOfOrder", [1n, 0n, 1n]))).toMatchObject({ kind: "not-settled" });
  });
});
