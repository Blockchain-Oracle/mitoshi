/**
 * The payer from the process env (plan C.5.3; names in infra/secrets.md): `MPP_PAYER_PRIVATE_KEY` (the access key),
 * `MPP_ROOT_ADDRESS` (the account it signs for), `NETWORK`. Mainnet refuses to build a payer unless
 * `MPP_MAINNET_APPROVED=1` — the owner's go on Q-020 — so a stray key cannot spend real funds. Caps default to the
 * payer key's own TIP-1011 limits per request/day unless `MPP_MAX_PER_REQUEST_BASE` / `MPP_MAX_PER_DAY_BASE` narrow them.
 */
import { getAddress, isAddress, type Hex } from "viem";
import { networkFrom, type Network } from "@cwf/core";
import { defaultPayerLimits } from "./access-key";
import type { MppCaps } from "./caps";
import { createMppPayer, defaultMppCaps, type MppPayer } from "./payer";
import type { ReceiptSink } from "./receipts";

export type PayerFromEnv = { payer: MppPayer; network: Network; caps: MppCaps } | { payer: null; reason: string };

const baseUnits = (v: string | undefined, fallback: bigint): bigint => (v && /^\d+$/.test(v) ? BigInt(v) : fallback);

export function mppCapsFromEnv(network: Network, env: NodeJS.ProcessEnv = process.env): MppCaps {
  const perDayCap = baseUnits(env.MPP_MAX_PER_DAY_BASE, 0n);
  const perRequest = baseUnits(env.MPP_MAX_PER_REQUEST_BASE, 50_000n);
  const currencies = Object.fromEntries(
    defaultPayerLimits(network).map((l) => [l.token.toLowerCase(), { perRequestBase: perRequest, perDayBase: perDayCap > 0n && perDayCap < l.amountBase ? perDayCap : l.amountBase }]),
  );
  return defaultMppCaps(network, currencies);
}

export function mppPayerFromEnv(sink?: ReceiptSink, env: NodeJS.ProcessEnv = process.env): PayerFromEnv {
  const network = networkFrom(env.NETWORK);
  const key = env.MPP_PAYER_PRIVATE_KEY?.trim();
  const root = env.MPP_ROOT_ADDRESS?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return { payer: null, reason: "MPP_PAYER_PRIVATE_KEY is not set" };
  if (!root || !isAddress(root)) return { payer: null, reason: "MPP_ROOT_ADDRESS is not set" };
  if (network === "mainnet" && env.MPP_MAINNET_APPROVED !== "1") return { payer: null, reason: "mainnet MPP waits for the owner's go (Q-020): MPP_MAINNET_APPROVED is not 1" };
  const caps = mppCapsFromEnv(network, env);
  const payer = createMppPayer({ network, privateKey: key as Hex, root: getAddress(root), caps, ...(sink ? { sink } : {}), ...(env.TEMPO_RPC_HTTP_URL ? { rpcUrl: env.TEMPO_RPC_HTTP_URL } : {}) });
  return { payer, network, caps };
}
