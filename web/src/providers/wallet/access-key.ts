/**
 * The wallet-mode access key's policy (D-047, plan S1 1b wallet: "the connector config carries the
 * `accessKey.authorize` hook, activated in S4 when the engine address exists"). Scopes: the engine's place / cancel /
 * redeem / withdrawCredit and pathUSD `approve(engine)`; a daily pathUSD limit (Q-031 default $25/day, 24 h). While the
 * engine is not deployed on this network the hook returns undefined, so the ceremony authorises nothing.
 */
import { deploymentOf, PATH_USD } from "@cwf/markets";
import { TEMPO_CHAIN_ID } from "./chain-id";

/** Q-031 defaults until the owner answers: $25 a day for 24 hours, renewable in one tap. */
export const ACCESS_KEY_DEFAULTS = { dailyLimitBase: 25_000_000n, expirySec: 24 * 60 * 60 } as const;

/** Function names; S4 swaps them for the full signatures from the generated engine ABI when it activates the key. */
const SELECTORS = ["placeOrder", "cancelOrders", "cancelAll", "redeem", "withdrawCredit"] as const;

export function accessKeyPolicy() {
  const engine = deploymentOf("engine", TEMPO_CHAIN_ID)?.EventsEngine?.address;
  if (!engine) return undefined;
  const now = Math.floor(Date.now() / 1000);
  return {
    expiry: now + ACCESS_KEY_DEFAULTS.expirySec,
    limits: [{ token: PATH_USD, limit: ACCESS_KEY_DEFAULTS.dailyLimitBase, period: 86_400 }],
    scopes: [
      ...SELECTORS.map((selector) => ({ address: engine, selector })),
      { address: PATH_USD, selector: "approve(address,uint256)", recipients: [engine] },
    ],
  };
}
