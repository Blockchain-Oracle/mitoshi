import { describe, expect, it } from "vitest";
import { splitLean } from "./lean";

describe("splitLean", () => {
  it("reads the side off the protocol line and keeps the rest as the body", () => {
    expect(splitLean("LEAN: UP\nBTC is $12 over the line with 2 minutes left.")).toEqual({ lean: "up", body: "BTC is $12 over the line with 2 minutes left.", pending: false });
    expect(splitLean("lean: down\n\nIt slid under the line.").lean).toBe("down");
    expect(splitLean("LEAN: SIT\nCoin flip.").lean).toBe("sit");
  });
  it("treats NONE as a plain answer", () => {
    expect(splitLean("LEAN: NONE\nYou have two open calls.")).toEqual({ lean: null, body: "You have two open calls.", pending: false });
  });
  it("holds back a protocol line that is still streaming", () => {
    for (const part of ["", "L", "LEA", "LEAN:", "LEAN: D", "LEAN: DOW", "LEAN: SI"]) expect(splitLean(part)).toEqual({ lean: null, body: "", pending: true });
    expect(splitLean("LEAN: UP")).toEqual({ lean: "up", body: "", pending: false });
  });
  it("shows an answer without the line as it is", () => {
    expect(splitLean("Sit this one out.")).toEqual({ lean: null, body: "Sit this one out.", pending: false });
    expect(splitLean("Learn the line first.")).toEqual({ lean: null, body: "Learn the line first.", pending: false });
  });
});
