import { describe, expect, it } from "vitest";
import { mintStreamTicket, verifyStreamTicket } from "./stream-ticket";

const A = "0x160a25fFFA76652Ba236CE97395B4d6C51bC3FC0";

describe("stream tickets (D-049)", () => {
  it("grant exactly the minting address for 60 s", () => {
    const { ticket, expSec } = mintStreamTicket("s3cret", A, 1_000);
    expect(expSec).toBe(1_060);
    expect(verifyStreamTicket("s3cret", ticket, 1_030)).toBe(A.toLowerCase());
    expect(verifyStreamTicket("s3cret", ticket, 1_061)).toBeNull();
  });

  it("refuse a forged address, another secret, and a far-future expiry", () => {
    const { ticket } = mintStreamTicket("s3cret", A, 1_000);
    expect(verifyStreamTicket("other", ticket, 1_000)).toBeNull();
    expect(verifyStreamTicket("s3cret", ticket.replace(A.toLowerCase().slice(2, 6), "ffff"), 1_000)).toBeNull();
    const far = mintStreamTicket("s3cret", A, 5_000).ticket;
    expect(verifyStreamTicket("s3cret", far, 1_000)).toBeNull();
  });
});
