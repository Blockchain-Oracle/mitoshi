import { afterEach, describe, expect, it, vi } from "vitest";
import { indexerSources } from "@cwf/clients";
import { keccak256, toBytes } from "viem";
import { createIndexerClient, indexerQueryUrl, rowsFromRaw, TEMPO_INDEXER_BASE_URL } from "./client";
import { indexerClientFromEnv } from "./env";
import { recount, type LocalCounter, type RecountSource } from "./recount";

// HTTP is stubbed here for request shape and parsing only; the live runs are in acceptance/S3.5.md.
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
  it("carry each event's full signature and a topic0 equal to keccak of its canonical form", () => {
    const sources = indexerSources[42431] as readonly RecountSource[];
    expect(sources.length).toBeGreaterThan(0);
    for (const s of sources) for (const e of s.events) {
      const canonical = `${e.name}(${e.signature.slice(e.name.length + 1, -1).split(", ").filter(Boolean).map((p) => p.split(" ")[0]).join(",")})`;
      expect(e.topic0).toBe(keccak256(toBytes(canonical)));
    }
  });
});

describe("recount", () => {
  const source: RecountSource = { area: "launch", contract: "LaunchRegistry", address: "0x9b664B9B73497Aa140EdA23a81fCC3db279c50b7", deployBlock: 100, events: [{ name: "A", signature: "A()", topic0: "0x01" }, { name: "B", signature: "B()", topic0: "0x02" }] };
  const indexer = (counts: Record<string, number>, covered = true) =>
    createIndexerClient(42431, {
      kind: "mpp",
      session: {
        fetch: async (u) => {
          const sql = new URL(String(u)).searchParams.get("sql")!;
          if (sql.startsWith("SELECT max(num)")) return ok(["head"], [[200]]);
          if (sql.includes("FROM blocks WHERE")) return ok(["n"], [[covered ? 99 : 5]]);
          const topic = /selector = '(0x[0-9a-f]+)'/.exec(sql)![1]!;
          return ok(["n"], [[counts[topic] ?? 0]]);
        },
      },
    });
  const local: LocalCounter = async ({ topic0 }) => ({ count: topic0 === "0x01" ? 4n : 7n, source: "rpc" });
  it("compares each event over the same closed range and names the mismatch", async () => {
    const r = await recount({ chainId: 42431, indexer: indexer({ "0x01": 4, "0x02": 6 }), sources: [source], local, headBlock: 250n });
    expect(r.toBlock).toBe(198n);
    expect(r.rows.map((x) => [x.event, x.indexerCount, x.localCount, x.match])).toEqual([["A", 4n, 4n, true], ["B", 6n, 7n, false]]);
    expect(r.mismatches).toHaveLength(1);
  });
  it("reports a contract the indexer does not cover yet instead of comparing it", async () => {
    const r = await recount({ chainId: 42431, indexer: indexer({}, false), sources: [source], local, headBlock: 250n });
    expect(r.rows).toEqual([]);
    expect(r.uncovered).toEqual([{ contract: "LaunchRegistry", fromBlock: 100n, toBlock: 198n }]);
  });
});
