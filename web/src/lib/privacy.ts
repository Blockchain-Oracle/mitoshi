"use client";
/**
 * Privacy mode (S22, Slush's balance eye; `revamp-parity.md` RV-10): one tap hides every balance and PnL figure on
 * this device — the money pill, the terminal's equity pill and the line's PnL — until tapped again. Persisted in
 * localStorage, read through `useSyncExternalStore` so every figure flips in the same frame.
 */
import { useSyncExternalStore } from "react";

const KEY = "cwf.privacy";
const listeners = new Set<() => void>();
let hidden: boolean | null = null;

function read(): boolean {
  if (hidden === null) {
    try {
      hidden = localStorage.getItem(KEY) === "1";
    } catch {
      hidden = false;
    }
  }
  return hidden;
}

export function setPrivacy(next: boolean): void {
  hidden = next;
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable: the choice holds for this page */
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The same flag outside React (a toast fired from a write's callback, R4-4): true while balances are hidden. */
export function isPrivacyOn(): boolean {
  return typeof window !== "undefined" && read();
}

/** True while balances are hidden. The server render shows them (no storage there); the client corrects at once. */
export function usePrivacy(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
