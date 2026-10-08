import { describe, expect, it } from "vitest";
import { encodeErrorResult, maxUint256, type Address, type Hex } from "viem";
import { OPEN_POSTURE, toMarketId, type TxIntent } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { rangeReserveAbi } from "@cwf/clients/abis/RangeReserve";
import { evaluate } from "../relay/engine";
import { POLICIES } from "../relay/policies";
import type { RelayRequest } from "../relay/types";
import { encodeRangeIntent } from "./encoders";
import { diagnoseRange } from "./errors";

const CHAIN = 42431;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const M = toMarketId(`0x${"c3".repeat(32)}`);
const config = { chainId: CHAIN, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "d", region: OPEN_POSTURE, nowSec: 1_000 };
const req = (calls: { to: Address; data: Hex }[]): RelayRequest => ({ chainId: CHAIN, from: USER, calls: calls.map((c) => ({ ...c, value: 0n })), gas: 2_000_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null });
const enc = (i: TxIntent) => {
  const r = encodeRangeIntent(i, { chainId: CHAIN, wallet: USER });
  if (!r?.ok) throw new Error("not encoded");
  return r.value;
};

describe("range intents → the relay (D-173)", () => {
  it("an open is one sponsored transaction [approve, openRange(…, spotProof)]; settle, claim and the stale void are sponsored", async () => {
    const open = enc({ kind: "range-open", marketId: M, asset: "BTC", side: "inside", lowPrint: 8_300_000n, highPrint: 8_320_000n, maxPayoutBase: 10_000_000n, maxStakeBase: 4_000_000n, spotProof: "0x01" });
    expect(open.calls).toHaveLength(2);
    expect(await evaluate(config, req(open.calls), ctx)).toMatchObject({ ok: true, area: "range" });
    for (const i of [{ kind: "range-settle", roundId: 1n, marketId: M }, { kind: "range-claim", roundId: 1n }, { kind: "range-void-stale", roundId: 1n }, { kind: "range-claim-owed" }] as TxIntent[]) {
      expect(await evaluate(config, req(enc(i).calls), ctx)).toMatchObject({ ok: true });
    }
  });

  it("supply is capital intake and never sponsored", async () => {
    const s = enc({ kind: "range-supply", amountBase: 1_000_000n });
    expect(s.sponsored).toBe(false);
    expect(await evaluate(config, req(s.calls), ctx)).toMatchObject({ ok: false, code: "never" });
  });

  it("names StaleBasis and MustSettle", () => {
    const rev = (name: string, args: readonly unknown[]) => Object.assign(new Error("reverted"), { cause: { data: encodeErrorResult({ abi: rangeReserveAbi, errorName: name as never, args: args as never }) } });
    expect(diagnoseRange(rev("StaleBasis", [M, 31_000n, 20_000]))).toMatchObject({ kind: "outside-band", errorName: "StaleBasis" });
    expect(diagnoseRange(rev("MustSettle", [3n]))).toMatchObject({ kind: "not-settled", errorName: "MustSettle" });
  });
});
