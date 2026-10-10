import venueSpec from "@cwf/core/venue-spec.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { DATA_STREAMS_FEEDS } from "./datastreams";

describe("the Gap's Data Streams feeds (S6, D-217)", () => {
  it("are the same streams the price relay proves with", () => {
    const feeds = venueSpec.dataStreams.feeds as Record<string, string>;
    expect(Object.keys(feeds).length).toBeGreaterThan(0);
    for (const [symbol, id] of Object.entries(feeds)) expect(DATA_STREAMS_FEEDS[symbol], symbol).toBe(id);
  });
  it("names a feed for every RedStone stock with a Gap Series", () => {
    const gaps = venueSpec.series.filter((s) => s.basis === 1).map((s) => s.symbol);
    expect(gaps.length).toBe(9);
    for (const symbol of gaps) expect((venueSpec.dataStreams.feeds as Record<string, string>)[symbol], symbol).toMatch(/^0x000b[0-9a-f]{60}$/);
  });
});
