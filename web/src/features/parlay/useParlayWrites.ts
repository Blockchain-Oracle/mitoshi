"use client";
/**
 * Every reserve write from the page (Ported from Masayume 68f7a09:web/src/features/parlay/useParlayWrites.ts): the open
 * through the one tx lane (`[approve(reserve, maxStake), openParlay(…, spotProofs)]`, sponsored, D-166), driven by the
 * TxLifecycle reducer (D-052) so the CTA reads one state — a second hold while one is in flight is absorbed, a moved
 * book comes back as a requote, an ambiguous send is "unknown" and never re-sent. Before any signature the chain is
 * asked for the stake once more (the reference's `submitParlayOpen`): a figure above the confirmed one is a requote,
 * not a popup. Settlement (the one leg D-108 allows) and the claim ride the same lane. Every read a write changes
 * is refetched afterwards.
 */
import { diagnosis, reduceTx, TX_IDLE, type Address, type Diagnosis, type Hex, type MarketId, type ParlayLegInput, type TxState } from "@cwf/core";
import { diagnosisCopy } from "@cwf/core/copy";
import { previewParlayOpen, readOpenedTicket } from "@cwf/markets/parlay";
import { invalidateAfterWrite, useSubmitter } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useReducer, useRef, useState } from "react";
import { announce } from "@/components/states/LiveRegion";
import { notify } from "@/lib/toast";
import { PARLAY } from "./copy";
import { parlayKeys } from "./data";
import { usd } from "./format";
import { fetchSpots, SPOT_REUSE_SEC, SpotsUnavailableError, type SignedSpot } from "./useParlayQuote";

export type OpenOutcome =
  /** The payout it was booked on (R4-13a, D-227): the slip stays live under its receipt, so the receipt and its Share
   *  card read what was placed, never the quote the slip has moved on to. */
  | { status: "confirmed"; txHash: Hex; parlayId: bigint | null; stakeBase: bigint; payoutBase: bigint }
  | { status: "requote"; stakeBase: bigint }
  | { status: "failed"; diagnosis: Diagnosis; txHash: Hex | null };

export type BusyKey = `claim:${string}` | `settle:${string}:${number}`;

export interface OpenRequest {
  legs: (ParlayLegInput & { feed: string })[];
  maxPayoutBase: bigint;
  maxStakeBase: bigint;
  /** The signed spots the quote was checked against; reused when younger than `SPOT_REUSE_SEC`. */
  spots: Map<string, SignedSpot> | null;
}

export function useParlayWrites(wallet: Address | null) {
  // The account's own session (passkey): the wallet-mode key is scoped to the engine (D-136) and cannot sign a parlay.
  const submitter = useSubmitter();
  const queryClient = useQueryClient();
  const [tx, dispatch] = useReducer(reduceTx, TX_IDLE);
  const [outcome, setOutcome] = useState<OpenOutcome | null>(null);
  const [phase, setPhase] = useState<"spots" | null>(null);
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: parlayKeys.all });
    if (wallet) await invalidateAfterWrite(queryClient, { wallet });
  }, [queryClient, wallet]);

  const open = useCallback(
    async (req: OpenRequest): Promise<void> => {
      if (inFlight.current || !submitter || !wallet) return;
      inFlight.current = true;
      setOutcome(null);
      dispatch({ type: "confirm", nowMs: Date.now() });
      try {
        const fresh = await previewParlayOpen(req.legs, req.maxPayoutBase);
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
        const nowSec = Math.floor(Date.now() / 1000);
        let spots = req.spots;
        if (!spots || req.legs.some((l) => !spots!.has(l.feed) || nowSec - spots!.get(l.feed)!.tSec > SPOT_REUSE_SEC)) {
          setPhase("spots");
          spots = await fetchSpots(req.legs.map((l) => l.feed));
          setPhase(null);
        }
        const spotProofs = req.legs.map((l) => spots!.get(l.feed)!.payload);
        const legs = req.legs.map(({ marketId, side }) => ({ marketId, side }));
        const result = await submitter.submitTx({ kind: "parlay-open", legs, maxPayoutBase: req.maxPayoutBase, maxStakeBase: req.maxStakeBase, spotProofs }, (p, detail) => {
          if (p === "submitted") dispatch({ type: "submitted", txHash: detail?.txHash ?? null, validBeforeSec: null });
        });
        if (result.status === "confirmed") {
          dispatch({ type: "receipt", txHash: result.txHash, status: "success" });
          const booked = await readOpenedTicket(result.txHash).catch(() => null);
          const stakeBase = booked?.stakeBase ?? fresh.value.stakeBase;
          setOutcome({ status: "confirmed", txHash: result.txHash, parlayId: booked?.parlayId ?? null, stakeBase, payoutBase: req.maxPayoutBase });
          const line = PARLAY.outcome.placed(booked ? String(booked.parlayId) : "", req.legs.length, usd(stakeBase), usd(req.maxPayoutBase));
          notify.neutral(line);
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
        setPhase(null);
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

  const reset = useCallback(() => {
    setOutcome(null);
    dispatch({ type: "reset" });
  }, []);

  const crank = useCallback(
    async (key: BusyKey, intent: Parameters<NonNullable<typeof submitter>["submitTx"]>[0], ok: string) => {
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

  const settleLeg = useCallback((parlayId: bigint, legIdx: number, marketId: MarketId) => crank(`settle:${parlayId}:${legIdx}`, { kind: "parlay-resolve-leg", parlayId, legIdx, marketId }, PARLAY.tickets.settled), [crank]);
  const claim = useCallback((parlayId: bigint, payoutBase: bigint) => crank(`claim:${parlayId}`, { kind: "parlay-claim", parlayId }, PARLAY.tickets.claimed(usd(payoutBase))), [crank]);
  const claimOwed = useCallback(() => crank("claim:owed", { kind: "parlay-claim-owed" }, PARLAY.tickets.paidNote), [crank]);

  return { tx: tx as TxState, outcome, fetchingSpots: phase === "spots", open, reset, settleLeg, claim, claimOwed, busy, canSign: submitter !== null };
}
