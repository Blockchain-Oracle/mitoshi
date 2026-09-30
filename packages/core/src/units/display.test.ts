import { describe, expect, it } from "vitest";
import { formatWallClock } from "./display";

describe("formatWallClock", () => {
  it("reads exactly as toLocaleTimeString with the same locale and options (D-181)", () => {
    const start = Date.UTC(2026, 8, 30, 0, 0, 0);
    for (let ms = start; ms < start + 2 * 86_400_000; ms += 7 * 60_000 + 13_000) {
      expect(formatWallClock(ms)).toBe(new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    }
  });
});
