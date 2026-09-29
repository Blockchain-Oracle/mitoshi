/** D-131: only the chain's answer counts toward giving a print slot up; a transport failure retries to the deadline. */
import { describe, expect, it } from "vitest";
import { OpsSendError } from "@cwf/markets/ops";
import { chainRefused } from "./pass";

describe("price-relay give-up budget", () => {
  it("counts engine refusals and mined reverts", () => {
    expect(chainRefused(new OpsSendError("simulation reverted: PrintTooLate", "PrintTooLate"))).toBe(true);
    expect(chainRefused(new OpsSendError("reverted in block 1", null, "0x" + "ab".repeat(32) as `0x${string}`))).toBe(true);
  });

  it("does not count RPC failures that never reached the engine", () => {
    expect(chainRefused(new OpsSendError("send failed: HTTP request failed. (502 Bad gateway)", null))).toBe(false);
    expect(chainRefused(new OpsSendError("simulation reverted: An unknown RPC error occurred.", null))).toBe(false);
    expect(chainRefused(new Error("fetch failed"))).toBe(false);
  });
});
