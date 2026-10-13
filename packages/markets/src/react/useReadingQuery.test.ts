/** D-230 item 6: the public RPC's rate limit is an outage to retry, never an answer that replaces the last good read. */
import { describe, expect, it } from "vitest";
import { isInfrastructureFailure } from "./useReadingQuery";

describe("which read failures retry", () => {
  it("retries the RPC's per-IP limit, as it retries an RPC that is down", () => {
    expect(isInfrastructureFailure(new Error("Request exceeds defined limit. (too many connections from this IP)"))).toBe(true);
    expect(isInfrastructureFailure(new Error("rate limited, try again in 273ms"))).toBe(true);
  });
});
