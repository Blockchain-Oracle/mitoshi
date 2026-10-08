import { describe, expect, it } from "vitest";
import { encodeErrorResult, maxUint256, type Address, type Hex } from "viem";
import { OPEN_POSTURE, postureOf, toMarketId, type TxIntent } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { leverageReserveAbi } from "@cwf/clients/abis/LeverageReserve";
import { evaluate } from "../relay/engine";
import { POLICIES } from "../relay/policies";
import type { RelayRequest } from "../relay/types";
import { encodeLeverageIntent } from "./encoders";
import { diagnoseLeverage } from "./errors";

const CHAIN = 42431;
const USER = "0x00000000000000000000000000000000000000a1" as Address;
const M = toMarketId(`0x${"d4".repeat(32)}`);
const config = { chainId: CHAIN, feePayer: "0x00000000000000000000000000000000000000fe" as Address, policies: POLICIES };
const ctx = { method: "eth_fillTransaction", device: "d", region: OPEN_POSTURE, nowSec: 1_000 };
const req = (calls: { to: Address; data: Hex }[]): RelayRequest => ({ chainId: CHAIN, from: USER, calls: calls.map((c) => ({ ...c, value: 0n })), gas: 2_000_000n, maxFeePerGas: 20_000_000_000n, feeToken: TEMPO.pathUSD, nonceKey: maxUint256, validBefore: 1_025, keyAuthorization: null });
const enc = (i: TxIntent) => {
  const r = encodeLeverageIntent(i, { chainId: CHAIN, wallet: USER });
  if (!r?.ok) throw new Error("not encoded");
  return r.value;
};

describe("boost intents → the relay (D-175)", () => {
  const open: TxIntent = { kind: "leverage-open", marketId: M, side: "up", stakeBase: 2_000_000n, leverageBps: 20_000, minQuantityRaw: 5_000_000n, spotProof: "0x01" };

  it("an open is one sponsored transaction [approve(reserve, stake), open(…, spotProof)] and the markets entry", async () => {
    const e = enc(open);
    expect(e.calls).toHaveLength(2);
    expect(await evaluate(config, req(e.calls), ctx)).toMatchObject({ ok: true, area: "leverage" });
    expect(await evaluate(config, req(e.calls), { ...ctx, region: postureOf("US") })).toMatchObject({ ok: false, code: "region" });
  });

  it("exits and cranks are sponsored everywhere; supply never", async () => {
    for (const i of [
      { kind: "leverage-close", positionId: 1n, marketId: M, minProceedsBase: 1n },
      { kind: "leverage-knock-out", positionId: 1n, marketId: M, spotProof: "0x01" },
      { kind: "leverage-settle", positionId: 1n, marketId: M },
      { kind: "leverage-claim-owed" },
    ] as TxIntent[]) {
      expect(await evaluate(config, req(enc(i).calls), { ...ctx, region: postureOf("US") })).toMatchObject({ ok: true });
    }
    expect(await evaluate(config, req(enc({ kind: "leverage-supply", amountBase: 1n }).calls), ctx)).toMatchObject({ ok: false, code: "never" });
  });

  it("names D-116, D-114 and PD-2 refusals", () => {
    const rev = (name: string, args: readonly unknown[]) => Object.assign(new Error("reverted"), { cause: { data: encodeErrorResult({ abi: leverageReserveAbi, errorName: name as never, args: args as never }) } });
    expect(diagnoseLeverage(rev("VoidWouldShort", [4_000_000n, 5_000_000n]))).toMatchObject({ errorName: "VoidWouldShort", kind: "outside-band" });
    expect(diagnoseLeverage(rev("UnhealthyAtEntry", [1n, 2n]))).toMatchObject({ errorName: "UnhealthyAtEntry" });
    expect(diagnoseLeverage(rev("AboveFairValue", [M, 700_000n, 600_000n]))).toMatchObject({ errorName: "AboveFairValue", technical: `AboveFairValue(${M}, 700000, 600000)` });
  });
});
