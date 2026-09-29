import { describe, expect, it } from "vitest";
import { BaseError } from "viem";
import { rateLimitDelayMs } from "./transports";

describe("rate-limit retries (X21)", () => {
  it("reads Moderato's hint and ignores every other failure", () => {
    expect(rateLimitDelayMs(new BaseError("Request exceeds defined limit.", { details: "rate limited, try again in 118ms" }))).toBe(143);
    expect(rateLimitDelayMs(new Error("HTTP request failed. Status: 429"))).toBe(250);
    expect(rateLimitDelayMs(new BaseError("An internal error was received.", { details: "KeyAlreadyRevoked" }))).toBeNull();
    expect(rateLimitDelayMs(new Error("Sponsorship rejected."))).toBeNull();
  });
});
