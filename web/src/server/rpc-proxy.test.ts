// Round 7: the browser's RPC proxy passes only a page's methods, caps a batch, and meters each address.
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { admit, MAX_BATCH, refusal } = await import("./rpc-proxy");

describe("rpc proxy", () => {
  it("passes a page's reads and sends, refuses the rest", () => {
    expect(refusal({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [] })).toBeNull();
    expect(refusal([{ method: "eth_blockNumber" }, { method: "eth_sendRawTransactionSync" }])).toBeNull();
    expect(refusal({ method: "debug_traceTransaction" })).toMatch(/not offered/);
    expect(refusal({ method: "eth_sign" })).toMatch(/not offered/);
    expect(refusal(Array.from({ length: MAX_BATCH + 1 }, () => ({ method: "eth_call" })))).toMatch(/batch/);
    expect(refusal([])).toMatch(/batch/);
  });
  it("meters each address with a refilling bucket", () => {
    const t = 1_000_000;
    let passed = 0;
    for (let i = 0; i < 100; i++) if (admit("a", 1, t)) passed++;
    expect(passed).toBe(60);
    expect(admit("a", 1, t)).toBe(false);
    expect(admit("a", 1, t + 1_000)).toBe(true);
    expect(admit("b", 1, t)).toBe(true);
  });
});
