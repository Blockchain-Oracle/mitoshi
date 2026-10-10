import { describe, expect, it } from "vitest";
import { deletionMessage, parseDeletionMessage } from "./account-deletion";
import { socialSessionMessage } from "./social-session";

const fields = { address: "0x00000000000000000000000000000000000000aa" as const, network: "testnet" as const, issuedAtSec: 1_791_000_000, nonce: "0123456789abcdef0123" };

describe("the deletion request", () => {
  it("reads back only a byte-identical text", () => {
    const text = deletionMessage(fields);
    expect(parseDeletionMessage(text, ["testnet"])).toEqual(fields);
    expect(parseDeletionMessage(`${text}\n`, ["testnet"])).toBeNull();
    expect(parseDeletionMessage(text.replace("can't be deleted", "are deleted"), ["testnet"])).toBeNull();
    expect(parseDeletionMessage(text, ["mainnet"])).toBeNull();
  });

  it("is never a sign-in, and a sign-in is never a deletion", () => {
    expect(parseDeletionMessage(socialSessionMessage(fields), ["testnet"])).toBeNull();
    expect(deletionMessage(fields)).toContain("stay on chain");
  });
});
