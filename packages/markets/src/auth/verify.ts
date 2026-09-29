/**
 * Server-side signature verification (plan C.2.4 `auth/verify.ts`; X9). viem ≥ 2.56's Tempo `verifyHash` verifies
 * P-256, WebAuthn and keychain envelopes locally and falls back to ecrecover / ERC-6492 for secp256k1, so one verifier
 * covers every account kind we sign in (passkey, Tempo Wallet, injected). `mode: "allowAccessKey"` also accepts an
 * active access key of the account (checked on the AccountKeychain).
 */
import { hashMessage, type Address, type Hex, type PublicClient } from "viem";
import { verifyHash } from "viem/actions";
import type { MessageVerify } from "@cwf/core";

export function messageVerifier(client: PublicClient, options: { allowAccessKey?: boolean } = {}): MessageVerify {
  return async ({ text, signature, signer }) =>
    verifyHash(client, { address: signer as Address, hash: hashMessage(text), signature: signature as Hex, ...(options.allowAccessKey ? { mode: "allowAccessKey" } : {}) });
}
