/**
 * The remembered stake (D-048, ux-audit fix 9): after a fill the next call is one tap — the ticket opens with the last
 * stake this account filled, instead of Masayume's empty field ("Place another" cleared it, ticket/Ticket.tsx
 * L221-227). Per account, best-effort storage; a first call starts empty.
 */
import type { Address } from "@cwf/core";

const PREFIX = "cwf.lastStake.v1";
const key = (wallet: Address) => `${PREFIX}.${wallet.toLowerCase()}`;

export function rememberStake(wallet: Address, stakeBase: bigint): void {
  if (stakeBase <= 0n) return;
  try {
    window.localStorage.setItem(key(wallet), stakeBase.toString());
  } catch {
    // storage unavailable: the next call simply starts empty
  }
}

export function recallStake(wallet: Address | null): bigint | null {
  if (!wallet) return null;
  try {
    const raw = window.localStorage.getItem(key(wallet));
    return raw && /^\d+$/.test(raw) && BigInt(raw) > 0n ? BigInt(raw) : null;
  } catch {
    return null;
  }
}
