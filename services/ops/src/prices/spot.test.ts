/** The spot feed's read state (D-186): a read counts only when RedStone answered with current packages. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { heartbeats } from "../runtime/heartbeat";
import { createSpotFeed } from "./spot";

const SIGNER = "0x8bb8f32df04c8b654987daaed53d6b6091e3b774";
const sources = { gateways: ["https://gateway.example"], signers: new Set([SIGNER]), signerCount: 1, threshold: 1 };
const latest = (ageSec: number) => {
  const ts = (Math.floor(Date.now() / 1000) - ageSec) * 1000;
  return JSON.stringify({ BTC: [{ timestampMilliseconds: ts, signerAddress: SIGNER, dataPoints: [{ dataFeedId: "BTC", value: 65000.5 }] }] });
};
const beat = () => heartbeats().find((b) => b.actor === "spot-feed")!;

async function pollOnce(answer: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(answer));
  const feed = createSpotFeed({ sources, log: () => undefined, everyMs: 3_600_000 });
  feed.start();
  await vi.waitFor(() => expect(beat().lastPassMs).not.toBeNull());
  feed.stop();
  return feed;
}

afterEach(() => void vi.unstubAllGlobals());

describe("spot feed read state", () => {
  it("a current answer is a read", async () => {
    const feed = await pollOnce(async () => new Response(latest(8)));
    expect(feed.lastReadSec()).toBeGreaterThan(Date.now() / 1000 - 5);
    expect(feed.newest("BTC")?.priceE8).toBe(6_500_050_000_000n);
    expect(beat().failures).toBe(0);
  });

  it("an answer whose every package is past 60 s is a failed read, not fresh data (health shows it)", async () => {
    const feed = await pollOnce(async () => new Response(latest(120)));
    expect(feed.lastReadSec()).toBeNull();
    expect(beat().failures).toBe(1);
    expect(beat().lastWhy).toMatch(/redstone latest failed: .*stale: its newest package is 1[12]\d s old/);
  });

  it("a gateway that doesn't answer is a failed read", async () => {
    const feed = await pollOnce(async () => {
      throw new Error("connect ETIMEDOUT");
    });
    expect(feed.lastReadSec()).toBeNull();
    expect(beat().lastWhy).toMatch(/ETIMEDOUT/);
  });
});
