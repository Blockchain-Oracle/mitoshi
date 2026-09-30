"use client";
/**
 * Tap-trading's contexts, split and memoised (E.5 S7 "memoised split context — no per-second re-render"): the view
 * changes only when a read or the key changes (never on a clock tick — time is read by the leaf that shows it), the
 * actions are stable callbacks, and the session key's submitter is its own value. Light: no chain code here, so the
 * ticket and the header can read it in the first load; the runtime that fills it is a lazy island (§3.1).
 */
import type { Address, TxOutcome } from "@cwf/core";
import type { MarketsSubmitter } from "@cwf/markets";
import { createContext, useContext } from "react";
import { OFF, type SessionView } from "./view";

export interface SessionActions {
  /** This browser's key for the owner, made (non-extractable) and kept on first use; null when the browser can't keep one. */
  ensureKey(): Promise<Address | null>;
  /** A fresh key replacing this browser's (re-key). */
  freshKey(): Promise<Address | null>;
  forgetKey(): Promise<void>;
  /** After a root write: refresh the Trading Balance reads. */
  refresh(): Promise<void>;
  /** Books a confirmed tap into the view at once (optimistic "Spent today"); the next read confirms or corrects it. */
  bookTap(costBase: bigint): void;
}

export const NO_ACTIONS: SessionActions = {
  ensureKey: async () => null,
  freshKey: async () => null,
  forgetKey: async () => undefined,
  refresh: async () => undefined,
  bookTap: () => undefined,
};

export const SessionViewContext = createContext<SessionView>(OFF);
export const SessionActionsContext = createContext<SessionActions>(NO_ACTIONS);
export const SessionSubmitterContext = createContext<MarketsSubmitter | null>(null);

export const useSessionView = () => useContext(SessionViewContext);
export const useSessionActions = () => useContext(SessionActionsContext);
export const useSessionSubmitter = () => useContext(SessionSubmitterContext);

export type RootOutcome = TxOutcome | null;
