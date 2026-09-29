"use client";
// Ported from Agari 03b30ab:web/src/providers/wallet/wallet-shell-context.ts — the two-wallet model (C.3.1): a Tempo
// account (passkey, Tempo Wallet or an injected wallet) and, separately, a Robinhood Chain wallet for bridge-in.
// Every consumer reads this; only `web/src/providers/wallet` touches wagmi.
import type { Address } from "@cwf/core";
import type { SignerCaps } from "@cwf/markets";
import { createContext, useContext } from "react";

/** `restoring`: a remembered connection is silently reconnecting after hydration (≤ 3 s). `ready`: everything else. */
export type WalletShellStatus = "restoring" | "ready";

export type TempoAccountKind = "passkey" | "tempo-wallet" | "injected" | "walletconnect";

export interface TempoAccount {
  address: Address;
  chainId: number;
  kind: TempoAccountKind;
  /** What this signer can do on Tempo, declared by its connector (injected: no batch, sponsor or key authorization). */
  caps: SignerCaps;
  connectorId: string;
}

export interface SideAccount {
  address: Address;
  chainId: number;
  connectorId: string;
}

export interface WalletShellState {
  status: WalletShellStatus;
  /** A user-initiated connection is in flight. */
  connecting: boolean;
  tempo: TempoAccount | null;
  /** The Robinhood Chain (or Base Sepolia) wallet used for bridge-in; null until one is linked. */
  robinhood: SideAccount | null;
  network: "mainnet" | "testnet";
  /** The Tempo account's wallet sits on another chain (injected wallets only; passkeys are chain-bound). */
  wrongChain: boolean;
  /** What the open sign-in modal is for: the Tempo account, or linking a Robinhood Chain wallet. */
  pickerMode: "tempo" | "robinhood";
}

export interface WalletShellActions {
  openPicker(mode?: "tempo" | "robinhood"): void;
  openAccount(): void;
  disconnect(): Promise<void>;
  switchToTempo(): Promise<void>;
}

export type WalletShell = WalletShellState & WalletShellActions;

export const SIGNED_OUT: WalletShellState = { status: "ready", connecting: false, tempo: null, robinhood: null, network: "testnet", wrongChain: false, pickerMode: "tempo" };

export const WalletShellContext = createContext<WalletShell>({
  ...SIGNED_OUT,
  openPicker: () => undefined,
  openAccount: () => undefined,
  disconnect: async () => undefined,
  switchToTempo: async () => undefined,
});

export function useWalletShell(): WalletShell {
  return useContext(WalletShellContext);
}
