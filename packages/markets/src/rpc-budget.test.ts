/** D-134: the shared RPC budget paces by method weight, serves the send path first and pauses on a 429. */
import { describe, expect, it } from "vitest";
import { budgetedFetch, retryHintMs, RpcBudget } from "./rpc-budget";

const body = (method: string) => ({ method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: [] }) });

describe("RpcBudget", () => {
  it("keeps the granted rate at its units per second", async () => {
    const b = new RpcBudget(60, 6);
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 12 }, () => b.acquire("eth_call"))); // 36 units: 6 at once, 30 more at 60/s
    const took = Date.now() - t0;
    expect(took).toBeGreaterThanOrEqual(450);
    expect(took).toBeLessThan(1_500);
  });

  it("serves the send path before queued reads and log scans", async () => {
    const b = new RpcBudget(30, 3);
    const order: string[] = [];
    await b.acquire("eth_call"); // empties the bucket
    const all = ["eth_getLogs", "eth_call", "eth_sendRawTransactionSync"].map((m) => b.acquire(m).then(() => order.push(m)));
    await Promise.all(all);
    expect(order).toEqual(["eth_sendRawTransactionSync", "eth_call", "eth_getLogs"]);
  });

  it("serves the print path's tier before the house's, whatever the method", async () => {
    const b = new RpcBudget(30, 3);
    const order: string[] = [];
    await b.acquire("eth_call");
    await Promise.all([b.acquire("eth_sendRawTransactionSync", 1).then(() => order.push("maker send")), b.acquire("eth_call", 0).then(() => order.push("relay read"))]);
    expect(order).toEqual(["relay read", "maker send"]);
  });

  it("pauses for the time a 429 asks, then resumes", async () => {
    const b = new RpcBudget(1_000, 30);
    let calls = 0;
    const fetchFn: typeof fetch = async () => (++calls === 1 ? new Response('{"jsonrpc":"2.0","id":null,"error":{"code":-32005,"message":"rate limited, try again in 300ms"}}', { status: 429 }) : new Response('{"jsonrpc":"2.0","id":1,"result":"0x1"}'));
    const f = budgetedFetch(b, fetchFn);
    expect((await f("https://rpc.test", body("eth_blockNumber"))).status).toBe(429);
    const t0 = Date.now();
    expect((await f("https://rpc.test", body("eth_blockNumber"))).status).toBe(200);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(280);
    expect(b.stats().limited).toBe(1);
  });

  it("reads the RPC's retry hint", () => {
    expect(retryHintMs('{"error":{"code":-32005,"message":"rate limited, try again in 273ms"}}')).toBe(273);
    expect(retryHintMs("nope")).toBeNull();
  });
});
