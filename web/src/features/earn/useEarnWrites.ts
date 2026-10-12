"use client";
/**
 * Every write a supplier sends from `/earn` (Owarine 90a91d71 `useEarnWrites` / `useReserveWrites`, on Mitoshi's tx
 * lane): supply (root-signed, self-paid, `[approve, supply]` in one batch) and withdraw (sponsored) on any of the four
 * reserves; merge and settle on a Window the maker vault is on (sponsored, anyone may). The vault refuses a withdraw
 * while a closed Window is unsettled and names them one at a time, so the maker's withdraw settles each first. After
 * every outcome the page re-reads the chain — a refused signature leaves it reading, not the figure the form held.
 */
import type { Address, MarketId, ReserveKind, TxIntent } from "@cwf/core";
import { getMakerUnsettledExpired, isMakerWindowSettleable } from "@cwf/markets/maker";
import { invalidateAfterWrite, useSubmitter } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTxLifecycle } from "@/components/tx";
import { notify } from "@/lib/toast";
import { EARN } from "./copy";
import { earnKeys, RESERVE_KEYS } from "./data";

/** Inverse positions ride the boost reserve, so "boost" sends the leverage reserve's own instructions. */
const PROGRAM = { maker: "maker", range: "range", parlay: "parlay", boost: "leverage" } as const satisfies Record<ReserveKind, string>;

/** The vault caps its open Windows (`maxOpenWindows`); this is the most settles one exit will send before giving up. */
const MAX_SETTLES_BEFORE_WITHDRAW = 16;
/** A closed Window's print lands within a minute of T (ops' archive, S3); the exit waits this long for it, then says so. */
const PRINT_WAIT_MS = 90_000;
const PRINT_POLL_MS = 5_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type RowAction = `merge:${string}` | `settle:${string}`;

export function useEarnWrites(kind: ReserveKind, wallet: Address | null) {
  const submitter = useSubmitter();
  const queryClient = useQueryClient();
  const supplyTx = useTxLifecycle();
  const withdrawTx = useTxLifecycle();
  const rowTx = useTxLifecycle();
  const [busyRow, setBusyRow] = useState<RowAction | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: earnKeys.all });
    await queryClient.invalidateQueries({ queryKey: RESERVE_KEYS[kind] });
    if (wallet) await invalidateAfterWrite(queryClient, { wallet });
  }, [queryClient, kind, wallet]);

  const supply = useCallback(
    async (amountBase: bigint): Promise<boolean> => {
      const outcome = await supplyTx.run({ kind: `${PROGRAM[kind]}-supply`, amountBase } as TxIntent);
      if (outcome?.status === "confirmed") notify.neutral(EARN.supply.done);
      await refresh();
      return outcome?.status === "confirmed";
    },
    [supplyTx, kind, refresh],
  );

  const withdraw = useCallback(
    async (shares: bigint): Promise<boolean> => {
      if (kind === "maker") {
        for (let round = 0; round < MAX_SETTLES_BEFORE_WITHDRAW; round += 1) {
          const stale = await getMakerUnsettledExpired();
          if (!stale.ok || !stale.value) break;
          // The vault refuses the withdraw from the Window's expiry, but `settle` lands only once the engine has its
          // closing print: wait for the settler (every print lands < 60 s after T), and say so if it doesn't.
          let ready = await isMakerWindowSettleable(stale.value);
          for (let waited = 0; ready.ok && !ready.value && waited < PRINT_WAIT_MS; waited += PRINT_POLL_MS) {
            setNote(EARN.position.printPending);
            await sleep(PRINT_POLL_MS);
            ready = await isMakerWindowSettleable(stale.value);
          }
          if (!ready.ok || !ready.value) {
            setNote(null);
            notify.neutral(EARN.position.printLate);
            await refresh();
            return false;
          }
          setNote(EARN.position.settling);
          const settled = await withdrawTx.run({ kind: "maker-settle", marketId: stale.value });
          if (settled?.status !== "confirmed") {
            setNote(null);
            await refresh();
            return false;
          }
        }
        setNote(null);
      }
      const outcome = await withdrawTx.run({ kind: `${PROGRAM[kind]}-withdraw`, shares } as TxIntent);
      if (outcome?.status === "confirmed") notify.neutral(EARN.position.done);
      await refresh();
      return outcome?.status === "confirmed";
    },
    [withdrawTx, kind, refresh],
  );

  const row = useCallback(
    async (action: "merge" | "settle", marketId: MarketId) => {
      setBusyRow(`${action}:${marketId}`);
      try {
        await rowTx.run({ kind: `maker-${action}`, marketId });
      } finally {
        setBusyRow(null);
        await refresh();
      }
    },
    [rowTx, refresh],
  );

  return {
    supply,
    withdraw,
    merge: (marketId: MarketId) => void row("merge", marketId),
    settle: (marketId: MarketId) => void row("settle", marketId),
    supplyTx,
    withdrawTx,
    rowTx,
    busyRow,
    note,
    canSign: submitter !== null,
  };
}

export type EarnWrites = ReturnType<typeof useEarnWrites>;
