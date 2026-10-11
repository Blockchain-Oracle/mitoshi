/**
 * The Memory Market's paid read, server side (S9.9b, L-56): mppx 0.10's documented server (`Mppx.create` +
 * `tempo.charge`, per its README and examples/charge-wagmi), one instance per process. The recipient and the amount
 * are set per request — the strategy's creator the chain names, the price the creator signed — so the instance holds
 * only the chain, the currency and the stores. Challenges are HMAC-bound by the secret key; a spent credential is
 * remembered in the caller's atomic store across restarts; a read is served only after its transfer confirms
 * (`waitForConfirmation`, mppx's default). Server-only — exported via `@cwf/markets/server`.
 */
import { Mppx, Store, tempo } from "mppx/server";
import type { Address, Client } from "viem";
import { formatBaseUnits, USD_DECIMALS, type Network } from "@cwf/core";
import { PATH_USD } from "../path-usd";

type Change<V, R> = { op: "noop"; result: R } | { op: "set"; value: V; result: R } | { op: "delete"; result: R };

/** mppx's atomic key-value store (`Store.AtomicStore`), e.g. `@cwf/db`'s `createPgMppStore`. */
export interface MemoryReadStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  update<R>(key: string, fn: (current: unknown) => Change<unknown, R>): Promise<R>;
}

export interface MemoryReadServerConfig {
  network: Network;
  /** The server's host, named in every challenge. */
  realm: string;
  /** ≥ 32 bytes (`MPP_SECRET_KEY`). */
  secretKey: string;
  getClient: () => Client;
  store: MemoryReadStore;
}

export function createMemoryReadServer(config: MemoryReadServerConfig) {
  const mppx = Mppx.create({
    realm: config.realm,
    secretKey: config.secretKey,
    methods: [
      tempo.charge({
        testnet: config.network === "testnet",
        currency: PATH_USD,
        getClient: () => config.getClient(),
        store: Store.from(config.store as never) as Store.AtomicStore,
      }),
    ],
  });
  return {
    /** 402 with the challenge, or the paid response with its receipt via `withReceipt`. */
    charge: (request: Request, read: { strategyId: string; title: string; priceBase: bigint; creator: Address }) =>
      mppx.charge({
        amount: formatBaseUnits(read.priceBase, USD_DECIMALS, { minDp: 0, maxDp: USD_DECIMALS }),
        recipient: read.creator,
        description: `One read of “${read.title}”`,
        externalId: `memory:${read.strategyId}`,
      })(request),
  };
}

export type MemoryReadServer = ReturnType<typeof createMemoryReadServer>;
