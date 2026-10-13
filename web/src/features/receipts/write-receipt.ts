"use client";
// One pattern for a write that landed (R4-4, D-227; critic gap 21; Owarine 90a91d71 components/receipt): a toast names
// the move ("Added · $5.00") with a Receipt action, which opens the cream stub in a sheet — the transaction, which key
// signed it, the key's limit when a key spent, and the fee. The receipt is held here (one at a time) and the host
// (`ReceiptHost`) reads it; nothing is re-read or guessed — every row comes from the confirmed outcome.
import type { Hex } from "@cwf/core";
import { useSyncExternalStore } from "react";
import { openDrawer } from "@/lib/drawer-param";
import { notify } from "@/lib/toast";
import { WRITE_RECEIPT } from "./copy";

export const RECEIPT_KEY = "receipt";

export interface WriteReceipt {
  /** The toast's line and the stub's title: "<Verb> · $X". */
  title: string;
  /** The stub's figure (already formatted) and what it is. */
  figure: string;
  figureLabel: string;
  txHash: Hex;
  atMs: number;
  signer: "passkey" | "one-tap" | "trading-balance" | "wallet";
  sponsored: boolean;
  /** When a key spent on the owner's behalf: what is left of its limit and when it ends (formatted). */
  key?: { left: string; limit: string; expires: string } | null;
}

/** Who signs a write from the account itself: its passkey, or the connected wallet. */
export const accountSigner = (kind: string | null): WriteReceipt["signer"] => (kind === "passkey" ? "passkey" : "wallet");

let current: WriteReceipt | null = null;
const listeners = new Set<() => void>();

export function openReceipt(receipt: WriteReceipt): void {
  current = receipt;
  for (const l of listeners) l();
  openDrawer(RECEIPT_KEY);
}

/** The toast with its Receipt action, once the write is confirmed. */
export function notifyReceipt(receipt: WriteReceipt): void {
  notify.item({ id: `receipt-${receipt.txHash}`, title: receipt.title, action: { label: WRITE_RECEIPT.action, onClick: () => openReceipt(receipt) } });
}

export function useWriteReceipt(): WriteReceipt | null {
  return useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    () => current,
    () => null,
  );
}
