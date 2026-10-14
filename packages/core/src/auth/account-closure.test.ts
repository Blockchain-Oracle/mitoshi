import { describe, expect, it } from "vitest";
import { accountClosureMessage, parseAccountClosureMessage } from "./account-closure";

const input = { address: "0x00000000000000000000000000000000000000aa" as const, network: "testnet" as const, issuedAtSec: 1_760_000_000, nonce: "ab".repeat(12) };

describe("account closure request", () => {
  it("accepts only the exact signed text for its network", () => {
    const text = accountClosureMessage(input);
    expect(parseAccountClosureMessage(text, ["testnet"])).toEqual(input);
    expect(parseAccountClosureMessage(text, ["mainnet"])).toBeNull();
    expect(parseAccountClosureMessage(text.replace("registered passkeys", "data"), ["testnet"])).toBeNull();
  });
});
