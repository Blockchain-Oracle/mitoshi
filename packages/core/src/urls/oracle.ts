// Ported from Masayume 68f7a09:packages/core/src/urls/oracle.ts: the Somnia oracle graph → the signed sources a print
// can come from (RedStone, Chainlink Data Streams) and our own proof page (plan C.2.1).
import type { PrintSource } from "../types/market";

/** Where a reader can check the source that signed a print; an attested print is checked on our own proof page. */
export const PRINT_SOURCE_URL: Record<PrintSource, string | null> = {
  redstone: "https://app.redstone.finance/push-feeds",
  datastreams: "https://data.chain.link/streams",
  attested: null,
};

/** Our in-app proof page for one Window: prints, signers and an in-browser `eth_call` re-verify (S5). */
export function proofPath(marketId: string): string {
  return `/proof/${marketId}`;
}
