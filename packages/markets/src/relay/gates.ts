/**
 * Relay budgets (plan C.3.3): per sender per hour, per device per hour (`x-cwf-device`), per device fee per day,
 * global fee per day, and a low-balance breaker on the fee payer. Counted over the ledger, so every instance sees
 * the same budget. Debited on every co-signature: accounts 0.18.4 attaches the fee-payer signature to the FILL result
 * (measured on Moderato 2026-09-29: the client then sends the raw tx straight to the RPC, never back through us), so
 * an approved fill is a spend; a raw sign/send reaches `validate` only for a sponsored tx the fill did not sign.
 */
import type { Address } from "viem";
import type { LedgerStore } from "./ledger";
import type { PolicyVerdict } from "./types";

/** The relay methods whose approval produces a fee-payer signature, so each approval is debited. */
export const SIGNING_METHODS: ReadonlySet<string> = new Set(["eth_fillTransaction", "eth_signRawTransaction", "eth_sendRawTransaction", "eth_sendRawTransactionSync"]);

export interface GateLimits {
  perSenderPerHour: number;
  perDevicePerHour: number;
  perDeviceFeePerDayMicros: bigint;
  globalFeePerDayMicros: bigint;
  /** Below this fee-payer pathUSD balance the relay stops sponsoring (the breaker). */
  breakerMinBalanceMicros: bigint;
}

/** Testnet defaults: generous for real use, tight enough that a script can't drain the fee payer. */
export const DEFAULT_LIMITS: GateLimits = {
  perSenderPerHour: 120,
  perDevicePerHour: 240,
  perDeviceFeePerDayMicros: 5_000_000n,
  globalFeePerDayMicros: 500_000_000n,
  breakerMinBalanceMicros: 20_000_000n,
};

const HOUR = 3_600;
const DAY = 86_400;

export interface GateInput {
  sender: Address;
  device: string | null;
  feeMicros: bigint;
  nowSec: number;
  /** The fee payer's pathUSD balance (micros), or null when it couldn't be read (the breaker then holds). */
  feePayerBalanceMicros: bigint | null;
}

export async function checkGates(ledger: LedgerStore, limits: GateLimits, input: GateInput): Promise<PolicyVerdict | null> {
  if (input.feePayerBalanceMicros === null || input.feePayerBalanceMicros < limits.breakerMinBalanceMicros) {
    return { ok: false, code: "breaker", reason: "the fee payer is below its safety balance" };
  }
  // Every total in one round trip to the ledger (a sponsored tap waits on this, D-150).
  const none = Promise.resolve(null);
  const [sender, global, deviceHour, deviceDay] = await Promise.all([
    ledger.totals({ sinceSec: input.nowSec - HOUR, sender: input.sender }),
    ledger.totals({ sinceSec: input.nowSec - DAY }),
    input.device ? ledger.totals({ sinceSec: input.nowSec - HOUR, device: input.device }) : none,
    input.device ? ledger.totals({ sinceSec: input.nowSec - DAY, device: input.device }) : none,
  ]);
  if (sender.count >= limits.perSenderPerHour) return { ok: false, code: "budget", reason: "sender hourly budget used" };
  if (global.feeMicros + input.feeMicros > limits.globalFeePerDayMicros) return { ok: false, code: "budget", reason: "daily sponsorship budget used" };
  if (deviceHour && deviceHour.count >= limits.perDevicePerHour) return { ok: false, code: "budget", reason: "device hourly budget used" };
  if (deviceDay && deviceDay.feeMicros + input.feeMicros > limits.perDeviceFeePerDayMicros) return { ok: false, code: "budget", reason: "device daily fee budget used" };
  return null;
}
