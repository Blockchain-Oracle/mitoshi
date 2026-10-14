/**
 * The chain port's configuration (Masayume 68f7a09:packages/markets/src/env.ts, rebuilt for Tempo). Every field is
 * optional with baked public defaults, so a build with no env still boots (read-only, "not deployed" everywhere).
 * Server secrets never live here: they are read by `@cwf/markets/server` from the process env.
 */
import { networkFrom, TEMPO_RPC_HTTP, TEMPO_RPC_WS, type Network } from "@cwf/core";

const isUrl = (v: string) => {
  try {
    return Boolean(new URL(v));
  } catch {
    return false;
  }
};

/** A comma-separated (or array) list of URLs; throws on an empty list or a malformed URL. Hand-rolled, not zod, so
 *  the browser's eager read path never loads a schema library (§3.1). */
function urlList(field: string, raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0 || !list.every(isUrl)) throw new Error(`${field}: expected one or more URLs`);
  return list;
}

function text(field: string, raw: unknown, url = false): string {
  if (typeof raw !== "string" || raw.length === 0 || (url && !isUrl(raw))) throw new Error(`${field}: expected ${url ? "a URL" : "a non-empty string"}`);
  return raw;
}

/** A browser page (not SSR, not ops): no DOM lib in every consumer's types, so it asks `globalThis`. */
const inBrowser = () => typeof (globalThis as { document?: unknown }).document !== "undefined";

export interface MarketsEnv {
  network: Network;
  /** Tempo JSON-RPC over HTTP (batched), first is preferred. */
  rpcHttpUrls: string[];
  /** Tempo JSON-RPC over WebSocket (logs, newHeads); empty disables the socket. A browser opens none unless asked
   *  (R6 S04: displays read ops' shared board; a socket per tab was its own load on the public RPC). */
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

export type MarketsEnvInput = Partial<Record<keyof MarketsEnv, unknown>>;

/** Parses the chain-port config; empty strings count as unset. Throws only on a malformed value. */
export function parseMarketsEnv(raw: MarketsEnvInput = {}): MarketsEnv {
  const d = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined && v !== "")) as MarketsEnvInput;
  const network = networkFrom(d.network === undefined ? undefined : text("network", d.network));
  return {
    network,
    rpcHttpUrls: d.rpcHttpUrls === undefined ? [TEMPO_RPC_HTTP[network]] : urlList("rpcHttpUrls", d.rpcHttpUrls),
    rpcWsUrls: d.rpcWsUrls === undefined ? (inBrowser() ? [] : [TEMPO_RPC_WS[network]]) : d.rpcWsUrls === "none" ? [] : urlList("rpcWsUrls", d.rpcWsUrls),
    relayUrl: d.relayUrl === undefined ? "/api/relay" : text("relayUrl", d.relayUrl),
    authUrl: d.authUrl === undefined ? "/api/auth" : text("authUrl", d.authUrl),
    opsUrl: d.opsUrl === undefined ? null : text("opsUrl", d.opsUrl, true),
    streamUrl: d.streamUrl === undefined ? null : text("streamUrl", d.streamUrl, true),
    indexUrl: d.indexUrl === undefined ? "/api/index" : text("indexUrl", d.indexUrl),
  };
}
