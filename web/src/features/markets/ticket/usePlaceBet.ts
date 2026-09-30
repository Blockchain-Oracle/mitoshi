"use client";
/**
 * One call's write (Ported from Masayume 68f7a09:web/src/features/markets/ticket/usePlaceBet.ts), driven through the
 * TxLifecycle reducer (D-052) so the CTA, the chips and the failure card read one state: a second tap while one is in
 * flight is absorbed; a requote comes back as the new cost to confirm; an ambiguous send is "unknown", never re-sent.
 * On a fill: the reads it changes refresh, the stake is remembered (D-048) and the call pins to the user (calls store).
 */
import type { Address, Hex, OrderOutcome, OrderRequest, Quote } from "@cwf/core";
import { reduceTx, TX_IDLE, type TxState } from "@cwf/core";
import { invalidateAfterWrite } from "@cwf/markets/react";
import { useTapSubmitter } from "@/providers/wallet/tap-session";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer, useRef, useState } from "react";
import { announce } from "@/components/states/LiveRegion";
import { formatBaseUnits } from "@cwf/core/units";
import { notify } from "@/lib/toast";
import { TICKET } from "../copy";
import { recordCall } from "../data/calls-store";
import { SIDE_WORD } from "../side-styles";
import { rememberStake } from "./stake-memory";

export interface PlaceBetState {
  tx: TxState;
  outcome: OrderOutcome | null;
}

function txHashOf(outcome: OrderOutcome): Hex | null {
  if (outcome.status === "confirmed") return outcome.booked.txHash;
  return "txHash" in outcome ? (outcome.txHash ?? null) : null;
}

export function usePlaceBet(wallet: Address | null) {
  const submitter = useTapSubmitter();
  const queryClient = useQueryClient();
  const [tx, dispatch] = useReducer(reduceTx, TX_IDLE);
  const [outcome, setOutcome] = useState<OrderOutcome | null>(null);
  const inFlight = useRef(false);

  const place = useCallback(
    async (request: Omit<OrderRequest, "wallet">, options: { resting?: boolean } = {}) => {
      if (inFlight.current || !submitter || !wallet) return;
      inFlight.current = true;
      setOutcome(null);
      dispatch({ type: "confirm", nowMs: Date.now() });
      // Tap timing (§2.4 "Call card ≤ 1 s p50"): the lane's pre-send checks, then the send → receipt; read by the gate.
      const markSafe = (name: string) => {
        try {
          performance.mark(name);
        } catch {
          // no Performance API
        }
      };
      markSafe("cwf:tap:start");
      try {
        const result = await submitter.submitOrder({ ...request, wallet }, (phase, detail) => {
          if (phase === "submitted") {
            markSafe("cwf:tap:sent");
            dispatch({ type: "submitted", txHash: detail?.txHash ?? null, validBeforeSec: null });
          }
        });
        markSafe("cwf:tap:done");
        setOutcome(result);
        const hash = txHashOf(result);
        switch (result.status) {
          case "confirmed":
          case "nothingFilled":
            dispatch({ type: "receipt", txHash: hash!, status: "success" });
            await invalidateAfterWrite(queryClient, { wallet, marketId: request.market.marketId });
            break;
          case "requote":
            dispatch({ type: "reset" });
            break;
          case "reverted":
            dispatch(hash ? { type: "receipt", txHash: hash, status: "reverted", diagnosis: result.diagnosis } : { type: "error", diagnosis: result.diagnosis });
            break;
          case "refused":
            dispatch({ type: "error", diagnosis: result.diagnosis });
            break;
          case "unknown":
            dispatch({ type: "timeout", diagnosis: result.diagnosis });
            break;
        }
        if (result.status === "confirmed") {
          const { booked } = result;
          const m = request.market;
          rememberStake(wallet, request.stakeBase);
          recordCall(wallet, { marketId: m.marketId, asset: m.asset, lane: m.lane, intervalSec: m.intervalSec, tradingStartSec: m.tradingStartSec, expirySec: m.expirySec, decimals: m.decimals, side: booked.side, contractsRaw: booked.contractsRaw, costBase: booked.costBase, txHash: booked.txHash, placedAtMs: Date.now() });
          const line = TICKET.booked(formatBaseUnits(booked.contractsRaw, m.decimals, { minDp: 0 }), SIDE_WORD[booked.side], booked.avgPriceBps);
          notify.neutral(line);
          announce(line);
        } else if (result.status === "nothingFilled" && options.resting) {
          // A pre-open call rests at its limit (D-088): nothing crossed yet by design, so it pins as scheduled.
          const m = request.market;
          const q = request.displayedQuote;
          rememberStake(wallet, request.stakeBase);
          recordCall(wallet, { marketId: m.marketId, asset: m.asset, lane: m.lane, intervalSec: m.intervalSec, tradingStartSec: m.tradingStartSec, expirySec: m.expirySec, decimals: m.decimals, side: request.side, contractsRaw: q.contractsRaw, costBase: q.maxCostBase, txHash: result.txHash, placedAtMs: Date.now(), resting: true });
          announce(TICKET.scheduled.rested);
        } else if (result.status === "nothingFilled") {
          announce(TICKET.nothingFilled);
        }
      } finally {
        inFlight.current = false;
      }
    },
    [queryClient, submitter, wallet],
  );

  const reset = useCallback(() => {
    setOutcome(null);
    dispatch({ type: "reset" });
  }, []);
  const requoted: Quote | null = outcome?.status === "requote" ? outcome.quote : null;
  const placing = tx.kind === "signing" || tx.kind === "submitted";
  return { state: { tx, outcome } satisfies PlaceBetState, place, reset, requoted, placing };
}
