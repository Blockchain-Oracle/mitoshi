"use client";
/**
 * Range writes (Ported from Masayume 68f7a09:web/src/features/range/useRangeWrites.ts): the open through the one tx lane
 * (`[approve(reserve, maxStake), openRange(…, spotProof)]`, sponsored, D-173) on the TxLifecycle reducer (D-052) —
 * the chain is asked for the stake once more before any signature (a moved basis is a requote, not a popup), then a
 * fresh signed spot for the Window's ticker (PD-2/D-119) — and settle, the stale void, claims on the same lane. The
 * account's passkey signs (the wallet-mode key is scoped to the engine, D-136).
 */
import { diagnosis, reduceTx, TX_IDLE, type Address, type Diagnosis, type Hex, type MarketId, type TxIntent, type TxState } from "@cwf/core";
import type { RangeSide } from "@cwf/core/range";
import { diagnosisCopy } from "@cwf/core/copy";
import { previewRangeOpen, readRangeOpened, type RangeBand } from "@cwf/markets/range";
import { invalidateAfterWrite, useSubmitter } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer, useRef, useState } from "react";
import { announce } from "@/components/states/LiveRegion";
import { WRITE_RECEIPT } from "@/features/receipts/copy";
import { accountSigner, notifyReceipt } from "@/features/receipts/write-receipt";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { usd } from "../parlay/format";
import { fetchSpots, SpotsUnavailableError } from "../parlay/useParlayQuote";
import { RANGE } from "./copy";
import { rangeKeys } from "./data";

/** A confirmed open carries the terms it was booked on (R4-13a, D-227): the ticket stays live under its receipt, so the
 *  receipt and its Share card read the payout, band and close placed, never the quote the ticket has moved on to. */
export type RangeOpenOutcome = { status: "confirmed"; txHash: Hex; roundId: bigint | null; stakeBase: bigint; payoutBase: bigint; bandText: string; expirySec: number | null } | { status: "requote"; stakeBase: bigint } | { status: "failed"; diagnosis: Diagnosis; txHash: Hex | null };

export function useRangeWrites(wallet: Address | null) {
  const submitter = useSubmitter();
  const account = useWalletSession().kind;
  const queryClient = useQueryClient();
  const [tx, dispatch] = useReducer(reduceTx, TX_IDLE);
  const [outcome, setOutcome] = useState<RangeOpenOutcome | null>(null);
  const [fetchingSpot, setFetchingSpot] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: rangeKeys.all });
    if (wallet) await invalidateAfterWrite(queryClient, { wallet });
  }, [queryClient, wallet]);

  const open = useCallback(
    async (req: { band: RangeBand; feed: string; maxPayoutBase: bigint; maxStakeBase: bigint; bandText: string; expirySec?: number }) => {
      if (inFlight.current || !submitter || !wallet) return;
      inFlight.current = true;
      setOutcome(null);
      dispatch({ type: "confirm", nowMs: Date.now() });
      try {
        const fresh = await previewRangeOpen(req.band, req.maxPayoutBase);
        if (!fresh.ok) {
          setOutcome({ status: "failed", diagnosis: fresh.error, txHash: null });
          dispatch({ type: "error", diagnosis: fresh.error });
          return;
        }
        if (fresh.value.stakeBase > req.maxStakeBase) {
          setOutcome({ status: "requote", stakeBase: fresh.value.stakeBase });
          dispatch({ type: "requoted" });
          return;
        }
        setFetchingSpot(true);
        const spot = (await fetchSpots([req.feed])).get(req.feed)!;
        setFetchingSpot(false);
        const intent: TxIntent = { kind: "range-open", marketId: req.band.marketId, asset: req.band.asset, side: req.band.side as RangeSide, lowPrint: req.band.lowPrint, highPrint: req.band.highPrint, maxPayoutBase: req.maxPayoutBase, maxStakeBase: req.maxStakeBase, spotProof: spot.payload };
        const result = await submitter.submitTx(intent, (p, detail) => {
          if (p === "submitted") dispatch({ type: "submitted", txHash: detail?.txHash ?? null, validBeforeSec: null });
        });
        if (result.status === "confirmed") {
          dispatch({ type: "receipt", txHash: result.txHash, status: "success" });
          const booked = await readRangeOpened(result.txHash).catch(() => null);
          const stakeBase = booked?.stakeBase ?? fresh.value.stakeBase;
          setOutcome({ status: "confirmed", txHash: result.txHash, roundId: booked?.roundId ?? null, stakeBase, payoutBase: req.maxPayoutBase, bandText: req.bandText, expirySec: req.expirySec ?? null });
          const line = RANGE.outcome.placed(booked ? String(booked.roundId) : "", req.bandText, usd(stakeBase), usd(req.maxPayoutBase));
          // The success receipt (R4-4, D-227; critic gap 21): the toast names the bet, its Receipt opens the stub.
          notifyReceipt({ title: line, figure: usd(stakeBase), figureLabel: WRITE_RECEIPT.staked, txHash: result.txHash, atMs: Date.now(), signer: accountSigner(account), sponsored: true });
          announce(line);
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
    [submitter, wallet, refresh, account],
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
    settle: (roundId: bigint, marketId: MarketId) => crank(`settle:${roundId}`, { kind: "range-settle", roundId, marketId }, RANGE.rounds.settled),
    voidStale: (roundId: bigint) => crank(`void:${roundId}`, { kind: "range-void-stale", roundId }, RANGE.rounds.voidedNote),
    claim: (roundId: bigint, payoutBase: bigint) => crank(`claim:${roundId}`, { kind: "range-claim", roundId }, RANGE.rounds.claimed(usd(payoutBase))),
    claimOwed: () => crank("claim:owed", { kind: "range-claim-owed" }, RANGE.rounds.paidNote),
  };
}
