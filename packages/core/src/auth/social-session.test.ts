import { describe, expect, it } from "vitest";
import { isFreshSignIn, parseSocialSessionMessage, socialSessionMessage } from "./social-session";

const signIn = { address: "0x1111111111111111111111111111111111111111" as const, network: "testnet" as const, issuedAtSec: 1_791_660_000, nonce: "a1b2c3d4e5f60718" };

describe("the one social sign-in", () => {
  it("says what it allows and what it can't do, and parses back to its fields", () => {
    const text = socialSessionMessage(signIn);
    expect(text).toContain("Address: 0x1111111111111111111111111111111111111111");
    expect(text).toContain("Network: Tempo Moderato testnet (42431)");
    expect(text).toContain("It moves no money, approves no spending and signs no transaction.");
    expect(parseSocialSessionMessage(text, ["testnet"])).toEqual(signIn);
  });
  it("refuses another network, an edited promise, or a foreign text", () => {
    const text = socialSessionMessage(signIn);
    expect(parseSocialSessionMessage(text, ["mainnet"])).toBeNull();
    expect(parseSocialSessionMessage(text.replace("moves no money", "moves money"), ["testnet"])).toBeNull();
    expect(parseSocialSessionMessage(`${text}\nextra`, ["testnet"])).toBeNull();
    expect(parseSocialSessionMessage("hello", ["testnet"])).toBeNull();
  });
  it("is fresh for five minutes and a minute ahead", () => {
    expect(isFreshSignIn(signIn, signIn.issuedAtSec + 299)).toBe(true);
    expect(isFreshSignIn(signIn, signIn.issuedAtSec + 301)).toBe(false);
    expect(isFreshSignIn(signIn, signIn.issuedAtSec - 59)).toBe(true);
    expect(isFreshSignIn(signIn, signIn.issuedAtSec - 61)).toBe(false);
  });
});
