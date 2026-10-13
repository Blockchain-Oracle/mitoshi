import { afterEach, describe, expect, it, vi } from "vitest";
import { indexerSources } from "@cwf/clients";
import { parseAbiItem, toEventSelector, type AbiEvent } from "viem";
import { createIndexerClient, indexerQueryUrl, rowsFromRaw, TEMPO_INDEXER_BASE_URL } from "./client";
import { indexerClientFromEnv } from "./env";
import type { RecountSource } from "./recount";

// HTTP is stubbed here for request shape and parsing only; the recount itself is in recount.test.ts, live runs in
// acceptance/S3.5.md.
const ok = (columns: string[], rows: unknown[][]) => new Response(JSON.stringify({ ok: true, columns, rows, row_count: rows.length, engine: "tiered" }), { headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("request shape", () => {
  it("builds the Tempo API query URL with sql, chainId and repeated signatures", () => {
    const url = indexerQueryUrl(TEMPO_INDEXER_BASE_URL, 42431, { sql: "SELECT 1", signatures: ["event Transfer(address indexed from, address indexed to, uint256 value)", "Approval(address owner)"], engine: "clickhouse" });
    expect(url.origin + url.pathname).toBe("https://api.tempo.xyz/v1/indexer/query");
    expect(url.searchParams.get("chainId")).toBe("42431");
    expect(url.searchParams.getAll("signature")).toEqual(["Transfer(address indexed from, address indexed to, uint256 value)", "Approval(address owner)"]);
    expect(url.searchParams.get("engine")).toBe("clickhouse");
  });
  it("maps columns onto rows and surfaces the indexer's own error", () => {
    expect(rowsFromRaw({ ok: true, columns: ["a", "b"], rows: [[1, "x"]] })).toEqual([{ a: 1, b: "x" }]);
    expect(() => rowsFromRaw({ ok: false, error: "relation does not exist" })).toThrow(/relation does not exist/);
  });
  it("sends the API key header through tidx.ts and pays through the session on the mpp route", async () => {
    const seen: Request[] = [];
    vi.stubGlobal("fetch", async (req: Request) => (seen.push(req), ok(["head"], [[37_000_000]])));
    const keyed = createIndexerClient(42431, { kind: "api-key", apiKey: "tempo_sandbox:sk:test" });
    expect((await keyed.query({ sql: "SELECT max(num) AS head FROM blocks" })).rows).toEqual([{ head: 37_000_000 }]);
    expect(seen[0]!.headers.get("tempo-api-key")).toBe("tempo_sandbox:sk:test");
    expect(new URL(seen[0]!.url).pathname).toBe("/v1/indexer/query");

    const paid: string[] = [];
    const mpp = createIndexerClient(42431, { kind: "mpp", session: { fetch: async (u) => (paid.push(String(u)), ok(["n"], [[3]])) } });
    expect((await mpp.query({ sql: "SELECT count(*) AS n FROM logs" })).rows).toEqual([{ n: 3 }]);
    expect(paid[0]).toMatch(/^https:\/\/api\.tempo\.xyz\/v1\/indexer\/query\?sql=/);
  });
});

describe("env", () => {
  it("prefers a self-hosted tidx, then an API key, then MPP; mainnet MPP needs Q-020", () => {
    expect(indexerClientFromEnv({ NETWORK: "testnet", TIDX_URL: "http://tidx:8080", TEMPO_INDEXER_API_KEY: "k" })).toMatchObject({ client: { via: "self-hosted", chainId: 42431 } });
    expect(indexerClientFromEnv({ NETWORK: "mainnet", TEMPO_INDEXER_API_KEY: "k" })).toMatchObject({ client: { via: "api-key", chainId: 4217 } });
    expect(indexerClientFromEnv({ NETWORK: "mainnet", INDEXER_VIA_MPP: "1", MPP_PAYER_PRIVATE_KEY: `0x${"11".repeat(32)}`, MPP_ROOT_ADDRESS: "0x1E8407b15C8Db0A73A17fb18E50dD4735Da59c0b" })).toMatchObject({ client: null, reason: expect.stringMatching(/Q-020/) });
    expect(indexerClientFromEnv({ NETWORK: "testnet" }).client).toBeNull();
  });
});

describe("generated indexer sources", () => {
  it("carry each event as a parseable signature whose selector is its topic0, structs expanded", () => {
    const sources = indexerSources[42431] as readonly RecountSource[];
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) for (const e of s.events) {
      expect(e.signature).not.toMatch(/\btuple\b/);
      expect(e.topic0).toBe(toEventSelector(parseAbiItem(`event ${e.signature}`) as AbiEvent));
    }
    // The engine's OrderExecuted carries a struct: the topic its 434,198 Moderato logs have (R6).
    const engine = sources.find((s) => s.contract === "EventsEngine")!;
    expect(engine.events.find((e) => e.name === "OrderExecuted")!.topic0).toBe("0xa669f01e54311b4f70f92a8c0e1fd805ee3972bd969a0585de051ddbf215ef04");
  });
});
