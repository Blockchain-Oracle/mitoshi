// Ported from Agari 03b30ab:packages/core/src/strategies/memory.ts — EIP-191 texts (Mitoshi's signed-message shape: the
// network named, addresses lowercased) in place of ed25519.
/**
 * The Memory Market's two signed texts (L-56): a creator seals what their agent has learned; a reader asks for it. Both
 * routes re-derive the text from the request and verify it, so a signature for one strategy, one wallet or one moment
 * opens nothing else. What opens a memory is on chain: the strategy's creator, or a live subscription to it.
 */
import { networkLine, type Network } from "../constants/network";

export const SEALED_TITLE_MAX = 80;
export const SEALED_BODY_MAX = 8_000;
/** A signed request is good for five minutes. */
export const MEMORY_SIGNATURE_TTL_MS = 5 * 60_000;

/** The body is part of the signed text, so it can't be swapped in transit. */
export function sealMemoryMessage(input: { network: Network; strategyId: string; creator: string; issuedAtMs: number; title: string; body: string }): string {
  return ["Seal a Mitoshi strategy memory", networkLine(input.network), `Strategy: ${input.strategyId}`, `Creator: ${input.creator.toLowerCase()}`, `Issued: ${input.issuedAtMs}`, `Title: ${input.title}`, "", input.body].join("\n");
}

export function readMemoryMessage(input: { network: Network; strategyId: string; reader: string; issuedAtMs: number }): string {
  return ["Read a Mitoshi strategy memory", networkLine(input.network), `Strategy: ${input.strategyId}`, `Reader: ${input.reader.toLowerCase()}`, `Issued: ${input.issuedAtMs}`].join("\n");
}
