"use client";
// Whether a brand-new account's first funding is running (R4-4, D-227; critic gap 10): the order CTAs (the ticket, the
// terminal, Range) name it — "Funding your account…" — instead of reading as short of funds while the faucet lands,
// then turn back into the order. One flag, set by `FirstFund`, read with `useFirstFunding`.
import { useSyncExternalStore } from "react";

let running = false;
const listeners = new Set<() => void>();

export function setFirstFunding(next: boolean): void {
  if (running === next) return;
  running = next;
  for (const l of listeners) l();
}

export function useFirstFunding(): boolean {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => running,
    () => false,
  );
}
