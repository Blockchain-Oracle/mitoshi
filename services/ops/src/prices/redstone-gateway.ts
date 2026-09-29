// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/price-relay/{redstone-fetch,sources}.ts
/**
 * RedStone gateway fetches (no key): one historical request at T carries every feed (≈ 1.9 MB), so the relay fetches a
 * boundary once and cuts each feed out of the text (`feedAt`, values parsed from source text, never a float). The
 * configured signer set is the engine's (`venue-spec.json`), so the relay never posts a package the verifier refuses.
 */
import venueSpec from "@cwf/core/venue-spec.json" with { type: "json" };
import { REDSTONE_GATEWAY, redstoneHistoricalUrl, redstoneLatestUrl } from "@cwf/markets/ops";

export interface RedstoneSources {
  gateways: string[];
  /** Lower-case configured signers (the verifier's set). */
  signers: ReadonlySet<string>;
  /** Signers required while `now < T + strictSec` (all of them), and the threshold after. */
  signerCount: number;
  threshold: number;
}

export interface GatewayResponse {
  text: string;
  fetchedAtMs: number;
  gateway: string;
}

export function loadRedstoneSources(env: NodeJS.ProcessEnv = process.env): RedstoneSources {
  const fromEnv = (env.REDSTONE_GATEWAY_URLS ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  const signers = venueSpec.redstone.signers.map((s) => s.toLowerCase());
  return { gateways: fromEnv.length ? fromEnv : [REDSTONE_GATEWAY, "https://oracle-gateway-1.a.redstone.finance"], signers: new Set(signers), signerCount: signers.length, threshold: venueSpec.redstone.threshold };
}

async function getFirst(urls: string[]): Promise<GatewayResponse> {
  let last = "no gateway configured";
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      const text = await res.text();
      if (res.ok && text.startsWith("{")) return { text, fetchedAtMs: Date.now(), gateway: new URL(url).origin };
      last = `HTTP ${res.status} from ${new URL(url).origin}`;
    } catch (error) {
      last = `${new URL(url).origin}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
  throw new Error(`RedStone gateways failed (${last})`);
}

export const fetchRedstoneAt = (tSec: number, gateways: string[]) => getFirst(gateways.map((g) => redstoneHistoricalUrl(tSec, g)));
export const fetchRedstoneLatest = (gateways: string[]) => getFirst(gateways.map((g) => redstoneLatestUrl(g)));
