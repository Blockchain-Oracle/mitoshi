import { beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256 } from "viem";

// The split send is viem's own `sendTransactionSync` steps in the open (D-150): these stubs stand in for the RPC so the
// test can see the ORDER of things — the hash reaches the surface before the one sync send, and nothing is sent twice.
const calls: string[] = [];
let feePayerSignature: unknown = { r: 1n, s: 2n, yParity: 0 };
vi.mock("viem/actions", async (orig) => ({
  ...(await orig<typeof import("viem/actions")>()),
  prepareTransactionRequest: vi.fn(async (_c: unknown, req: Record<string, unknown>) => {
    calls.push("prepare");
    return { ...req, gas: 200_000n };
  }),
  sendRawTransactionSync: vi.fn(async (_c: unknown, { serializedTransaction }: { serializedTransaction: `0x${string}` }) => {
    calls.push(`send:${serializedTransaction}`);
    return { transactionHash: keccak256(serializedTransaction), status: "success", logs: [] };
  }),
}));
vi.mock("viem/tempo", async (orig) => ({
  ...(await orig<typeof import("viem/tempo")>()),
  Transaction: { deserialize: () => ({ feePayerSignature }) },
}));

const { sendBatch } = await import("./send");
const { approveCall } = await import("./batch");
const { tempoChain } = await import("../chains");

const SIGNED = "0x76deadbeef" as const;
const client = () => ({
  account: { address: "0x00000000000000000000000000000000000000aa", type: "local", signTransaction: async () => (calls.push("sign"), SIGNED) },
  chain: { ...tempoChain("testnet"), serializers: { transaction: undefined } },
});
const request = { calls: [approveCall("0x20c0000000000000000000000000000000000000", "0x00000000000000000000000000000000000000bb", 1n)], sponsored: true, nonce: { kind: "expiring" as const }, nowSec: 1_000 };

describe("sendBatch with onSigned (confirmed-pending, D43/D-150)", () => {
  beforeEach(() => {
    calls.length = 0;
    feePayerSignature = { r: 1n, s: 2n, yParity: 0 };
  });

  it("names the final hash after signing and before the one sync send", async () => {
    const seen: (string | null)[] = [];
    const sent = await sendBatch(client() as never, request, { onSigned: (h) => (seen.push(h), calls.push("signed")) });
    expect(calls).toEqual(["prepare", "sign", "signed", `send:${SIGNED}`]);
    expect(seen).toEqual([keccak256(SIGNED)]);
    expect(sent.hash).toBe(keccak256(SIGNED));
  });

  it("names no hash when the fee payer has not signed yet (the relay co-signs inside the send)", async () => {
    feePayerSignature = null;
    const seen: (string | null)[] = [];
    await sendBatch(client() as never, request, { onSigned: (h) => seen.push(h) });
    expect(seen).toEqual([null]);
    expect(calls.filter((c) => c.startsWith("send:"))).toHaveLength(1);
  });

  it("keeps the one-call path without the hook", async () => {
    const c = { ...client(), sendTransactionSync: vi.fn(async () => ({ transactionHash: keccak256(SIGNED), status: "success", logs: [] })) };
    await sendBatch(c as never, request);
    expect(c.sendTransactionSync).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([]);
  });
});
