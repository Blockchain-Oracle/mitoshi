"use client";
// A filled tap's receipt (R4-13a, D-227; critic portPlan step 5, D-045/D-052): the "opened" toast carries one action,
// "Receipt", that opens the cream TxReceipt for the fill — and, when a key signed it rather than a prompt, the
// KeyUsedReceipt line saying which key and what is left of its limit. A tiny bus, so the toast (raised from the open
// flow) and the sheet (mounted once in the terminal) need no shared parent.
import type { Hex, Side } from "@cwf/core";
import { useEffect, useState } from "react";

export interface TradeReceipt {
  txHash: Hex;
  asset: string;
  side: Side;
  intervalSec: number;
  costBase: bigint;
  contractsRaw: bigint;
  decimals: number;
  atMs: number;
  /** Which key signed: the Trading Balance's session key, this wallet's access key, or a prompt (no key line). */
  key: "session" | "wallet" | null;
}

export const RECEIPT = {
  action: "Receipt",
  title: "Position opened",
  figureLabel: "Staked",
  window: "Window",
  contracts: "Contracts",
  toWin: "Win if it lands",
  keys: { session: "Trading Balance key", wallet: "This wallet's trading key" },
} as const;

const EVENT = "cwf:trade-receipt";

export function openTradeReceipt(receipt: TradeReceipt): void {
  window.dispatchEvent(new CustomEvent<TradeReceipt>(EVENT, { detail: receipt }));
}

/** The receipt asked for last, and a way to put it away. */
export function useTradeReceipt(): [TradeReceipt | null, () => void] {
  const [receipt, setReceipt] = useState<TradeReceipt | null>(null);
  useEffect(() => {
    const on = (e: Event) => setReceipt((e as CustomEvent<TradeReceipt>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return [receipt, () => setReceipt(null)];
}
