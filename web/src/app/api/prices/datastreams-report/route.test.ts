import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const req = (q: string) => new NextRequest(`https://mitoshi.xyz/api/prices/datastreams-report${q}`);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("/api/prices/datastreams-report", () => {
  it("refuses a symbol the venue has no stream for", async () => {
    const res = await GET(req("?symbol=DOGE"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "not-a-stream" });
  });

  it("refuses a malformed timestamp", async () => {
    const res = await GET(req("?symbol=TSLA&t=yesterday"));
    expect(res.status).toBe(400);
  });

  it("says the source is unconfigured without credentials (Q-011), never a made-up report", async () => {
    vi.stubEnv("DATASTREAMS_API_KEY", "");
    vi.stubEnv("DATASTREAMS_API_SECRET", "");
    const res = await GET(req("?symbol=tsla"));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "datastreams-unconfigured", question: "Q-011" });
  });

  it("passes the report covering t through, with the HMAC headers and no key in the URL", async () => {
    vi.stubEnv("DATASTREAMS_API_KEY", "key-id");
    vi.stubEnv("DATASTREAMS_API_SECRET", "secret");
    const seen: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { headers: Record<string, string> }) => {
      seen.push({ url, headers: init.headers });
      return new Response(JSON.stringify({ report: { feedID: "0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8", validFromTimestamp: 1_700_000_000, observationsTimestamp: 1_700_000_001, fullReport: "0xabcd" } }));
    });
    const res = await GET(req("?symbol=BTC&t=1700000001"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ symbol: "BTC", feedId: "0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8", validFromSec: 1_700_000_000, observationsSec: 1_700_000_001, fullReport: "0xabcd" });
    expect(seen[0]!.url).toBe("https://api.testnet-dataengine.chain.link/api/v1/reports?feedID=0x00039d9e45394f473ab1f050a1b963e6b05351e52d71e507509ada0c95ed75b8&timestamp=1700000001");
    expect(seen[0]!.url).not.toContain("key-id");
    expect(seen[0]!.headers.Authorization).toBe("key-id");
    expect(seen[0]!.headers["X-Authorization-Signature-SHA256"]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("names a missing report apart from an upstream error", async () => {
    vi.stubEnv("DATASTREAMS_API_KEY", "key-id");
    vi.stubEnv("DATASTREAMS_API_SECRET", "secret");
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
    expect((await GET(req("?symbol=ETH"))).status).toBe(404);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    expect((await GET(req("?symbol=ETH"))).status).toBe(502);
  });
});
