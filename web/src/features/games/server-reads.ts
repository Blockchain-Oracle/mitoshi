import "server-only";
import { configureMarkets, marketsEnv } from "@cwf/markets";
import { webEnv } from "@/lib/env";
import { serverEnv } from "@/server/env";

/**
 * The games servers' chain reads (R4-9, D-227): packages/markets on the app's own config (`webEnv.markets`: network,
 * RPC, ops), reading the index over HTTP from the app itself — a relative base only resolves in a browser. The base is
 * the deployment's `APP_ORIGIN`, never a request's Host header: the markets config is process-wide, so a forged header
 * would repoint every later Lucky, Duel and season read.
 */
export function ensureServerReads(): void {
  const env = webEnv.markets;
  const indexUrl = /^https?:\/\//.test(env.indexUrl) ? env.indexUrl : `${serverEnv().appOrigin}${env.indexUrl}`;
  if (marketsEnv().indexUrl === indexUrl && marketsEnv().network === env.network) return;
  configureMarkets({ ...env, indexUrl });
}
