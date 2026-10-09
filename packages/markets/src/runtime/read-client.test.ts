import { createPublicClient, custom, fallback } from "viem";
import { describe, expect, it } from "vitest";
import { bounded } from "./read-client";

describe("a bounded socket transport", () => {
  it("gives up on a request that never answers — a socket stuck opening — so the fallback takes HTTP", async () => {
    const stuck = custom({ request: () => new Promise(() => undefined) });
    const http = custom({ request: async ({ method }) => (method === "eth_chainId" ? "0xa5bf" : null) });
    const client = createPublicClient({ transport: fallback([bounded(stuck, 50), http], { rank: false, retryCount: 0 }) });
    const t0 = Date.now();
    expect(await client.getChainId()).toBe(42431);
    expect(Date.now() - t0).toBeLessThan(2_000);
  });

  it("passes a socket's own answer through untouched", async () => {
    const quick = custom({ request: async () => "0x10" });
    const client = createPublicClient({ transport: bounded(quick, 1_000) });
    expect(await client.getBlockNumber()).toBe(16n);
  });
});
