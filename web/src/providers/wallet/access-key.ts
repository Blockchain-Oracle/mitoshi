/**
 * The wallet-mode access key's policy (D-047, plan S1 1b wallet: "the connector config carries the
 * `accessKey.authorize` hook, activated in S4 when the engine address exists"). Scopes: the engine's place / cancel /
 * redeem / withdrawCredit and pathUSD `approve(engine)`; a daily pathUSD limit (Q-031 default $25/day, 24 h). While the
 * engine is not deployed on this network the hook returns undefined, so the ceremony authorises nothing. The engine
 * landed on Moderato (S2), so the scopes carry the full signatures from the generated ABI — the keychain's selector
 * parser rejects a bare function name ("Unable to normalize signature").
 */
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { deploymentOf, PATH_USD } from "@cwf/markets";
import { toFunctionSignature, type AbiFunction } from "viem";
import { TEMPO_CHAIN_ID } from "./chain-id";

/** Q-031 defaults until the owner answers: $25 a day for 24 hours, renewable in one tap. */
export const ACCESS_KEY_DEFAULTS = { dailyLimitBase: 25_000_000n, expirySec: 24 * 60 * 60 } as const;

const SCOPED = ["placeOrder", "cancelOrders", "cancelAll", "redeem", "withdrawCredit"] as const;

/** The engine functions the key may call, as full signatures (e.g. `redeem(bytes32)`), from the generated ABI. */
export const ENGINE_KEY_SIGNATURES: readonly string[] = SCOPED.map((name) => {
  const fn = (eventsEngineAbi as readonly { type: string; name?: string }[]).find((i) => i.type === "function" && i.name === name);
  if (!fn) throw new Error(`engine ABI has no ${name}`);
  return toFunctionSignature(fn as AbiFunction);
});

/**
 * Arming is an explicit, offered step (D-046: one biometric to a funded account; the ceremony's arm slot, filled by
 * S4). The connector calls this hook on every connect, so it answers only while an arm step has asked for a key —
 * never silently at registration, which would add a second passkey prompt to sign-up.
 */
let armRequested = false;

export function requestArm(on: boolean): void {
  armRequested = on;
}

export function accessKeyPolicy() {
  if (!armRequested) return undefined;
  const engine = deploymentOf("engine", TEMPO_CHAIN_ID)?.EventsEngine?.address;
  if (!engine) return undefined;
  const now = Math.floor(Date.now() / 1000);
  return {
    expiry: now + ACCESS_KEY_DEFAULTS.expirySec,
    limits: [{ token: PATH_USD, limit: ACCESS_KEY_DEFAULTS.dailyLimitBase, period: 86_400 }],
    scopes: [
      ...ENGINE_KEY_SIGNATURES.map((selector) => ({ address: engine, selector })),
      { address: PATH_USD, selector: "approve(address,uint256)", recipients: [engine] },
    ],
  };
}
