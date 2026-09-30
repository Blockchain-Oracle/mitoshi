import { describe, expect, it } from "vitest";
import { keccak256 } from "viem";
import { tempoChain } from "../chains";
import { approveCall } from "./batch";
import { sendBatch } from "./send";

const TOKEN = "0x20c0000000000000000000000000000000000000";
const SPENDER = "0x00000000000000000000000000000000000000aa";
const hash = keccak256("0x76c0ffee");
const receipt = { transactionHash: hash, status: "success", logs: [] };

/** A client that records what `sendBatch` hands the wallet (the passkey connector is a json-rpc account). */
function recording(type: "json-rpc" | "local") {
  const seen: Record<string, unknown>[] = [];
  const client = { account: { address: SPENDER, type }, chain: tempoChain("testnet"), sendTransactionSync: async (args: Record<string, unknown>) => (seen.push(args), receipt) };
  return { client, seen };
}

describe("sendBatch and the wallet's default fee payer (F-S7-10, D-156)", () => {
  it("tells a wallet-held signer not to use a fee payer for an unsponsored write (capital intake)", async () => {
    const { client, seen } = recording("json-rpc");
    await sendBatch(client as never, { calls: [approveCall(TOKEN, SPENDER, 1n)], sponsored: false, nonce: { kind: "expiring" }, nowSec: 1_000 });
    expect(seen[0]!.feePayer).toBe(false);
  });
  it("still asks for the sponsor on a sponsored write", async () => {
    const { client, seen } = recording("json-rpc");
    await sendBatch(client as never, { calls: [approveCall(TOKEN, SPENDER, 1n)], sponsored: true, nonce: { kind: "expiring" }, nowSec: 1_000 });
    expect(seen[0]!.feePayer).toBe(true);
  });
  it("leaves a local account's unsponsored send as it was (keys, ops, drives)", async () => {
    const { client, seen } = recording("local");
    await sendBatch(client as never, { calls: [approveCall(TOKEN, SPENDER, 1n)], sponsored: false, nonce: { kind: "expiring" }, nowSec: 1_000 });
    expect("feePayer" in seen[0]!).toBe(false);
  });
});
