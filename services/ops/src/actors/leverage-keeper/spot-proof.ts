/**
 * A RedStone "latest" spot proof for `FairValueGuard.spotOf` (A.5.4): from one gateway response, the packages of `feed`
 * at the timestamp most configured signers share (the verifier wants one timestamp and at least `threshold` distinct
 * signers), as the verifier's wire payload. Pure: the caller fetches. The production copy of the S10.0 drive's
 * `scripts/drive/lib/spot.ts` for ops.
 */
import { decimalToE8, packagesAt, parseGatewayJson, redstoneMedianE8, redstonePayload, toHex, type RedStonePackage } from "@cwf/markets/ops";

export interface SpotProof {
  payload: `0x${string}`;
  tsSec: number;
  signers: number;
  medianE8: bigint;
}

/** Accepts the gateway's own shape (`{ FEED: [...] }`) or an archived one (`{ packages: { FEED: [...] } }`). */
export function spotProofOf(text: string, feed: string, signers: ReadonlySet<string>, threshold: number): SpotProof | null {
  const parsed = parseGatewayJson(text) as unknown as Record<string, RedStonePackage[]> & { packages?: Record<string, RedStonePackage[]> };
  const all: Record<string, RedStonePackage[]> = parsed.packages && !Array.isArray(parsed.packages) ? parsed.packages : parsed;
  const configured = (all[feed] ?? []).filter((p) => signers.has(p.signerAddress.toLowerCase()));
  const counts = new Map<number, number>();
  for (const p of configured) counts.set(p.timestampMilliseconds, (counts.get(p.timestampMilliseconds) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (!best) return null;
  const pkgs = packagesAt({ [feed]: configured }, feed, best[0]);
  if (pkgs.length < threshold) return null;
  const values = pkgs.map((p) => decimalToE8(String(p.dataPoints[0]!.value)));
  return { payload: toHex(redstonePayload(pkgs, feed)), tsSec: Math.floor(best[0] / 1000), signers: pkgs.length, medianE8: redstoneMedianE8(values) };
}
