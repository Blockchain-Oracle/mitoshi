/**
 * The chain half of the real-time client, live on Moderato: watch pathUSD `Transfer` into a brand-new address over the
 * read runtime's WebSocket, fund that address from the node's faucet, and receive the log — batched, once.
 */
import { createPublicClient, http, parseAbiItem, type Log } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Actions } from "viem/tempo";
import { describe, expect, it } from "vitest";
import { TEMPO_RPC_HTTP } from "@cwf/core";
import { TEMPO } from "@cwf/clients";
import { tempoChain } from "../chains";
import { watchChainLogs } from "./chain-logs";

describe("watchChainLogs on Moderato", () => {
  it("delivers a faucet transfer into a fresh address, batched per frame", async () => {
    const to = privateKeyToAccount(generatePrivateKey()).address;
    const batches: Log[][] = [];
    const stop = watchChainLogs({
      address: TEMPO.pathUSD as `0x${string}`,
      events: [parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 amount)")],
      args: { to },
      onLogs: (logs) => batches.push(logs),
      visibility: null,
    });
    await new Promise((r) => setTimeout(r, 1_500));
    const client = createPublicClient({ chain: tempoChain("testnet"), transport: http(TEMPO_RPC_HTTP.testnet) });
    const hashes = await Actions.faucet.fund(client, { account: to });
    const end = Date.now() + 30_000;
    while (batches.flat().length === 0 && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    stop();
    const logs = batches.flat();
    console.log(JSON.stringify({ to, faucetTx: hashes[0], received: logs.map((l) => l.transactionHash), batches: batches.length }));
    expect(logs.length).toBeGreaterThan(0);
    expect(hashes).toContain(logs[0]!.transactionHash);
  }, 60_000);
});
