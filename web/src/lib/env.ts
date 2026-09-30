// Ported from Masayume 68f7a09:web/src/lib/env.ts — the Tempo chain port's public config. No zod here: this module is
// in every route's first load, so the few web-only fields are checked by hand (§3.1).
import { parseMarketsEnv, type MarketsEnv } from "@cwf/markets/env";

export interface WebEnv {
  markets: MarketsEnv;
  walletConnectProjectId?: string;
  appOrigin: string;
}

function origin(raw: string | undefined): string {
  if (!raw) return "http://localhost:3000";
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(`NEXT_PUBLIC_APP_ORIGIN: expected a URL, got ${raw}`);
  }
}

// Every NEXT_PUBLIC_* variable is referenced literally so Next can inline it into the client bundle. Each one is
// optional: with no .env the app boots read-only against Moderato from baked defaults.
export const webEnv: WebEnv = {
  markets: parseMarketsEnv({
    network: process.env.NEXT_PUBLIC_NETWORK,
    rpcHttpUrls: process.env.NEXT_PUBLIC_TEMPO_RPC_HTTP_URLS,
    rpcWsUrls: process.env.NEXT_PUBLIC_TEMPO_RPC_WS_URLS,
    opsUrl: process.env.NEXT_PUBLIC_OPS_URL,
    streamUrl: process.env.NEXT_PUBLIC_STREAM_URL,
    // Our index API (default `/api/index`, same origin); a deployment whose indexer lives elsewhere points here.
    indexUrl: process.env.NEXT_PUBLIC_INDEX_URL,
  }),
  ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ? { walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID } : {}),
  appOrigin: origin(process.env.NEXT_PUBLIC_APP_ORIGIN),
};
