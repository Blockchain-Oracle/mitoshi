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
  /** A pass running longer than this exits the process (Fly restarts it). */
  stuckPassMs: number;
}

const DEFAULT_HTTP_PORT = 8080;

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
  };
}

const SECRET_ENV = ["TEMPO_RPC_HTTP_URL", "TEMPO_RPC_WS_URL", "RH_RPC_HTTP_URL", "BASE_SEPOLIA_RPC_HTTP_URL", "DATABASE_URL", "OPS_INTERNAL_TOKEN", "STREAM_TICKET_SECRET", "FINNHUB_API_KEY", "ALPACA_KEY_ID", "ALPACA_SECRET_KEY", "DATASTREAMS_API_KEY", "DATASTREAMS_API_SECRET"];

/** Replaces every configured secret in `text` with `<NAME>`. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let out = text;
  for (const name of SECRET_ENV) {
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
