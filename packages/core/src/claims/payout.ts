// Ported from Masayume 68f7a09:packages/core/src/claims/payout.ts
import { BPS_DENOMINATOR } from "../constants/sizing";
import { mulBps } from "../units/money";

/**
 * A winning contract redeems for one collateral unit less the settlement fee; a void pays both sides
 * half, gross — the venue skims no fee on a void (canon #11, AD-15).
 */
export function estPayoutBase(amountRaw: bigint, kind: "win" | "void", feeBps: number): bigint {
  return kind === "void" ? amountRaw / 2n : mulBps(amountRaw, BPS_DENOMINATOR - feeBps);
}
