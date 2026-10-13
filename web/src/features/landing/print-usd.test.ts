import { describe, expect, it } from "vitest";
import { printUsd } from "./print-usd";

describe("printUsd", () => {
  it("reads an 8-decimal print as dollars and cents, grouped", () => {
    expect(printUsd("6712045000000")).toBe("$67,120.45");
    expect(printUsd(100_000_000n)).toBe("$1.00");
    expect(printUsd("0")).toBe("$0.00");
  });
  it("rounds half up to the cent, exactly, with no float", () => {
    expect(printUsd("12345500000")).toBe("$123.46");
    expect(printUsd("12345499999")).toBe("$123.45");
    expect(printUsd("900719925474099312345678")).toBe("$9,007,199,254,740,993.12");
  });
  it("keeps the sign on a negative value", () => {
    expect(printUsd("-150000000")).toBe("−$1.50");
  });
});
