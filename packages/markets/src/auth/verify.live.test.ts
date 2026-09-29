/**
 * Spike X9 (plan §X, S1): our server verifier (`messageVerifier` → viem's Tempo `verifyHash`, local) must agree with
 * Moderato's `SignatureVerifier.verify` precompile for every account kind we sign in — secp256k1 (injected / Tempo
 * Wallet EOAs), raw P-256, and WebAuthn (passkeys) — on valid signatures, a tampered hash and a wrong signer.
 * Runs against the live chain: `pnpm --filter @cwf/markets test:live`.
 */
import { P256 } from "ox";
import { createPublicClient, hashMessage, http, keccak256, toHex, type Address, type Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { Abis, Account, Addresses } from "viem/tempo";
import { describe, expect, it } from "vitest";
import { TEMPO_RPC_HTTP } from "@cwf/core";
import { tempoChain } from "../chains";
import { messageVerifier } from "./verify";

const client = createPublicClient({ chain: tempoChain("testnet"), transport: http(TEMPO_RPC_HTTP.testnet) });
const local = messageVerifier(client as never);

const onChain = (signer: Address, hash: Hex, signature: Hex) =>
  client.readContract({ address: Addresses.signatureVerifier, abi: Abis.signatureVerifier, functionName: "verify", args: [signer, hash, signature] }).catch(() => false);

const kinds = {
  secp256k1: () => Account.fromSecp256k1(generatePrivateKey()),
  p256: () => Account.fromP256(P256.randomPrivateKey()),
  webAuthn: () => Account.fromHeadlessWebAuthn(P256.randomPrivateKey(), { rpId: "localhost", origin: "http://localhost:3101" }),
};

describe("X9: local verify == SignatureVerifier.verify on Moderato", () => {
  for (const [kind, make] of Object.entries(kinds)) {
    it(`${kind}: valid, tampered hash and wrong signer agree`, async () => {
      const account = make();
      const other = make();
      const text = `Mitoshi X9 ${kind} ${Date.now()}`;
      const hash = hashMessage(text);
      const signature = await account.sign({ hash });
      const tampered = keccak256(toHex(`${text}!`));

      const rows = {
        valid: [await local({ text, signature, signer: account.address }), await onChain(account.address, hash, signature)],
        tampered: [await local({ text: `${text}!`, signature, signer: account.address }), await onChain(account.address, tampered, signature)],
        wrongSigner: [await local({ text, signature, signer: other.address }), await onChain(other.address, hash, signature)],
      };
      console.log(JSON.stringify({ kind, signatureBytes: (signature.length - 2) / 2, ...rows }));
      expect(rows.valid).toEqual([true, true]);
      expect(rows.tampered).toEqual([false, false]);
      expect(rows.wrongSigner).toEqual([false, false]);
    }, 30_000);
  }
});
