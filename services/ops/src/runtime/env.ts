// Ported from Agari 03b30abb:services/ops/src/runtime/env.ts (Solana cluster → Tempo network).
/**
 * The ops actors' shared environment, read once at boot. Provider keys can ride inside RPC URLs, so every log line
 * that might carry a URL or error text goes through `redact` first.
 */
import { networkFrom, type Network } from "@cwf/core";

export interface OpsEnv {
  network: Network;
  /** Tempo HTTP RPC; may carry a provider key. Never log it. */
  tempoRpcUrl: string | undefined;
  /** True unless `DRY_RUN=0|false`: actors read, plan and log what they would send, and never sign. */
  dryRun: boolean;
  /** One HTTP server for `/health` and the streams. */
  httpPort: number;
  /** Comma-separated actor names to start; empty = all registered actors. */
  actors: string[];
  /** A pass running longer than this exits the process (Coolify restarts it). */
  stuckPassMs: number;
  /** Where role key files live when `<ROLE>_PRIVATE_KEY` is unset (`~/.config/cwf/<network>`). */
  keysDir: string | undefined;
  /** `OPS_INTERNAL_TOKEN` guards `/internal/*`; null disables those routes. */
  internalToken: string | null;
  /** `STREAM_TICKET_SECRET` verifies per-user stream tickets (D-049); null serves public topics only. */
  streamTicketSecret: string | null;
  /** Exact origins allowed to read the stream and the price routes (`OPS_CORS_ORIGINS`, comma-separated). */
  corsOrigins: string[];
}

const DEFAULT_HTTP_PORT = 8080;

/** The web origins per network (D-060): the testnet app and localhost dev on testnet; the apex on mainnet. */
const defaultOrigins = (network: Network) => (network === "mainnet" ? "https://mitoshi.xyz,https://www.mitoshi.xyz" : "https://testnet.mitoshi.xyz,http://localhost:3000");

export function readOpsEnv(env: NodeJS.ProcessEnv = process.env): OpsEnv {
  const port = Number(env.OPS_HTTP_PORT ?? env.PORT);
  const stuck = Number(env.OPS_STUCK_PASS_MS);
  return {
    network: networkFrom(env.NETWORK),
    tempoRpcUrl: env.TEMPO_RPC_HTTP_URL || undefined,
    dryRun: !(env.DRY_RUN === "0" || env.DRY_RUN === "false"),
    httpPort: Number.isInteger(port) && port > 0 ? port : DEFAULT_HTTP_PORT,
    actors: (env.OPS_ACTORS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    stuckPassMs: Number.isInteger(stuck) && stuck > 0 ? stuck : 10 * 60_000,
    keysDir: env.CWF_KEYS_DIR || undefined,
    internalToken: env.OPS_INTERNAL_TOKEN || null,
    streamTicketSecret: env.STREAM_TICKET_SECRET || null,
    corsOrigins: (env.OPS_CORS_ORIGINS ?? defaultOrigins(networkFrom(env.NETWORK))).split(",").map((s) => s.trim()).filter(Boolean),
  };
}

const SECRET_ENV = ["TEMPO_RPC_HTTP_URL", "TEMPO_RPC_WS_URL", "RH_RPC_HTTP_URL", "BASE_SEPOLIA_RPC_HTTP_URL", "DATABASE_URL", "OPS_INTERNAL_TOKEN", "STREAM_TICKET_SECRET", "FINNHUB_API_KEY", "ALPACA_KEY_ID", "ALPACA_SECRET_KEY", "DATASTREAMS_API_KEY", "DATASTREAMS_API_SECRET", "MPP_PAYER_PRIVATE_KEY", "TEMPO_INDEXER_API_KEY", "TIDX_URL", "TIDX_BASIC_AUTH"];

/** Every name that holds a secret: the list above plus any `*_PRIVATE_KEY`, `*_SECRET`, `*_TOKEN` or `*_API_KEY`. */
const secretNames = (env: NodeJS.ProcessEnv) => [...new Set([...SECRET_ENV, ...Object.keys(env).filter((k) => /(_PRIVATE_KEY|_SECRET|_TOKEN|_API_KEY|_KEY_ID|_URL)$/.test(k))])];

/** Replaces every configured secret in `text` with `<NAME>`. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const name of secretNames(env)) {
    const value = env[name];
    if (value && value.length >= 8) out = out.replaceAll(value, `<${name}>`);
  }
  return out;
}

/** The error's message plus its root cause and code, redacted. */
export function errorText(error: unknown): string {
  const top = error instanceof Error ? error.message : String(error);
  let root: unknown = error;
  for (let depth = 0; depth < 8 && (root as { cause?: unknown })?.cause; depth++) root = (root as { cause: unknown }).cause;
  if (root === error || !(root instanceof Error)) return redact(top);
  const code = (root as { code?: unknown }).code;
  const detail = `${root.message}${typeof code === "string" && !root.message.includes(code) ? ` [${code}]` : ""}`;
  return redact(top.includes(root.message) ? top : `${top} ← ${detail}`);
}
