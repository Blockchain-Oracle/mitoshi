// Ported from Masayume 68f7a09:web/src/features/funding/credited.ts — the per-address "welcomed once" guard.
import { CREDITED_EVENT } from "./copy";

/** Fired by the sign-in modal the moment a new passkey account exists; `FundsHost` funds it (D-224). */
export const ACCOUNT_CREATED_EVENT = "cwf:account-created";

export interface CreditedDetail {
  address: string;
  firstTime: boolean;
}

const WELCOMED_KEY = (address: string) => `cwf.welcomed.${address.toLowerCase()}`;

/** The FIRST credit for an address is the celebratory moment (`CreditWelcome`); later ones are a toast. */
export function announceCredit(address: string): boolean {
  let firstTime = false;
  try {
    firstTime = !localStorage.getItem(WELCOMED_KEY(address));
    if (firstTime) localStorage.setItem(WELCOMED_KEY(address), "1");
  } catch {
    // storage refused — the toast still says it happened
  }
  window.dispatchEvent(new CustomEvent<CreditedDetail>(CREDITED_EVENT, { detail: { address, firstTime } }));
  return firstTime;
}

let suppressed = 0;
/** While a surface shows its own funded receipt (onboarding, Add money), the separate welcome would be a second wall. */
export function suppressWelcome(): () => void {
  suppressed += 1;
  return () => {
    suppressed -= 1;
  };
}

export function isWelcomeSuppressed(): boolean {
  return suppressed > 0;
}
