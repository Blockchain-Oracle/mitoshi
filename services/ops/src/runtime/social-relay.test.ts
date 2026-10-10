import { describe, expect, it } from "vitest";
import { relaySocial } from "./social-relay";

describe("the social relay", () => {
  it("publishes room messages and takes, and nothing else", () => {
    const published: unknown[] = [];
    const bus = { publish: (topic: string, event: string, data: unknown) => (published.push({ topic, event, data }), { id: "1", topic, event, data, atMs: 0 }) };
    expect(relaySocial(JSON.stringify({ topic: "rooms", event: "message", data: { room: "$TSLA", body: "hi" } }), bus as never)).toBe(true);
    expect(relaySocial(JSON.stringify({ topic: "prices", event: "price", data: {} }), bus as never)).toBe(false);
    expect(relaySocial("not json", bus as never)).toBe(false);
    expect(published).toEqual([{ topic: "rooms", event: "message", data: { room: "$TSLA", body: "hi" } }]);
  });
});
