/**
 * LayerZero Scan (S14w; D-227 R4-12): the message records for a source transaction or a guid, from LayerZero's public
 * API (`/v1/messages/tx/{hash}`, `/v1/messages/guid/{guid}`; CORS-open, no key). It answered 2026-10-12 for the
 * Base → Moderato ping with its guid, the DVN's verification and the destination execution (acceptance/R4-12.md).
 * A record not indexed yet is an empty list, not an error; a network failure is the error arm.
 */
import { parseScanList, type Network, type ScanMessage } from "@cwf/core";

export const LZ_SCAN_API: Record<Network, string> = {
  mainnet: "https://scan.layerzero-api.com/v1",
  testnet: "https://scan-testnet.layerzero-api.com/v1",
};

export type ScanFetch = (url: string, init?: RequestInit) => Promise<Response>;

async function get(url: string, fetcher: ScanFetch): Promise<ScanMessage[]> {
  const res = await fetcher(url, { headers: { accept: "application/json" }, cache: "no-store" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`LayerZero Scan answered ${res.status}`);
  return parseScanList(await res.json());
}

/** Every LayerZero message a source transaction emitted (one per leg it started). */
export function scanByTx(network: Network, txHash: string, fetcher: ScanFetch = fetch): Promise<ScanMessage[]> {
  return get(`${LZ_SCAN_API[network]}/messages/tx/${txHash}`, fetcher);
}

/** One message by its guid (a hop's onward leg is found by the guid `Hopped` emitted). */
export async function scanByGuid(network: Network, guid: string, fetcher: ScanFetch = fetch): Promise<ScanMessage | null> {
  return (await get(`${LZ_SCAN_API[network]}/messages/guid/${guid}`, fetcher))[0] ?? null;
}
