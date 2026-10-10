// Ported from Agari 03b30ab:packages/core/src/auth/signed-message.test.ts (EVM form)
import { describe, expect, it } from "vitest";
import { networkLine } from "../constants/network";
import { messageBytes, verifySignedMessage, type MessageVerify } from "./signed-message";
import type { Address, Signature } from "../types/primitives";

const SIGNER = "0x00000000000000000000000000000000000000a7" as Address;
const SIG = `0x${"ab".repeat(65)}` as Signature;

describe("verifySignedMessage", () => {
  it("hands the verifier the exact text, signature and signer", async () => {
    const seen: string[] = [];
    const verify: MessageVerify = ({ text, signature, signer }) => {
      seen.push(`${text.length}:${signature.length}:${signer}`);
      return true;
    };
    const text = `Sign in — open the room\n${networkLine("testnet")}`;
    expect(await verifySignedMessage({ text, signature: SIG, signer: SIGNER }, verify)).toBe(true);
    expect(seen).toEqual([`${text.length}:${SIG.length}:${SIGNER}`]);
    // "—" is three UTF-8 bytes: the digest covers bytes, not UTF-16 units.
    expect(messageBytes(text).length).toBe(text.length + 2);
    expect(networkLine("testnet")).toBe("Network: Tempo Moderato testnet (42431)");
  });

  it("is a plain false for malformed input, a non-true answer or a throwing verifier, never an exception", async () => {
    const yes: MessageVerify = () => true;
    expect(await verifySignedMessage({ text: "x", signature: "0x" as Signature, signer: SIGNER }, yes)).toBe(false);
    expect(await verifySignedMessage({ text: "x", signature: SIG, signer: "0x12" as Address }, yes)).toBe(false);
    expect(await verifySignedMessage({ text: "", signature: SIG, signer: SIGNER }, yes)).toBe(false);
    expect(await verifySignedMessage({ text: "x", signature: SIG, signer: SIGNER }, () => false)).toBe(false);
    expect(await verifySignedMessage({ text: "x", signature: SIG, signer: SIGNER }, () => { throw new Error("bad point"); })).toBe(false);
  });
});
