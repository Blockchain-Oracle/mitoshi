import "server-only";
/** The web's one Memory Market read server (S9.9b; `@cwf/markets/server`'s mppx server over Postgres's `mpp_store`). */
import { createPgMppStore } from "@cwf/db";
import { tempoChain } from "@cwf/markets";
import { createMemoryReadServer, type MemoryReadServer } from "@cwf/markets/server";
import { createPublicClient, http } from "viem";
import { db } from "./db";
import { MissingConfigError, serverEnv } from "./env";

let instance: MemoryReadServer | null = null;

export function memoryReadServer(): MemoryReadServer {
  if (instance) return instance;
  const env = serverEnv();
  if (!env.mppSecretKey) throw new MissingConfigError("MPP_SECRET_KEY");
  // Its own client: verifying a payment broadcasts the payer's signed transfer (mppx pull mode) and reads its receipt,
  // and the public RPC rate-limits this box's shared traffic (-32005, "try again in 63ms"). A refused request was never
  // processed, so retrying it is safe; backoff 100 ms → 3.2 s over six tries.
  const client = createPublicClient({ chain: tempoChain(env.network), transport: http(env.rpcHttpUrl, { retryCount: 6, retryDelay: 100 }) });
  instance = createMemoryReadServer({ network: env.network, realm: new URL(env.appOrigin).host, secretKey: env.mppSecretKey, getClient: () => client, store: createPgMppStore(db()) });
  return instance;
}
