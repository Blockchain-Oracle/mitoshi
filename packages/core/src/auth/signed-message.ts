// Ported from Agari 03b30ab:packages/core/src/auth/signed-message.ts — ed25519 over raw bytes becomes EIP-191 text
// verified by Tempo's signature rules (secp256k1, P-256, WebAuthn, keychain envelopes; plan C.2.1, X9).
import { z } from "zod";
import { NETWORK_LABEL, NETWORKS, type Network } from "../constants/network";
import { isAddress, isSignature, type Address, type Signature } from "../types/primitives";

/**
 * Every text the app asks a wallet or passkey to sign, and how a server checks it.
 *
 * An EVM wallet signs `personal_sign` (EIP-191) over the UTF-8 text; a Tempo passkey account signs the same EIP-191
 * digest with P-256/WebAuthn. The browser and the server build the same string from the same fields, byte for byte,
 * and the text is written to be READ: it names what the signature allows and what it doesn't.
 *
 * Core carries no crypto. The verifier is passed in: `@cwf/markets/server`'s `auth/verify.ts` wraps viem's Tempo
 * `verifyHash`, which accepts every Tempo signature type (conformance proven against `SignatureVerifier` in X9).
 */

/** The line that binds a signed text to one network, so a testnet signature is never a mainnet one. */
export function networkLine(network: Network): string {
  return `Network: ${NETWORK_LABEL[network]} (${NETWORKS[network]})`;
}

/** WHATWG TextEncoder: global in every runtime we target; declared here because core compiles with no DOM lib. */
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

const encoder = new TextEncoder();

/** The exact UTF-8 bytes of `text` (what EIP-191 prefixes with its length). */
export function messageBytes(text: string): Uint8Array {
  return encoder.encode(text);
}

/** A check of `signature` by `signer` over the EIP-191 message `text`. May be async (a chain-aware verifier). */
export type MessageVerify = (input: { text: string; signature: Signature; signer: Address }) => boolean | Promise<boolean>;

export interface SignedMessage {
  text: string;
  signature: Signature;
  signer: Address;
}

export const messageSignatureSchema = z.custom<Signature>(isSignature, "expected a 0x-hex signature");

export const signedMessageSchema = z.object({
  text: z.string().min(1).max(4_000),
  signature: messageSignatureSchema,
  signer: z.custom<Address>(isAddress, "expected a 20-byte address"),
});

/**
 * True only when `signature` is `signer`'s signature over `text`. A malformed input or a throwing verifier is a plain
 * false, never a throw, so a route can answer 401 without a try/catch around attacker input.
 */
export async function verifySignedMessage(message: SignedMessage, verify: MessageVerify): Promise<boolean> {
  if (!isSignature(message.signature) || !isAddress(message.signer) || message.text.length === 0) return false;
  try {
    return (await verify(message)) === true;
  } catch {
    return false;
  }
}
