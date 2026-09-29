/**
 * The stream client against the REAL ops stream (S3, live on Coolify): `prices` must deliver RedStone ticks through our
 * fetch-based SSE reader, batched per frame. `LIVE_STREAM_URL` overrides the testnet default.
 */
import { describe, expect, it } from "vitest";
import { isPriceTick } from "./stream-hub";
import { createStreamClient, type StreamEvent } from "./stream";

const url = process.env.LIVE_STREAM_URL ?? "https://stream.testnet.mitoshi.xyz";

describe("stream client on the live ops stream", () => {
  it("receives real price ticks", async () => {
    const got: StreamEvent[] = [];
    const client = createStreamClient({ url, onBatch: (b) => got.push(...b), visibility: null, debounceMs: 1 });
    const off = client.subscribe("prices");
    const end = Date.now() + 20_000;
    while (got.length < 3 && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
    off();
    client.close();
    const ticks = got.filter((e) => e.event === "price" && isPriceTick(e.data)).map((e) => e.data as { symbol: string; priceE8: string; source: string });
    console.log(JSON.stringify({ url, events: got.length, sample: ticks.slice(0, 3) }));
    expect(ticks.length).toBeGreaterThan(0);
  }, 30_000);
});
