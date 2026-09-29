// Ported from Masayume 68f7a09:packages/core/src/games/limits.test.ts
import { describe, expect, it } from "vitest";
import { allowMessage, createRateState, ROOM_RATES } from "./limits";
import { clientMessageSchema } from "./protocol";

describe("room rate limits", () => {
  it("prices every client message, so no kind is unlimited by omission", () => {
    for (const option of clientMessageSchema.options) {
      const type = option.shape.type.value;
      expect(ROOM_RATES[type], type).toBeDefined();
      expect(ROOM_RATES[type].burst, type).toBeGreaterThan(0);
    }
  });

  it("lets a burst through, then refuses", () => {
    const state = createRateState();
    for (let i = 0; i < ROOM_RATES.chat.burst; i += 1) expect(allowMessage(state, "chat", 1_000), `#${i}`).toBe(true);
    expect(allowMessage(state, "chat", 1_000)).toBe(false);
  });

  it("refills at the sustained rate, and no faster", () => {
    const state = createRateState();
    for (let i = 0; i < ROOM_RATES.chat.burst; i += 1) allowMessage(state, "chat", 0);
    expect(allowMessage(state, "chat", 1_000)).toBe(false);
    // chat sustains 0.5/s, so two seconds buys exactly one more line.
    expect(allowMessage(state, "chat", 2_000)).toBe(true);
    expect(allowMessage(state, "chat", 2_000)).toBe(false);
  });

  it("does not bank an idle hour into a flood", () => {
    const state = createRateState();
    allowMessage(state, "reaction", 0);
    let sent = 0;
    while (allowMessage(state, "reaction", 3_600_000)) sent += 1;
    expect(sent).toBe(ROOM_RATES.reaction.burst);
  });

  it("keeps one kind's spending out of another's", () => {
    const state = createRateState();
    while (allowMessage(state, "resync", 0)) continue;
    expect(allowMessage(state, "chat", 0)).toBe(true);
  });
});
