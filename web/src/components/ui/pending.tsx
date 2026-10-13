"use client";
// From 21st.dev 19949 diceui/pending — revamped per D-044 (R4-12, D-227): the pending wrapper's rule (a busy control
// keeps focus but ignores activation, with aria-busy/aria-disabled) as one `usePending` hook, plus the wallet-wait
// state the bridge needs on a phone: a named wait ("Waiting for your wallet…") and a way back to the wallet, never a
// bare spinner. No Radix Slot: the host spreads the props on its own element.
import { useMemo, type HTMLAttributes, type KeyboardEvent, type ReactNode, type SyntheticEvent } from "react";
import { cn } from "@/lib/utils";

export function usePending<T extends HTMLElement = HTMLElement>(isPending: boolean): HTMLAttributes<T> & { "aria-busy"?: boolean; "data-pending"?: boolean } {
  return useMemo(() => {
    if (!isPending) return {};
    const stop = (e: SyntheticEvent) => e.preventDefault();
    const stopKey = (e: KeyboardEvent<T>) => {
      if (e.key === "Enter" || e.key === " ") e.preventDefault();
    };
    return { "aria-busy": true, "aria-disabled": true, "data-pending": true, onClick: stop, onPointerDown: stop, onKeyDown: stopKey };
  }, [isPending]);
}

/** The wait while a wallet holds the request: what it waits on, and the way back to it. */
export function WalletWait({ title, note, action, className }: { title: string; note?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("wwait", className)} role="status" aria-live="polite">
      <span className="wwait-pulse" aria-hidden />
      <span className="wwait-body">
        <span className="wwait-title">{title}</span>
        {note ? <span className="wwait-note">{note}</span> : null}
      </span>
      {action}
    </div>
  );
}
