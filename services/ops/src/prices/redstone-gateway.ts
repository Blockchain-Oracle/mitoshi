// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/actors/price-relay/{redstone-fetch,sources}.ts
/**
 * RedStone for ops: the gateways (authenticated once RedStone's key is configured — `REDSTONE_GATEWAYS`, D-210 — else
 * the public pair being switched off) and the configured signer set. One historical request at T carries every feed
 * (≈ 1.9 MB), so the relay fetches a boundary once and cuts each feed out of the text (`feedAt`, values parsed from
 * source text, never a float). The signer set is the engine's (`venue-spec.json`), so the relay never posts a package
 * the verifier refuses. The fetches themselves (`x-api-key`, one request a second per key, one shared "latest") live in
 * `@cwf/markets/ops` with the web proxy's.
 */
import venueSpec from "@cwf/core/venue-spec.json" with { type: "json" };
import { fetchRedstoneAt, fetchRedstoneLatest, redstoneGatewaysFromEnv, type RedstoneGateway, type RedstoneResponse } from "@cwf/markets/ops";

export interface RedstoneSources {
  gateways: RedstoneGateway[];
  /** Lower-case configured signers (the verifier's set). */
  signers: ReadonlySet<string>;
  /** Signers required while `now < T + strictSec` (all of them), and the threshold after. */
  signerCount: number;
  threshold: number;
}

export type GatewayResponse = RedstoneResponse;

export function loadRedstoneSources(env: NodeJS.ProcessEnv = process.env): RedstoneSources {
  const signers = venueSpec.redstone.signers.map((s) => s.toLowerCase());
  return { gateways: redstoneGatewaysFromEnv(env), signers: new Set(signers), signerCount: signers.length, threshold: venueSpec.redstone.threshold };
}

export { fetchRedstoneAt, fetchRedstoneLatest };
