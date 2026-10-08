/**
 * A private bet's three on-chain keys (Ported from Masayume 68f7a09:packages/markets/src/private/keys.ts), redesigned
 * for passkeys (C.2.4, L-39, D-171): Masayume seeded them with the owner's authorisation signature, which is only
 * reproducible because secp256k1 signing is deterministic; a P-256/WebAuthn signature is randomised, so the same
 * authorisation would give different keys on a retry. The browser draws a 32-byte secret instead, the owner's signed
 * text commits to `keccak256(secret)`, and both the desk and the owner derive the keys from the secret — the desk can
 * resume a half-finished open from it, and nobody else can join the slot to the owner.
 */
import { concatHex, keccak256, stringToHex, type Hex } from "viem";
import type { Bytes32 } from "@cwf/core";

export interface SlotKeys {
  /** The slot's id — on every slot-side call, never beside the owner. */
  slotId: Bytes32;
  /** On the charge, beside the owner — never beside the slot. */
  chargeKey: Bytes32;
  /** On the credit, beside the owner — carried in the claim so the desk can credit without the secret. */
  creditKey: Bytes32;
}

export function isSecret(secret: string): secret is Hex {
  return /^0x[0-9a-fA-F]{64}$/.test(secret);
}

/** What the owner's signed text commits to. */
export function secretCommitment(secret: Hex): Hex {
  return keccak256(secret);
}

export function deriveSlotKeys(secret: Hex): SlotKeys {
  const seed = keccak256(concatHex([secret, stringToHex("mitoshi.private.v1")]));
  const derive = (label: string) => keccak256(concatHex([seed, stringToHex(label)])) as Bytes32;
  return { slotId: derive("slot"), chargeKey: derive("charge"), creditKey: derive("credit") };
}
