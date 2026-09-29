/**
 * Relay policy for the `engine` area (plan C.3.3; S4 owns the sponsorship decision, D-135). Registered in `POLICIES`.
 *
 * - `sponsor`: a holder's own trading and exits from the wallet (D-047 wallet mode): place, cancel, reduce, cancel-all,
 *   merge, withdraw credit, redeem (full and partial), and the crank opt-out. Every payout goes to `msg.sender`
 *   (AD-5), so sponsoring them moves nobody else's money.
 * - `never` (refuses the whole transaction): `mintSet` — pure capital intake into a complete set, with no trade the
 *   product needs (D-020/D-029: the root pays for its own money moving in) — and the admin and roller surface.
 * - Not sponsored (absent from both lists, the sender pays): the permissionless keeper calls (`recordPrint`,
 *   `copyOpenFromPrev`, `settle`, `voidExpired`, `sweepExpired`, `redeemFor`, `reserveNodes`, `sweepSurplus`) — ops
 *   actors sign and pay those themselves.
 * - Approvals: only `pathUSD.approve(engine, exact)` rides along (the engine checks: spender is a target, never max).
 * - Geofence: `placeOrder` is the markets entry (refused for restricted regions, Q-008); exits stay open everywhere.
 * - `maxGas`: a placement at the 16/16 caps is ≈ 1.95M gross (engine-gas.md) plus intrinsic; 3M leaves room for a new
 *   holder's two new slots.
 */
import type { Abi, Address } from "viem";
import { deployments } from "@cwf/clients";
import { eventsEngineAbi } from "@cwf/clients/abis/EventsEngine";
import { TEMPO } from "@cwf/clients";
import type { RelayPolicy } from "../types";
import { scopedKeyRule } from "../key-auth";
import { APPROVE_SELECTOR, engineSelector, WALLET_KEY_DAILY_LIMIT_BASE, WALLET_KEY_ENGINE_FUNCTIONS, WALLET_KEY_VALID_FOR_SEC } from "../../keys/wallet-key";

/**
 * Only `EventsEngine` itself on every chain it is deployed on. The area's generated relay targets also list the lens,
 * the verifiers and the linked libraries; none is ever called through the relay, and as targets they would pass the
 * `approve` spender check (an approval to a library would be sponsored), so the policy narrows to the engine.
 */
const engineAddresses = (): Address[] =>
  Object.values(deployments as unknown as Record<string, { engine?: { contracts: Record<string, { address: string }> } }>).flatMap((areas) => {
    const engine = areas.engine?.contracts.EventsEngine?.address;
    return engine ? [engine as Address] : [];
  });

/**
 * Gas the relay adds for a tap that publishes the wallet-mode key (D-136): the first tap measured 7.07M total on
 * Moderato against a later tap's ≈ 1–2.8M (X20, acceptance/S4.md), so ≈ 4.3M for the authorization (1 periodic limit,
 * 5 scopes, 1 recipient binding); 5M leaves room for a new account's slots.
 */
export const WALLET_KEY_AUTH_GAS = 5_000_000n;

const targets = engineAddresses();

/**
 * The only key the relay pays to publish: the wallet-mode key (D-047) — scoped to the engine's four trading
 * selectors plus `pathUSD.approve` bound to the engine, a periodic pathUSD limit ≤ Q-031's $25, expiring within 24 h
 * (renewal is another sponsored tap). An unrestricted, admin, longer-lived or wider key refuses the transaction.
 */
export const walletKeyRule = scopedKeyRule({
  extraGas: WALLET_KEY_AUTH_GAS,
  maxValidForSec: WALLET_KEY_VALID_FOR_SEC + 300,
  limitCaps: [{ token: TEMPO.pathUSD as Address, maxLimit: WALLET_KEY_DAILY_LIMIT_BASE }],
  allowed: [
    ...targets.flatMap((engine) => WALLET_KEY_ENGINE_FUNCTIONS.map((name) => ({ target: engine, selector: engineSelector(name) }))),
    { target: TEMPO.pathUSD as Address, selector: APPROVE_SELECTOR, recipients: targets },
  ],
});

export const enginePolicy: RelayPolicy = {
  area: "engine",
  targets,
  abi: eventsEngineAbi as Abi,
  sponsor: [
    "placeOrder",
    "cancelOrders",
    "reduceOrder",
    "cancelAll",
    "mergeSet",
    "withdrawCredit",
    "redeem",
    "redeemPartial",
    "setCrankOptOut",
  ],
  never: ["mintSet", "registerSeries", "addPolicyVersion", "openWindow", "setMode", "setRoller", "transferAdmin", "acceptAdmin"],
  pillar: "markets",
  entry: ["placeOrder"],
  maxGas: 3_000_000n,
  keyAuthorization: walletKeyRule,
};
