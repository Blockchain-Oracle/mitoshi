import { describe, expect, it } from "vitest";
import { maxUint256 } from "viem";
import { approveCall } from "./batch";
import { FEE_TOKEN } from "./fee";
import { buildSendParameters } from "./send";

const TOKEN = "0x20c0000000000000000000000000000000000000";
const SPENDER = "0x00000000000000000000000000000000000000aa";

describe("buildSendParameters", () => {
  it("names pathUSD as fee token, asks for sponsorship, and sets an expiring nonce explicitly (N-12, X21)", () => {
    const { parameters, fields } = buildSendParameters({ calls: [approveCall(TOKEN, SPENDER, 5n)], sponsored: true, nonce: { kind: "expiring" }, nowSec: 1_000 });
    expect(parameters.feeToken).toBe(FEE_TOKEN);
    expect((parameters as { feePayer?: boolean }).feePayer).toBe(true);
    expect(fields).toEqual({ nonceKey: maxUint256, nonce: 0, validBefore: 1_025 });
    // Sponsored: no fee fields, the sponsor's fill sets them (Moderato refuses a sponsored fill that carries one).
    expect("maxPriorityFeePerGas" in parameters).toBe(false);
  });

  it("caps an expiring window at the protocol's 300 s and leaves protocol nonces to the chain", () => {
    expect(buildSendParameters({ calls: [approveCall(TOKEN, SPENDER, 1n)], sponsored: false, nonce: { kind: "expiring", validForSec: 9_999 }, nowSec: 0 }).fields.validBefore).toBe(300);
    const own = buildSendParameters({ calls: [approveCall(TOKEN, SPENDER, 1n)], sponsored: false, nonce: { kind: "protocol" }, nowSec: 0 });
    expect(own.fields).toEqual({});
    expect("feePayer" in own.parameters).toBe(false);
    expect((own.parameters as { maxPriorityFeePerGas?: bigint }).maxPriorityFeePerGas).toBe(1n);
  });

  it("refuses an empty batch and native value", () => {
    expect(() => buildSendParameters({ calls: [], sponsored: false, nonce: { kind: "protocol" }, nowSec: 0 })).toThrow();
    expect(() => buildSendParameters({ calls: [{ ...approveCall(TOKEN, SPENDER, 1n), value: 1n as unknown as 0n }], sponsored: false, nonce: { kind: "protocol" }, nowSec: 0 })).toThrow();
  });
});
