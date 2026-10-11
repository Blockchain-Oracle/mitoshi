import "server-only";
/** The web's one Memory Market read server (S9.9b; `@cwf/markets/server`'s mppx server over Postgres's `mpp_store`). */
import { createPgMppStore } from "@cwf/db";
import { createMemoryReadServer, type MemoryReadServer } from "@cwf/markets/server";
import { db } from "./db";
import { MissingConfigError, serverEnv } from "./env";
import { chainClient } from "./faucet";

let instance: MemoryReadServer | null = null;

export function memoryReadServer(): MemoryReadServer {
  if (instance) return instance;
  const env = serverEnv();
  if (!env.mppSecretKey) throw new MissingConfigError("MPP_SECRET_KEY");
  instance = createMemoryReadServer({ network: env.network, realm: new URL(env.appOrigin).host, secretKey: env.mppSecretKey, getClient: () => chainClient(), store: createPgMppStore(db()) });
  return instance;
}
