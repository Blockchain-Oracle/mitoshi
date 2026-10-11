// Ported from Agari 03b30ab:packages/core/src/strategies/memory.ts — EIP-191 texts (Mitoshi's signed-message shape: the
// network named, addresses lowercased) in place of ed25519.
/**
 * The Memory Market's two signed texts (L-56): a creator seals what their agent has learned; a reader asks for it. Both
 * routes re-derive the text from the request and verify it, so a signature for one strategy, one wallet or one moment
 * opens nothing else. What opens a memory is on chain: the strategy's creator, or a live subscription to it.
 */
import { networkLine, USD_DECIMALS, type Network } from "../constants/network";
import { formatBaseUnits } from "../units/format";

export const SEALED_TITLE_MAX = 80;
export const SEALED_BODY_MAX = 8_000;
/** The most a creator may ask for one paid read (pathUSD base units): $5. */
export const MEMORY_READ_PRICE_MAX_BASE = 5_000_000n;
/** A signed request is good for five minutes. */
export const MEMORY_SIGNATURE_TTL_MS = 5 * 60_000;

/** How the seal names the price of one paid read (L-56's optional MPP read): 0 keeps it to copiers. */
export function readPriceLine(readPriceBase: bigint): string {
  return readPriceBase === 0n ? "Paid reads: off (copiers only)" : `Paid reads: ${formatBaseUnits(readPriceBase, USD_DECIMALS, { minDp: 2, maxDp: 6 })} pathUSD each, paid to the creator over MPP`;
}

/** The body and the read price are part of the signed text, so neither can be swapped in transit. */
export function sealMemoryMessage(input: { network: Network; strategyId: string; creator: string; issuedAtMs: number; title: string; readPriceBase: bigint; body: string }): string {
  return ["Seal a Mitoshi strategy memory", networkLine(input.network), `Strategy: ${input.strategyId}`, `Creator: ${input.creator.toLowerCase()}`, `Issued: ${input.issuedAtMs}`, `Title: ${input.title}`, readPriceLine(input.readPriceBase), "", input.body].join("\n");
}

export function readMemoryMessage(input: { network: Network; strategyId: string; reader: string; issuedAtMs: number }): string {
  return ["Read a Mitoshi strategy memory", networkLine(input.network), `Strategy: ${input.strategyId}`, `Reader: ${input.reader.toLowerCase()}`, `Issued: ${input.issuedAtMs}`].join("\n");
}
