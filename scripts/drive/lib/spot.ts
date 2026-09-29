/**
 * A real RedStone "latest" spot payload for `FairValueGuard.spotOf` / `verifySpot` (A.5.4): the gateway's latest
 * packages for `feed`, narrowed to the timestamp most signers share (verifySpot requires one timestamp across the
 * packages and at least the verifier's threshold of distinct signers). `/api/prices/redstone-payload` is S10e's; until
 * it is mounted, drives fetch the gateway directly, as the S2/S3 drives do.
 */
import type { Hex } from "viem";
import { decimalToE8, packagesAt, parseGatewayJson, redstoneLatestUrl, redstoneMedianE8, redstonePayload, toHex } from "./redstone-payload.js";

export interface SpotPayload { payload: Hex; tsSec: number; signers: number; medianE8: bigint }

export async function latestSpot(feed: string, minSigners = 3): Promise<SpotPayload> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await fetch(redstoneLatestUrl(), { signal: AbortSignal.timeout(20_000) });
    if (res.ok) {
      const all = parseGatewayJson(await res.text());
      const counts = new Map<number, number>();
      for (const p of all[feed] ?? []) counts.set(p.timestampMilliseconds, (counts.get(p.timestampMilliseconds) ?? 0) + 1);
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
      if (best) {
        const pkgs = packagesAt(all, feed, best[0]);
        if (pkgs.length >= minSigners) {
          const values = pkgs.map((p) => decimalToE8(String(p.dataPoints[0]!.value)));
          return { payload: toHex(redstonePayload(pkgs, feed)), tsSec: Math.floor(best[0] / 1000), signers: pkgs.length, medianE8: redstoneMedianE8(values) };
        }
      }
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(`no RedStone latest spot for ${feed} with ${minSigners} signers`);
}
