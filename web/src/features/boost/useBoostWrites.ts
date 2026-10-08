"use client";
/**
 * Boost writes (Ported from Masayume 68f7a09:web/src/features/leverage/useLeverageWrites.ts): the open through the one
 * tx lane (`[approve(reserve, stake), open(…, spotProof)]`, sponsored, D-175) on the TxLifecycle reducer (D-052), with a
 * fresh signed spot for the Window's ticker (PD-2); the owner's cash-out and anyone's settle on the same lane. The
 * account's passkey signs (the wallet-mode key is scoped to the engine, D-136).
 */
import { diagnosis, reduceTx, TX_IDLE, type Address, type Diagnosis, type Hex, type MarketId, type Side, type TxIntent, type TxState } from "@cwf/core";
import { diagnosisCopy } from "@cwf/core/copy";
import { readBoostOpened } from "@cwf/markets/leverage";
import { invalidateAfterWrite, useSubmitter } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer, useRef, useState } from "react";
import { notify } from "@/lib/toast";
import { fetchSpots, SpotsUnavailableError } from "../parlay/useParlayQuote";
import { BOOST } from "./copy";

export const boostKeys = { all: ["cwf", "boost"] as const };

export type BoostOutcome = { status: "confirmed"; txHash: Hex; booked: Awaited<ReturnType<typeof readBoostOpened>> } | { status: "failed"; diagnosis: Diagnosis; txHash: Hex | null };

export function useBoostWrites(wallet: Address | null) {
  const submitter = useSubmitter();
  const queryClient = useQueryClient();
  const [tx, dispatch] = useReducer(reduceTx, TX_IDLE);
  const [outcome, setOutcome] = useState<BoostOutcome | null>(null);
  const [fetchingSpot, setFetchingSpot] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: boostKeys.all });
    if (wallet) await invalidateAfterWrite(queryClient, { wallet });
  }, [queryClient, wallet]);

  const open = useCallback(
    async (req: { marketId: MarketId; side: Side; stakeBase: bigint; leverageBps: number; minQuantityRaw: bigint; feed: string }) => {
      if (inFlight.current || !submitter || !wallet) return;
      inFlight.current = true;
      setOutcome(null);
      dispatch({ type: "confirm", nowMs: Date.now() });
      try {
        setFetchingSpot(true);
        const spot = (await fetchSpots([req.feed])).get(req.feed)!;
        setFetchingSpot(false);
        const result = await submitter.submitTx({ kind: "leverage-open", marketId: req.marketId, side: req.side, stakeBase: req.stakeBase, leverageBps: req.leverageBps, minQuantityRaw: req.minQuantityRaw, spotProof: spot.payload }, (p, detail) => {
          if (p === "submitted") dispatch({ type: "submitted", txHash: detail?.txHash ?? null, validBeforeSec: null });
        });
        if (result.status === "confirmed") {
          dispatch({ type: "receipt", txHash: result.txHash, status: "success" });
          const booked = await readBoostOpened(result.txHash).catch(() => null);
          setOutcome({ status: "confirmed", txHash: result.txHash, booked });
        } else if (result.status === "unknown") {
          setOutcome({ status: "failed", diagnosis: result.diagnosis, txHash: result.txHash ?? null });
          dispatch({ type: "timeout", diagnosis: result.diagnosis });
        } else {
          const hash = "txHash" in result ? (result.txHash ?? null) : null;
          setOutcome({ status: "failed", diagnosis: result.diagnosis, txHash: hash });
          dispatch(hash ? { type: "receipt", txHash: hash, status: "reverted", diagnosis: result.diagnosis } : { type: "error", diagnosis: result.diagnosis });
        }
      } catch (error) {
        setFetchingSpot(false);
        const d = error instanceof SpotsUnavailableError ? diagnosis("rpc-down", error.message) : diagnosis("unknown", error instanceof Error ? error.message : String(error));
        setOutcome({ status: "failed", diagnosis: d, txHash: null });
        dispatch({ type: "error", diagnosis: d });
      } finally {
        inFlight.current = false;
        await refresh();
      }
    },
    [submitter, wallet, refresh],
  );

  const crank = useCallback(
    async (key: string, intent: TxIntent, ok: string) => {
      if (!submitter) return;
      setBusy(key);
      try {
        const r = await submitter.submitTx(intent);
        if (r.status === "confirmed") notify.neutral(ok);
        else notify.warning(diagnosisCopy(r.diagnosis.kind).headline, diagnosisCopy(r.diagnosis.kind).body);
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [submitter, refresh],
  );

  return {
    tx: tx as TxState,
    outcome,
    fetchingSpot,
    busy,
    open,
    reset: useCallback(() => {
      setOutcome(null);
      dispatch({ type: "reset" });
    }, []),
    close: (positionId: bigint, marketId: MarketId, minProceedsBase: bigint) => crank(`close:${positionId}`, { kind: "leverage-close", positionId, marketId, minProceedsBase }, BOOST.bets.cashedOut("")),
    settle: (positionId: bigint, marketId: MarketId) => crank(`settle:${positionId}`, { kind: "leverage-settle", positionId, marketId }, BOOST.bets.settledToast),
    claimOwed: () => crank("owed", { kind: "leverage-claim-owed" }, BOOST.bets.settledToast),
  };
}
