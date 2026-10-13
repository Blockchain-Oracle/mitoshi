"use client";
/**
 * Collect (D-048; ux-audit fix 4): every leftover — settled Windows still held, credit waiting — in ONE sponsored batch
 * (`claim-all`, ≤ 8 calls a transaction; several when more), through the TxLifecycle (D-052). Rows the receive policy
 * holds are never in it (they would sink the batch, N-13). The references signed one redemption per Window and showed
 * "Placing…" while they ran (claim-blocker.ts L16); this names its own wait ("Collecting…"), and "collected" is only ever
 * set from a confirmed outcome — never after a loop that broke on an error (the ClaimWinnings false-"Paid" bug).
 */
import type { Address, ClaimableRow, TxOutcome } from "@cwf/core";
import { invalidateAfterWrite } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { netClaimableSum } from "@cwf/core";
import { useTxLifecycle } from "@/components/tx";
import { accountSigner, notifyReceipt } from "@/features/receipts/write-receipt";
import { money } from "@/features/terminal/format";
import { useWalletSession } from "@/lib/wallet-session";
import { useTapArmed, useTapSubmitter } from "@/providers/wallet/tap-session";
import { CLAIM } from "../copy";

export function collectableRows(rows: readonly ClaimableRow[]): ClaimableRow[] {
  return rows.filter((r) => !r.heldByReceivePolicy && r.netPayoutBase > 0n);
}

export function useCollect(wallet: Address | null) {
  // Collect is in the wallet key's scope (redeem, withdrawCredit): no prompt when it is armed.
  const tx = useTxLifecycle({ submitter: useTapSubmitter() });
  const queryClient = useQueryClient();
  const armed = useTapArmed();
  const kind = useWalletSession().kind;
  const { run } = tx;
  const collect = useCallback(
    async (rows: readonly ClaimableRow[]): Promise<TxOutcome | null> => {
      const live = collectableRows(rows);
      if (!wallet || live.length === 0) return null;
      // Loaded on the tap: the engine address and the batch builder stay out of the page's first load (§3.1).
      const [{ claimAllInputOf }, { engineAddress }] = await Promise.all([import("@cwf/markets"), import("@/providers/wallet/access-key")]);
      const engine = engineAddress();
      if (!engine) return null;
      const input = claimAllInputOf(engine, live);
      const outcome = await run({ kind: "claim-all", redeem: [...input.redeem], credits: [...input.credits] });
      if (outcome?.status === "confirmed") {
        // The success receipt (R4-4, D-227; critic gap 21): the toast names the move, its Receipt opens the stub.
        const paid = money(netClaimableSum(live), false, live[0]?.decimals);
        notifyReceipt({ title: CLAIM.toast(paid), figure: paid, figureLabel: CLAIM.receipt.figureLabel, txHash: outcome.txHash, atMs: Date.now(), signer: armed ? "one-tap" : accountSigner(kind), sponsored: true });
      }
      if (outcome) await Promise.all(live.map((r) => invalidateAfterWrite(queryClient, { wallet, marketId: r.marketId })));
      return outcome;
    },
    [wallet, run, queryClient, armed, kind],
  );
  return { tx: tx.state, collect, reset: () => tx.dispatch({ type: "reset" }) };
}
