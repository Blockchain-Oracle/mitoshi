import "server-only";
/**
 * The relay, built once per process (D-055): policies for every deployed area, budgets over the Postgres ledger, the
 * fee payer's pathUSD balance cached for 30 s (the breaker), and the verdict log for the status page.
 */
import { createPgLedger } from "@cwf/db";
import { tempoChain } from "@cwf/markets";
import { createRelayHandler, DEFAULT_LIMITS, POLICIES, type PolicyVerdict } from "@cwf/markets/server";
import { PATH_USD } from "@cwf/markets";
import type { RelayStatus } from "@cwf/markets";
import { createPublicClient, erc20Abi, http } from "viem";
import { db } from "./db";
import { MissingConfigError, serverEnv } from "./env";

export const RELAY_PATH = "/api/relay";
const BALANCE_TTL_MS = 30_000;

type Relay = ReturnType<typeof createRelayHandler> & { balance: () => Promise<bigint | null>; lastVerdicts: RelayStatus["recent"] };
let relay: Relay | null = null;

export function relayHandler(): Relay {
  if (relay) return relay;
  const env = serverEnv();
  if (!env.feePayerKey) throw new MissingConfigError("RELAY_FEE_PAYER_PRIVATE_KEY");
  const chain = tempoChain(env.network);
  const client = createPublicClient({ chain, transport: http(env.rpcHttpUrl) });
  let cached: { atMs: number; value: bigint | null } | null = null;
  const lastVerdicts: Relay["lastVerdicts"] = [];
  const built = createRelayHandler({
    chain,
    rpcUrl: env.rpcHttpUrl,
    feePayerPrivateKey: env.feePayerKey,
    policies: POLICIES,
    ledger: createPgLedger(db()),
    limits: DEFAULT_LIMITS,
    path: RELAY_PATH,
    feePayerBalance: async () => balance(),
    onVerdict: (v: PolicyVerdict, ctx) => {
      lastVerdicts.push({ atSec: ctx.nowSec, method: ctx.method, ok: v.ok, code: v.ok ? null : v.code });
      if (lastVerdicts.length > 20) lastVerdicts.shift();
    },
  });
  let refreshing: Promise<bigint | null> | null = null;
  const refresh = () =>
    (refreshing ??= client
      .readContract({ address: PATH_USD, abi: erc20Abi, functionName: "balanceOf", args: [built.feePayer] })
      .catch(() => null)
      .then((value) => {
        cached = { atMs: Date.now(), value };
        refreshing = null;
        return value;
      }));
  // Stale-while-revalidate: after the first read no fill waits on the RPC for the breaker's balance (D-150); a stale
  // value is at most one TTL plus one read old, and an unreadable balance still holds the breaker (null).
  async function balance(): Promise<bigint | null> {
    if (!cached) return refresh();
    if (Date.now() - cached.atMs >= BALANCE_TTL_MS) void refresh();
    return cached.value;
  }
  relay = { ...built, balance, lastVerdicts };
  return relay;
}
