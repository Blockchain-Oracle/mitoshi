"use client";
/**
 * One open bet's cash-out (Ported from Agari 03b30ab:web/src/features/markets/portfolio/useCashOut.ts; L-35, D-067),
 * one tap like the terminal's CLOSE (D-197, S23d): a fresh exit at the tap, sold with the SELL IOC at that read's own
 * floor less the close tolerance (the terminal's setting), so a requote inside it is taken. Outside it, the row offers
 * "Close for $X" at the fresh floor. Every refusal is a sentence beside the control, never silent; an ambiguous send is
 * "unknown", never re-sent.
 */
import type { Address, ExitQuote, MarketId, Side } from "@cwf/core";
import { isOk } from "@cwf/core";
import { diagnosisCopy } from "@cwf/core/copy";
import { formatBaseUnits } from "@cwf/core/units";
import { invalidateAfterWrite, useMarketsPort } from "@cwf/markets/react";
import { useTapSubmitter } from "@/providers/wallet/tap-session";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { announce } from "@/components/states/LiveRegion";
import { closeFloorBase } from "@/features/terminal/position-value";
import { tradeSettings } from "@/features/terminal/settings";
import { notify } from "@/lib/toast";
import { CASH_OUT } from "../copy";

export interface CashOutTarget {
  marketId: MarketId;
  side: Side;
  heldRaw: bigint;
  decimals: number;
}

export function useCashOut(target: CashOutTarget, wallet: Address | null) {
  const submitter = useTapSubmitter();
  const port = useMarketsPort();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [retry, setRetry] = useState<ExitQuote | null>(null);
  const money = (b: bigint) => `$${formatBaseUnits(b, target.decimals, { minDp: 2, maxDp: 2 })}`;

  /** One tap: read the exit and sell at its floor less the tolerance; `accept` takes a requoted floor as offered. */
  const close = async (accept?: ExitQuote) => {
    if (!submitter || !wallet || !port || busy) return;
    setBusy(true);
    setNote(null);
    setRetry(null);
    try {
      let exit = accept ?? null;
      if (!exit) {
        const quote = await port.freshExitQuote({ marketId: target.marketId, decimals: target.decimals }, target.side, target.heldRaw);
        if (!isOk(quote)) return setNote(quote.error.kind === "market-not-trading" ? CASH_OUT.locked : diagnosisCopy(quote.error.kind).headline);
        if (!quote.value) return setNote(CASH_OUT.noLiquidity);
        exit = quote.value;
      }
      const market = await port.getMarket(target.marketId);
      if (!isOk(market)) return setNote(diagnosisCopy(market.error.kind).headline);
      if (!market.value) return setNote(CASH_OUT.noLiquidity);
      const displayedExit = accept ?? { ...exit, minProceedsBase: closeFloorBase(exit.minProceedsBase, tradeSettings().closeToleranceBps) };
      const outcome = await submitter.submitCashOut({ market: market.value, side: target.side, contractsRaw: exit.contractsRaw, displayedExit, wallet });
      switch (outcome.status) {
        case "confirmed":
          notify.neutral(CASH_OUT.done, CASH_OUT.doneBody(money(outcome.booked.proceedsBase)));
          announce(`${CASH_OUT.done}. ${CASH_OUT.doneBody(money(outcome.booked.proceedsBase))}`);
          await invalidateAfterWrite(queryClient, { wallet, marketId: target.marketId });
          return;
        case "requote":
          setRetry(outcome.exit);
          return setNote(CASH_OUT.requote(money(outcome.exit.minProceedsBase)));
        case "nothingFilled":
          return setNote(CASH_OUT.nothingSold);
        case "unknown":
          return setNote(CASH_OUT.pending);
        default:
          return setNote(`${diagnosisCopy(outcome.diagnosis.kind).headline} ${CASH_OUT.failed}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return { canSign: submitter !== null && wallet !== null, busy, note, retry, close, money };
}
