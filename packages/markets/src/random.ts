/**
 * The only randomness source in the chain port (plan S1 1a): WebCrypto `crypto.getRandomValues`, available in every
 * browser, Node ≥ 19 and workers, and polyfilled on native (react-native-get-random-values, SM3). Never Math.random.
 */
declare const crypto: { getRandomValues<T extends ArrayBufferView>(array: T): T; randomUUID?: () => string };

export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export function randomHex(bytes: number): `0x${string}` {
  let out = "0x";
  for (const b of randomBytes(bytes)) out += HEX[b];
  return out as `0x${string}`;
}

/** A v4 UUID from `getRandomValues` (randomUUID where present). */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => HEX[x]).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A uniformly random unsigned 64-bit integer (order client ids). */
export function randomU64(): bigint {
  return BigInt(randomHex(8));
}
