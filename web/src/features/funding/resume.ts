// Add money signed out (R6 money, S25; D-230): the sign-in sheet opens titled for the money ("to get $1,000,000 test
// dollars") and Add money reopens by itself once an account is there. The promise lives in sessionStorage for ten
// minutes, so a passkey ceremony that reloads or takes a while still lands on Add money; a sheet closed without an
// account forgets it. Every storage call is wrapped: a private window or blocked storage just means no resume.
import { MODERATO_FAUCET_UNITS } from "@cwf/core/constants";

export const FUNDS_RESUME_KEY = "mitoshi.funds.resume";
export const FUNDS_RESUME_TTL_MS = 10 * 60_000;

export function markFundsResume(nowMs: number): void {
  try {
    sessionStorage.setItem(FUNDS_RESUME_KEY, String(nowMs + FUNDS_RESUME_TTL_MS));
  } catch {
    // no storage: no resume
  }
}

/** True (and forgotten) when a resume was promised and hasn't expired. */
export function takeFundsResume(nowMs: number): boolean {
  try {
    const until = Number(sessionStorage.getItem(FUNDS_RESUME_KEY));
    sessionStorage.removeItem(FUNDS_RESUME_KEY);
    return Number.isFinite(until) && until > nowMs;
  } catch {
    return false;
  }
}

export function clearFundsResume(): void {
  try {
    sessionStorage.removeItem(FUNDS_RESUME_KEY);
  } catch {
    // nothing to clear
  }
}

/** "$1,000,000" — what the faucet's first fund puts in an account, whole dollars. */
export const faucetDollars = (): string => `$${MODERATO_FAUCET_UNITS.toLocaleString("en-US")}`;
