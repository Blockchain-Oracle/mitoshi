"use client";
// Tradash's "Wallet connected" / "Wallet disconnected" toasts (RV-92), on `lib/toast` (D-202: neutral, one id).
import { useEffect, useRef } from "react";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { TERMINAL } from "./copy";

export interface WalletWatch {
  restored: boolean;
  settled: boolean;
  address: string | null;
}

export const WALLET_WATCH: WalletWatch = { restored: false, settled: false, address: null };

/**
 * One step of the session as this tab sees it, and the toast it earns. A remembered session restoring on load is not a
 * connection: the shell shows signed-out until its lazy runtime loads and restores, so nothing toasts until the
 * session has been through its first "restoring" and settled. Pure.
 */
export function walletStep(w: WalletWatch, now: { address: string | null; isConnecting: boolean }): { next: WalletWatch; toast: "connected" | "disconnected" | null } {
  if (now.isConnecting) return { next: { ...w, restored: true }, toast: null };
  if (!w.restored) return { next: w, toast: null };
  const next = { restored: true, settled: true, address: now.address };
  if (!w.settled || w.address === now.address) return { next, toast: null };
  return { next, toast: now.address ? "connected" : "disconnected" };
}

export function useWalletToasts(): void {
  const { address, isConnecting } = useWalletSession();
  const watch = useRef<WalletWatch>(WALLET_WATCH);
  useEffect(() => {
    const { next, toast } = walletStep(watch.current, { address, isConnecting });
    watch.current = next;
    if (!toast) return;
    notify.item({ id: "wallet-session", title: TERMINAL.wallet[toast], description: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : undefined });
  }, [address, isConnecting]);
}
