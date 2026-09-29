/**
 * "Add money" is reachable from anywhere (a ticket's gate, a failure card, the header pill) by dispatching one event —
 * no prop drilling (Masayume 68f7a09 `features/funding/credited.ts` `openFunds`). The dialog that answers it mounts
 * lazily with the wallet (1b onboarding).
 */
export const OPEN_FUNDS_EVENT = "cwf:open-funds";

export function openFunds(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_FUNDS_EVENT));
}
