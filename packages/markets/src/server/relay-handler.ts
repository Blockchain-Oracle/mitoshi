/**
 * The fee relay (plan C.3.3; accounts 0.18.4 `Handler.relay`): built ONCE at module scope (D-055) with our fee payer,
 * pathUSD as its fee token, `features` off, and a `validate` that runs the policy engine + budgets. `validate` runs on
 * both the fill and the raw send; it reads the request's method, device and region from AsyncLocalStorage, which the
 * route sets around each request, so budgets are debited only on raw sign/send.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { Handler } from "accounts/server";
import { createPublicClient, http, type Address, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TEMPO } from "@cwf/clients";
import type { RelayContext, RelayPolicy } from "../relay/types";
import type { GateLimits } from "../relay/gates";
import type { LedgerStore } from "../relay/ledger";
import { createRelayValidator } from "../relay/validator";

export interface RelayHandlerConfig {
  chain: Chain;
  rpcUrl: string;
  feePayerPrivateKey: `0x${string}`;
  policies: readonly RelayPolicy[];
  ledger: LedgerStore;
  limits: GateLimits;
  /** pathUSD balance of the fee payer in micros, cached by the caller; null when unreadable (the breaker holds). */
  feePayerBalance: () => Promise<bigint | null>;
  path: string;
  onVerdict?: Parameters<typeof createRelayValidator>[0]["onVerdict"];
}

export const relayContext = new AsyncLocalStorage<RelayContext>();

export function createRelayHandler(config: RelayHandlerConfig) {
  const account = privateKeyToAccount(config.feePayerPrivateKey);
  const reader = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const validate = createRelayValidator({
    engine: { chainId: config.chain.id, feePayer: account.address, policies: config.policies },
    ledger: config.ledger,
    limits: config.limits,
    getContext: () => relayContext.getStore(),
    feePayerBalance: config.feePayerBalance,
    onVerdict: config.onVerdict,
    // TIP-1000 first-transaction gas: a sender whose protocol nonce is 0 has never transacted. "pending" so a fill that
    // races its own earlier send is not given the allowance twice.
    senderIsNew: async (sender) => (await reader.getTransactionCount({ address: sender, blockTag: "pending" })) === 0,
  });
  const handler = Handler.relay({
    chains: [config.chain] as never,
    // One retry for a transient RPC failure; an engine or keychain revert inside the fill must come back at once (X20).
    transports: { [config.chain.id]: http(config.rpcUrl, { retryCount: 1 }) },
    feePayer: { account, feeToken: TEMPO.pathUSD as Address, validate: validate as never, name: "Mitoshi" },
    path: config.path,
  });
  return { handler, feePayer: account.address };
}
