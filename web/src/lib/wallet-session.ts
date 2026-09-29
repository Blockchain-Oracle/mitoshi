"use client";
// Ported from Agari 03b30ab:web/src/lib/wallet-session.ts — the sole wallet surface in product code (session only,
// never chain reads, AD-14; D-055 wagmi 3). Tempo addresses are EVM hex; `isRightChain` is real again for injected
// wallets (L-10), while passkey accounts are chain-bound.
import type { Address } from "@cwf/core";
import type { SignerCaps } from "@cwf/markets";
import { useWalletShell, type TempoAccountKind } from "@/providers/wallet/wallet-shell-context";

export interface WalletSession {
  address: Address | null;
  kind: TempoAccountKind | null;
  caps: SignerCaps | null;
  isConnected: boolean;
  /** A remembered connection is silently reconnecting (≤ 3 s after hydration). */
  isConnecting: boolean;
  isRightChain: boolean;
  connect(): void;
  openAccount(): void;
  disconnect(): Promise<void>;
  switchToTempo(): Promise<void>;
}

export function useWalletSession(): WalletSession {
  const shell = useWalletShell();
  const tempo = shell.status === "ready" ? shell.tempo : null;
  return {
    address: tempo?.address ?? null,
    kind: tempo?.kind ?? null,
    caps: tempo?.caps ?? null,
    isConnected: tempo !== null,
    isConnecting: shell.status === "restoring",
    isRightChain: tempo !== null && !shell.wrongChain,
    connect: () => shell.openPicker("tempo"),
    openAccount: shell.openAccount,
    disconnect: shell.disconnect,
    switchToTempo: shell.switchToTempo,
  };
}
