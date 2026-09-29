import { describe, expect, it } from "vitest";
import { formatE8 } from "./live-prices";

describe("formatE8", () => {
  it("formats integer 1e-8 prices without floats", () => {
    expect(formatE8("6400012345678")).toBe("$64,000.12");
    expect(formatE8("25012000000")).toBe("$250.12");
    expect(formatE8("12345678")).toBe("$0.1234");
    expect(formatE8("0")).toBe("$0.0000");
  });
});
