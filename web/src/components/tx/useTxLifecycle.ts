"use client";

/**
 * Drives the TxLifecycle for one write (D-052): the reducer from `@cwf/core`, fed by the submitter's own phases (which
 * journal every intent before send, L-08) and its outcome. Announces transitions through the screen's one live region.
 * A timed-out send is left `unknown` for recovery — never re-sent.
 */
import { reduceTx, TX_IDLE, type TxEvent, type TxIntent, type TxOutcome, type TxState } from "@cwf/core";
import type { MarketsSubmitter } from "@cwf/markets";
import { useSubmitter } from "@cwf/markets/react";
import { useCallback, useReducer } from "react";
import { announce } from "@/components/states/LiveRegion";
import { TX } from "./copy";

export interface TxRunner {
  state: TxState;
  dispatch: (event: TxEvent) => void;
  /** Runs one intent through the session's submitter; resolves with the chain's outcome (or null with no session). */
  run: (intent: TxIntent) => Promise<TxOutcome | null>;
}

export function useTxLifecycle(options: { optimistic?: boolean; submitter?: MarketsSubmitter | null } = {}): TxRunner {
  const [state, dispatch] = useReducer(reduceTx, TX_IDLE);
  const own = useSubmitter();
  const submitter = options.submitter === undefined ? own : options.submitter;
  const run = useCallback(
    async (intent: TxIntent) => {
      if (!submitter) return null;
      dispatch({ type: "confirm", nowMs: Date.now() });
      const outcome = await submitter.submitTx(intent, (phase, detail) => {
        if (phase === "submitted") dispatch({ type: "submitted", txHash: detail?.txHash ?? null, validBeforeSec: null, optimistic: options.optimistic });
      });
      switch (outcome.status) {
        case "confirmed":
          dispatch({ type: "receipt", txHash: outcome.txHash, status: "success" });
          announce(TX.confirmed);
          break;
        case "reverted":
          dispatch(outcome.txHash ? { type: "receipt", txHash: outcome.txHash, status: "reverted", diagnosis: outcome.diagnosis } : { type: "error", diagnosis: outcome.diagnosis });
          announce(TX.moneyMoved.no);
          break;
        case "unknown":
          dispatch({ type: "timeout", diagnosis: outcome.diagnosis });
          announce(TX.unknown);
          break;
        case "refused":
          dispatch({ type: "error", diagnosis: outcome.diagnosis });
          announce(TX.moneyMoved.no);
          break;
      }
      return outcome;
    },
    [submitter, options.optimistic],
  );
  return { state, dispatch, run };
}
