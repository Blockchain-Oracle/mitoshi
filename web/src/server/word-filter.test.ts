import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { clean, flagged } = await import("./word-filter");

describe("the word filter", () => {
  it("stars matched words, keeps the rest, and leaves clean text alone", () => {
    expect(clean("this market is fucking wild")).toBe("this market is ****ing wild");
    expect(flagged("fuuuck this")).toBe(true);
    expect(clean("UP on TSLA into the close")).toBe("UP on TSLA into the close");
    expect(flagged("the pen is mightier than the sword")).toBe(false);
  });
});
