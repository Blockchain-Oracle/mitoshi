import { describe, expect, it } from "vitest";
import { BaseError, HttpRequestError, keccak256, maxUint256 } from "viem";
import { tempoChain } from "../chains";
import { approveCall } from "./batch";
import { FEE_TOKEN } from "./fee";
import { buildSendParameters, NotIncludedError, rawOfFailedSend, sendBatch } from "./send";

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

describe("sendBatch after an ambiguous sync send (D-137)", () => {
  const raw = "0x76c0ffee" as const;
  const hash = keccak256(raw);
  const failure = () => new BaseError("send failed", { cause: new HttpRequestError({ url: "https://rpc.moderato.tempo.xyz", status: 502, body: { method: "eth_sendRawTransactionSync", params: [raw] } }) });
  const receiptRpc = { transactionHash: hash, blockHash: `0x${"22".repeat(32)}`, blockNumber: "0x10", transactionIndex: "0x0", from: SPENDER, to: TOKEN, cumulativeGasUsed: "0x1", gasUsed: "0x1", effectiveGasPrice: "0x1", logs: [], logsBloom: `0x${"00".repeat(256)}`, status: "0x1", type: "0x76", contractAddress: null };
  const client = (landed: boolean, headTime: number) => ({
    account: { address: SPENDER, type: "local" },
    chain: tempoChain("testnet"),
    sendTransactionSync: async () => {
      throw failure();
    },
    request: async ({ method }: { method: string }) => {
      if (method === "eth_getTransactionReceipt") return landed ? receiptRpc : null;
      if (method === "eth_getBlockByNumber") return { number: "0x11", "timestamp": `0x${headTime.toString(16)}`, hash: `0x${"33".repeat(32)}`, transactions: [] };
      throw new Error(method);
    },
  });

  it("finds the transaction by the hash of its signed bytes instead of resending", async () => {
    const sent = await sendBatch(client(true, 1_000) as never, { calls: [approveCall(TOKEN, SPENDER, 1n)], sponsored: true, nonce: { kind: "expiring" }, nowSec: 1_000 });
    expect(sent.hash).toBe(hash);
    expect(sent.receipt.status).toBe("success");
  });

  it("is a definite failure once the expiring window has passed with no receipt", async () => {
    await expect(sendBatch(client(false, 1_030) as never, { calls: [approveCall(TOKEN, SPENDER, 1n)], sponsored: true, nonce: { kind: "expiring" }, nowSec: 1_000 })).rejects.toBeInstanceOf(NotIncludedError);
  });

  it("names the raw bytes only for a raw send", () => {
    expect(rawOfFailedSend(failure())).toBe(raw);
    expect(rawOfFailedSend(new HttpRequestError({ url: "x", body: { method: "eth_fillTransaction", params: [] } }))).toBeNull();
  });
});
