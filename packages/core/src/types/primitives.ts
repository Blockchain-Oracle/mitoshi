// Ported from Masayume 68f7a09:packages/core/src/types/primitives.ts

export type Hex = `0x${string}`;
export type Address = Hex;
export type Bytes32 = Hex;

const HEX_RE = /^0x[0-9a-fA-F]*$/;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const BYTES32_RE = /^0x[0-9a-fA-F]{64}$/;

export const isHex = (v: unknown): v is Hex => typeof v === "string" && HEX_RE.test(v);
export const isAddress = (v: unknown): v is Address => typeof v === "string" && ADDRESS_RE.test(v);
export const isBytes32 = (v: unknown): v is Bytes32 => typeof v === "string" && BYTES32_RE.test(v);

// The zod validators for these live in `schemas/primitives.ts`, so importing a type or guard never loads zod (§3.1).

/** A 32-byte hash (tx hash, feed id, series id): the Agari modules' name for `Bytes32`. */
export type Hash32 = Bytes32;
export const isHash32 = isBytes32;
/** A signature as it travels: 0x-hex (secp256k1 65 B, or a Tempo P-256/WebAuthn envelope of any length). */
export type Signature = Hex;
export const isSignature = (v: unknown): v is Signature => isHex(v) && v.length > 2;

/** A checked, lower-cased EVM address (Agari's `toAddress`, EVM form). Throws on anything else. */
export function toAddress(value: string): Address {
  if (!isAddress(value)) throw new Error(`not a 20-byte address: ${value}`);
  return value.toLowerCase() as Address;
}

/** Case-insensitive address equality. */
export const sameAddress = (a: string | null | undefined, b: string | null | undefined): boolean => !!a && !!b && a.toLowerCase() === b.toLowerCase();
