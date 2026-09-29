import "server-only";
/**
 * Test funds (plan C.3.4, L-25): quotas in Postgres, funding by the node's `tempo_fundAddress`. Two ways in — the
 * passkey session of the one-ceremony sign-up (D-046: no second prompt, the session already proves the address), or
 * a one-time signed challenge for wallet sign-ins. Mainnet has no faucet (L-26): the routes answer 404 with the
 * funding options instead.
 */
import { randomUUID } from "node:crypto";
import { createPgFaucetStore, type FaucetStore } from "@cwf/db";
import type { Address } from "@cwf/core";
import { faucetClaimView, faucetCooldownUntilMs, TEMPO_FAUCET_POLICY, type FaucetAuth, type FaucetClaimView } from "@cwf/core/faucet";
import { tempoChain } from "@cwf/markets";
import { fundAddress } from "@cwf/markets/server";
import { createPublicClient, http, type PublicClient } from "viem";
import { db } from "./db";
import { serverEnv } from "./env";

let store: FaucetStore | null = null;
let client: PublicClient | null = null;

export function faucetStore(): FaucetStore {
  store ??= createPgFaucetStore(db());
  return store;
}

export function chainClient(): PublicClient {
  const env = serverEnv();
  client ??= createPublicClient({ chain: tempoChain(env.network), transport: http(env.rpcHttpUrl) }) as PublicClient;
  return client;
}

/** Mainnet answer: no faucet, and where real dollars come from (the Add funds surface lists the same). */
export function noFaucet(): Response {
  return Response.json(
    { error: "no_faucet", message: "There are no test funds on mainnet. Add dollars with a card, an exchange, or a transfer from another wallet." },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

export type ClaimOutcome = { ok: true; claim: FaucetClaimView } | { ok: false; status: number; code: string; message: string; nextClaimAtMs?: number };

export async function claimFunds(input: { wallet: Address; auth: FaucetAuth; ipHash: string; nowMs: number }): Promise<ClaimOutcome> {
  const s = faucetStore();
  const until = faucetCooldownUntilMs(await s.lastFunded(input.wallet), input.nowMs);
  if (until !== null) return { ok: false, status: 429, code: "cooldown", message: "This wallet already got test funds today.", nextClaimAtMs: until };
  const dayAgo = input.nowMs - 86_400_000;
  if ((await s.countSince(dayAgo, input.ipHash)) >= TEMPO_FAUCET_POLICY.maxPerIpPerDay) {
    return { ok: false, status: 429, code: "ip_quota", message: "Too many test-fund requests from this network today." };
  }
  if ((await s.countSince(dayAgo)) >= TEMPO_FAUCET_POLICY.maxPerDay) {
    return { ok: false, status: 503, code: "daily_cap", message: "Test funds are used up for today. Try again tomorrow." };
  }
  const base = { id: randomUUID(), wallet: input.wallet, ipHash: input.ipHash, auth: input.auth, createdAtMs: input.nowMs };
  try {
    const txHashes = await fundAddress(chainClient(), input.wallet);
    const claim = { ...base, txHashes, status: "funded" as const };
    await s.saveClaim(claim);
    return { ok: true, claim: faucetClaimView(claim) };
  } catch (error) {
    await s.saveClaim({ ...base, txHashes: [], status: "failed" });
    return { ok: false, status: 502, code: "fund_failed", message: `The testnet faucet did not answer: ${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}` };
  }
}
