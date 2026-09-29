import { describe, expect, it } from "vitest";
import { P256, PublicKey } from "ox";
import { Account } from "viem/tempo";
import { passkeyAddress } from "./auth-handler";

describe("passkeyAddress", () => {
  it("derives the same Tempo address as viem's P-256 account from the session's public key hex", () => {
    for (let i = 0; i < 5; i++) {
      const privateKey = P256.randomPrivateKey();
      const account = Account.fromP256(privateKey);
      const hex = PublicKey.toHex(P256.getPublicKey({ privateKey }));
      expect(passkeyAddress(hex)).toBe(account.address.toLowerCase());
    }
  });
});
