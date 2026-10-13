/**
 * A theme's spec (S16a; R4-11, D-227; plan B.4.1 TH-02): the JSON the creator publishes beside the on-chain fields, its
 * RFC 8785 (JCS) canonical form and `specHash = keccak256(canonical bytes)`. The spec travels as a `data:` URI in
 * `specURI`, so it is on chain in the publish calldata and anyone can re-hash it — nothing to host, nothing to drift.
 * JCS here covers the spec's own value types (strings, safe integers, booleans, arrays, objects): keys sorted by UTF-16
 * code units, no whitespace, ECMAScript string and number serialisation — exactly RFC 8785 for those types.
 */
export interface ThemeSpecBand { token: string; symbol: string; minBps: number; targetBps: number; maxBps: number; allowed: boolean }

export interface ThemeSpec {
  schema: 1;
  name: string;
  blurb: string;
  creatorFeeBps: number;
  maxSlippageBps: number;
  minIntervalSec: number;
  maxRefAgeSec: number;
  sessionsMask: number;
  bands: ThemeSpecBand[];
  cashBand: { minBps: number; targetBps: number; maxBps: number };
}

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function canonicalJson(value: unknown): string {
  const v = value as Json;
  if (v === null || typeof v === "boolean" || typeof v === "string") return JSON.stringify(v);
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error("spec numbers are safe integers");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, Json>)[k])}`).join(",")}}`;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (i + 1 < bytes.length ? B64[(n >> 6) & 63]! : "=") + (i + 2 < bytes.length ? B64[n & 63]! : "=");
  }
  return out;
}

/** The canonical bytes and the `data:` URI that carries them. The hash is keccak256 of these bytes (markets hashes). */
export function specPayload(spec: ThemeSpec): { canonical: string; bytes: Uint8Array; uri: string } {
  const canonical = canonicalJson(spec);
  const bytes = new TextEncoder().encode(canonical);
  return { canonical, bytes, uri: `data:application/json;base64,${base64(bytes)}` };
}

/** The spec back from its `data:` URI (null for anything else) — the catalogue's name and blurb. */
export function specFromUri(uri: string): ThemeSpec | null {
  const m = /^data:application\/json;base64,([A-Za-z0-9+/=]+)$/.exec(uri);
  if (!m) return null;
  try {
    const bin = atob(m[1]!);
    const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    const spec = JSON.parse(json) as ThemeSpec;
    return spec && spec.schema === 1 ? spec : null;
  } catch {
    return null;
  }
}

/** Envelope presets (Owarine DeskStudio's LimitsForm, Careful / Balanced / Loose) → each token's band around its target. */
export const ENVELOPES = { careful: 300, balanced: 700, loose: 1_500 } as const;
export type Envelope = keyof typeof ENVELOPES;

export function bandAround(targetBps: number, envelope: Envelope): { minBps: number; targetBps: number; maxBps: number } {
  const w = ENVELOPES[envelope];
  return { minBps: Math.max(0, targetBps - w), targetBps, maxBps: Math.min(10_000, targetBps + w) };
}
