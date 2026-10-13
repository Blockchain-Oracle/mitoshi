// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:services/ops/src/runtime/keys.ts (ed25519 keypairs → secp256k1 hex keys).
/**
 * A role's signing key (plan C.5.1): `<ROLE>_PRIVATE_KEY` (Coolify, runtime-only), else `~/.config/cwf/<network>/<role>.json`
 * (`CWF_KEYS_DIR` overrides the directory). Null means scan-and-report: an actor never guesses or shares a signer.
 * The value is handed to `@cwf/markets/ops` and never logged.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Hex } from "viem";
import type { Network } from "@cwf/core";

export type OpsRole = "roller" | "price-relay" | "settler" | "seed-maker" | "keeper" | "earn-quoter" | "ops-fee-payer" | "desk" | "stock-sync" | "x-relay" | "strategy-runner" | "agent-rater" | "launch-keeper";

/** `price-relay` → `PRICE_RELAY_PRIVATE_KEY`. */
export const roleEnvName = (role: OpsRole) => `${role.replaceAll("-", "_").toUpperCase()}_PRIVATE_KEY`;

const HEX_KEY = /^0x[0-9a-fA-F]{64}$/;

export function roleKey(role: OpsRole, network: Network, env: NodeJS.ProcessEnv = process.env, keysDir?: string): Hex | null {
  const fromEnv = env[roleEnvName(role)]?.trim();
  if (fromEnv && HEX_KEY.test(fromEnv)) return fromEnv as Hex;
  const file = join(keysDir ?? join(homedir(), ".config", "cwf", network), `${role}.json`);
  if (!existsSync(file)) return null;
  const key = (JSON.parse(readFileSync(file, "utf8")) as { privateKey?: string }).privateKey;
  return key && HEX_KEY.test(key) ? (key as Hex) : null;
}
