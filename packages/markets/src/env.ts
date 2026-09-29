/**
 * The chain port's configuration (Masayume 68f7a09:packages/markets/src/env.ts, rebuilt for Tempo). Every field is
 * optional with baked public defaults, so a build with no env still boots (read-only, "not deployed" everywhere).
 * Server secrets never live here: they are read by `@cwf/markets/server` from the process env.
 */
import { z } from "zod";
import { networkFrom, TEMPO_RPC_HTTP, TEMPO_RPC_WS, type Network } from "@cwf/core";

const urlList = z.preprocess(
  (raw) => (typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : raw),
  z.array(z.url()).min(1),
);

export interface MarketsEnv {
  network: Network;
  /** Tempo JSON-RPC over HTTP (batched), first is preferred. */
  rpcHttpUrls: string[];
  /** Tempo JSON-RPC over WebSocket (logs, newHeads); empty disables the socket. */
  rpcWsUrls: string[];
  /** Our fee relay (`/api/relay`), relative in the browser. */
  relayUrl: string;
  /** Our passkey ceremony handler (`/api/auth`). */
  authUrl: string;
  /** Ops HTTP base (prices, session, health); null until configured. */
  opsUrl: string | null;
  /** The one SSE stream (`stream.<domain>`, D-049); null until configured. */
  streamUrl: string | null;
  /** Our index API (`/api/index`). */
  indexUrl: string;
}

const schema = z.object({
  network: z.string().optional(),
  rpcHttpUrls: urlList.optional(),
  rpcWsUrls: urlList.optional(),
  relayUrl: z.string().min(1).optional(),
  authUrl: z.string().min(1).optional(),
  opsUrl: z.url().optional(),
  streamUrl: z.url().optional(),
  indexUrl: z.string().min(1).optional(),
});

export type MarketsEnvInput = Partial<Record<keyof z.input<typeof schema>, unknown>>;

/** Parses the chain-port config; empty strings count as unset. Throws only on a malformed value. */
export function parseMarketsEnv(raw: MarketsEnvInput = {}): MarketsEnv {
  const defined = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.parse(defined);
  const network = networkFrom(parsed.network);
  return {
    network,
    rpcHttpUrls: parsed.rpcHttpUrls ?? [TEMPO_RPC_HTTP[network]],
    rpcWsUrls: parsed.rpcWsUrls ?? [TEMPO_RPC_WS[network]],
    relayUrl: parsed.relayUrl ?? "/api/relay",
    authUrl: parsed.authUrl ?? "/api/auth",
    opsUrl: parsed.opsUrl ?? null,
    streamUrl: parsed.streamUrl ?? null,
    indexUrl: parsed.indexUrl ?? "/api/index",
  };
}
