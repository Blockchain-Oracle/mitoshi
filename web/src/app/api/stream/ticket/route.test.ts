import { verifyStreamTicket } from "@cwf/markets/stream-ticket";
import { describe, expect, it } from "vitest";
import { mintStreamTicket } from "@cwf/markets/stream-ticket";

// The route's contract with ops: what it mints, ops' verifier accepts for that address only, and only for 60 s.
describe("stream ticket contract", () => {
  it("mints a ticket ops accepts for the session's address, and nothing else", () => {
    const secret = "s".repeat(64);
    const address = "0x00000000000000000000000000000000000000A1";
    const { ticket, expSec } = mintStreamTicket(secret, address, 1_000);
    expect(verifyStreamTicket(secret, ticket, 1_000)).toBe(address.toLowerCase());
    expect(verifyStreamTicket(secret, ticket, expSec + 1)).toBeNull();
    expect(verifyStreamTicket("t".repeat(64), ticket, 1_000)).toBeNull();
  });
});
