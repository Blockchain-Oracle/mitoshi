// Ported from Owarine 90a91d71:packages/core/src/input/keypad.test.ts (R4-2, D-227).
import { describe, expect, it } from "vitest";
import { keypadDisplay, keypadToMinor, pressKey, type KeypadKey } from "./keypad";

const type = (keys: string, start = "") => [...keys].reduce((v, k) => pressKey(v, (k === "<" ? "del" : k) as KeypadKey), start);

describe("keypad", () => {
  it("replaces a leading zero instead of prefixing it", () => {
    expect(type("05")).toBe("5");
    expect(type("0005")).toBe("5");
  });
  it("starts a bare point as 0. and allows one point only", () => {
    expect(type(".")).toBe("0.");
    expect(type("1.2.3")).toBe("1.23");
  });
  it("caps decimals at two and integers at nine", () => {
    expect(type("1.239")).toBe("1.23");
    expect(type("1234567890")).toBe("123456789");
  });
  it("deletes from the end, down to empty", () => {
    expect(type("12.5<<<")).toBe("1");
    expect(type("1<<")).toBe("");
  });
  it("converts to cents exactly", () => {
    expect(keypadToMinor("")).toBe(0n);
    expect(keypadToMinor("0.")).toBe(0n);
    expect(keypadToMinor("12.5")).toBe(1250n);
    expect(keypadToMinor("123456789.99")).toBe(12345678999n);
  });
  it("displays grouped dollars with the decimals as typed", () => {
    expect(keypadDisplay("")).toBe("$0");
    expect(keypadDisplay("1234.5")).toBe("$1,234.5");
    expect(keypadDisplay("0.")).toBe("$0.");
  });
});
