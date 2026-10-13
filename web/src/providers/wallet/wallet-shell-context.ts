"use client";
// Ported from Agari 03b30ab:web/src/providers/wallet/wallet-shell-context.ts — one Tempo account (C.3.1): a passkey,
// Tempo Wallet or an injected wallet. D-231 removed the second, Robinhood Chain wallet with the bridge.
// Every consumer reads this; only `web/src/providers/wallet/WalletRuntime` (a lazy island, §3.1) touches wagmi.
import type { ConnectOutcome } from "./useWalletChoices";
import type { Address, Hex } from "@cwf/core";
import type { SignerCaps } from "@cwf/markets";
import { createContext, useContext } from "react";
import type { WalletKeyState } from "./wallet-key-store";

/** The wallet-mode key's arm result (D-047); `aborted` when the user dismissed the passkey prompt. */
export type ArmOutcome = { ok: true; key: WalletKeyState } | { ok: false; aborted: boolean; error: unknown };

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

export interface WalletShellState {
  /** The wallet runtime has loaded: the passkey ceremonies can start on a tap. */
  runtime: boolean;
  status: WalletShellStatus;
  /** A user-initiated connection is in flight. */
  connecting: boolean;
  tempo: TempoAccount | null;
  network: "mainnet" | "testnet";
  /** The Tempo account's wallet sits on another chain (injected wallets only; passkeys are chain-bound). */
  wrongChain: boolean;
  /** Why the sign-in opened, in the order's words ("to place UP · $25.00"); null from a plain Sign in (D-224). */
  pickerIntent: string | null;
  /** The wallet-mode key armed on this device for this account (D-047); null when taps still prompt. */
  walletKey: WalletKeyState | null;
  /** A passkey account on a network with the engine: the one-tap arm can be offered. */
  canArmWalletKey: boolean;
}

export interface WalletShellActions {
  openPicker(intent?: string | null): void;
  /**
   * Round 7 (the welcome): the passkey ceremonies straight from a screen's own button, no sheet in between, so the
   * system's Face ID sheet opens on that tap. Only once `runtime` is true; `prepare` loads it early.
   */
  createPasskey(): Promise<ConnectOutcome>;
  signInPasskey(): Promise<ConnectOutcome>;
  prepare(): void;
  disconnect(): Promise<void>;
  switchToTempo(): Promise<void>;
  /** EIP-191 personal_sign with the connected Tempo account (the faucet challenge); rejects with no account. */
  signMessage(message: string): Promise<Hex>;
  /** One passkey prompt: authorise the wallet-mode key so later calls sign with no prompt (D-046 arm slot). */
  armWalletKey(): Promise<ArmOutcome>;
}

export type WalletShell = WalletShellState & WalletShellActions;

export const SIGNED_OUT: WalletShellState = { runtime: false, status: "ready", connecting: false, tempo: null, network: "testnet", wrongChain: false, pickerIntent: null, walletKey: null, canArmWalletKey: false };

export const WalletShellContext = createContext<WalletShell>({
  ...SIGNED_OUT,
  openPicker: () => undefined,
  createPasskey: async () => ({ ok: false, aborted: false, error: new Error("wallet not loaded") }),
  signInPasskey: async () => ({ ok: false, aborted: false, error: new Error("wallet not loaded") }),
  prepare: () => undefined,
  disconnect: async () => undefined,
  switchToTempo: async () => undefined,
  signMessage: async () => {
    throw new Error("no wallet connected");
  },
  armWalletKey: async () => ({ ok: false, aborted: false, error: new Error("no wallet connected") }),
});

export function useWalletShell(): WalletShell {
  return useContext(WalletShellContext);
}
