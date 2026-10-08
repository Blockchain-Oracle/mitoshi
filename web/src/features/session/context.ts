"use client";
/**
 * Tap-trading's state, split and memoised (E.5 S7 "memoised split context — no per-second re-render"): the view changes
 * only when a read or the key changes (never on a clock tick — time is read by the leaf that shows it), the actions are
 * stable callbacks, and the session key's and the owner's submitters are their own slices. It is a tiny external store
 * rather than React context because the sign-up ceremony's modal (the D37 arm slot) is rendered by the lazy wallet
 * runtime outside the app tree; every reader subscribes to exactly its slice (`useSyncExternalStore`). Light: no chain
 * code here; the runtime that fills it is a lazy island (§3.1).
 */
import type { Address, Hex } from "@cwf/core";
import type { ExitTrigger } from "@cwf/core/exits";
import type { MarketsSubmitter } from "@cwf/markets";
import { useSyncExternalStore } from "react";
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
  /** The armed session key's signature on an exit trigger (S24.5, D-209) — no prompt; null when no key signs here. */
  signExit(t: ExitTrigger): Promise<Hex | null>;
}

export const NO_ACTIONS: SessionActions = {
  ensureKey: async () => null,
  freshKey: async () => null,
  forgetKey: async () => undefined,
  refresh: async () => undefined,
  bookTap: () => undefined,
  signExit: async () => null,
};

interface SessionState {
  view: SessionView;
  actions: SessionActions;
  /** The session key's submitter while armed. */
  sessionKey: MarketsSubmitter | null;
  /** The owner's own (passkey) submitter, for root writes from anywhere — the ceremony's modal included. */
  root: MarketsSubmitter | null;
}

let state: SessionState = { view: OFF, actions: NO_ACTIONS, sessionKey: null, root: null };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The provider's one writer: replaces the slices that changed and tells only their readers. */
export function publishSession(next: Partial<SessionState>): void {
  const merged = { ...state, ...next };
  if ((Object.keys(next) as (keyof SessionState)[]).every((k) => merged[k] === state[k])) return;
  state = merged;
  for (const listener of listeners) listener();
}

export const useSessionView = () => useSyncExternalStore(subscribe, () => state.view, () => OFF);
export const useSessionActions = () => useSyncExternalStore(subscribe, () => state.actions, () => NO_ACTIONS);
export const useSessionSubmitter = () => useSyncExternalStore(subscribe, () => state.sessionKey, () => null);
export const useRootSubmitter = () => useSyncExternalStore(subscribe, () => state.root, () => null);
