/**
 * RedStone gateway JSON → the `RedStonePrintVerifier` wire payload (engine spec A.5.1). Pure.
 * Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/markets/src/prices/redstone.ts (the Solana base64
 * encoder becomes Node's Buffer). Every integer on the wire is big-endian; each package is single-feed with a 32-byte
 * value (142 B). The production relay builder lives with the price relay (S3); this copy serves the S2 live drives.
 */
export const REDSTONE_GATEWAY = "https://oracle-gateway-2.a.redstone.finance";
export const REDSTONE_SERVICE = "redstone-primary-prod";
export const REDSTONE_MARKER = Uint8Array.from([0x00, 0x00, 0x02, 0xed, 0x57, 0x01, 0x1e, 0x00, 0x00]);
export const REDSTONE_PACKAGE_BYTES = 142;
const VALUE_DECIMALS = 8;

/** One gateway data package. `value` keeps the JSON source text (see `parseGatewayJson`), never a float. */
export type RedStonePackage = {
  timestampMilliseconds: number;
  signature: string;
  signerAddress: string;
  dataPoints: Array<{ dataFeedId: string; value: string }>;
};

export function redstoneHistoricalUrl(tSec: number, gateway = REDSTONE_GATEWAY): string {
  return `${gateway}/data-packages/historical/${REDSTONE_SERVICE}/${tSec * 1000}`;
}

export function redstoneLatestUrl(gateway = REDSTONE_GATEWAY): string {
  return `${gateway}/data-packages/latest/${REDSTONE_SERVICE}`;
}

/** Parses gateway (or archive) JSON keeping every `value` as its exact decimal source text. */
export function parseGatewayJson(text: string): Record<string, RedStonePackage[]> {
  return JSON.parse(text, function reviver(key, value, context?: { source?: string }) {
    return key === "value" && typeof value === "number" && context?.source ? context.source : value;
  }) as Record<string, RedStonePackage[]>;
}

/** Exact `decimal × 10⁸` as a bigint; refuses more than 8 decimals or a non-positive value. */
export function decimalToE8(raw: string): bigint {
  const m = /^(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw.trim());
  if (!m) throw new Error(`not a decimal: "${raw}"`);
  const digits = `${m[1]}${m[2] ?? ""}`;
  const scale = VALUE_DECIMALS - (m[2]?.length ?? 0) + Number(m[3] ?? 0);
  if (scale < 0) {
    const cut = digits.slice(digits.length + scale);
    if (/[^0]/.test(cut)) throw new Error(`more than ${VALUE_DECIMALS} decimals: "${raw}"`);
    return BigInt(digits.slice(0, digits.length + scale) || "0");
  }
  return BigInt(digits) * 10n ** BigInt(scale);
}

/** ASCII, left-aligned, zero-padded to 32 bytes. */
export function redstoneFeedBytes(feed: string): Uint8Array {
  const ascii = new TextEncoder().encode(feed);
  if (ascii.length === 0 || ascii.length > 32) throw new Error(`bad RedStone feed "${feed}"`);
  const out = new Uint8Array(32);
  out.set(ascii);
  return out;
}

function beBytes(value: bigint, length: number): Uint8Array {
  const out = new Uint8Array(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) throw new Error(`${value} does not fit ${length} bytes`);
  return out;
}

/** `feed_id[32] ‖ value[32] ‖ timestamp_ms[6] ‖ value_size[4]=32 ‖ data_point_count[3]=1 ‖ signature[65]`. */
export function redstonePackageBytes(pkg: RedStonePackage, feed: string): Uint8Array {
  const point = pkg.dataPoints[0];
  if (pkg.dataPoints.length !== 1 || !point || point.dataFeedId !== feed) throw new Error(`package is not single-feed ${feed}`);
  const signature = Uint8Array.from(Buffer.from(pkg.signature, "base64"));
  if (signature.length !== 65) throw new Error(`signature is ${signature.length} bytes, expected 65`);
  const out = new Uint8Array(REDSTONE_PACKAGE_BYTES);
  out.set(redstoneFeedBytes(feed), 0);
  out.set(beBytes(decimalToE8(String(point.value)), 32), 32);
  out.set(beBytes(BigInt(pkg.timestampMilliseconds), 6), 64);
  out.set(beBytes(32n, 4), 70);
  out.set(beBytes(1n, 3), 74);
  out.set(signature, 77);
  return out;
}

/** Single-feed packages at exactly `tMs` (any timestamp when null), one per signer (a repeat refuses the print). */
export function packagesAt(all: Record<string, RedStonePackage[]>, feed: string, tMs: number | null): RedStonePackage[] {
  const bySigner = new Map<string, RedStonePackage>();
  for (const pkg of all[feed] ?? []) {
    if ((tMs !== null && pkg.timestampMilliseconds !== tMs) || pkg.dataPoints.length !== 1) continue;
    const signer = pkg.signerAddress.toLowerCase();
    if (!bySigner.has(signer)) bySigner.set(signer, pkg);
  }
  return [...bySigner.values()];
}

/** `package × N ‖ N[2] ‖ unsigned_metadata_size[3]=0 ‖ marker[9]`: `142·N + 14` bytes. */
export function redstonePayload(packages: RedStonePackage[], feed: string): Uint8Array {
  if (packages.length === 0) throw new Error("no RedStone packages");
  const out = new Uint8Array(REDSTONE_PACKAGE_BYTES * packages.length + 14);
  packages.forEach((pkg, i) => out.set(redstonePackageBytes(pkg, feed), i * REDSTONE_PACKAGE_BYTES));
  const tail = REDSTONE_PACKAGE_BYTES * packages.length;
  out.set(beBytes(BigInt(packages.length), 2), tail);
  out.set(REDSTONE_MARKER, tail + 5);
  return out;
}

/** The SDK median: odd → middle; even → `⌊(a + b) / 2⌋`. Mirrors the recorded price. */
export function redstoneMedianE8(values: bigint[]): bigint {
  if (values.length === 0) throw new Error("median of nothing");
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2n;
}

export const toHex = (b: Uint8Array): `0x${string}` => `0x${Buffer.from(b).toString("hex")}`;
