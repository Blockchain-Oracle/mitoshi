"use client";
/**
 * One open bet's cash-out (Ported from Agari 03b30ab:web/src/features/markets/portfolio/useCashOut.ts; L-35, D-067):
 * a fresh exit quote at the tap, then the SELL IOC on the submitter's lane with that quote's floor
 * (`minProceedsBase`). A requote keeps the fresh exit so the next confirm takes exactly that floor; every refusal is a
 * sentence beside the control, never silent; an ambiguous send is "unknown", never re-sent.
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
  const [requoted, setRequoted] = useState<ExitQuote | null>(null);
  const money = (b: bigint) => `$${formatBaseUnits(b, target.decimals, { minDp: 2, maxDp: 2 })}`;

  /** Reads the exit before the hold, so the hold names its floor ("Hold to cash out for at least $X"). */
  const prepare = async () => {
    if (!port || busy) return;
    setBusy(true);
    setNote(null);
    try {
      const quote = await port.freshExitQuote({ marketId: target.marketId, decimals: target.decimals }, target.side, target.heldRaw);
      if (!isOk(quote)) return setNote(quote.error.kind === "market-not-trading" ? CASH_OUT.locked : diagnosisCopy(quote.error.kind).headline);
      if (!quote.value) return setNote(CASH_OUT.noLiquidity);
      setRequoted(quote.value);
    } finally {
      setBusy(false);
    }
  };

  const cashOut = async () => {
    if (!submitter || !wallet || !port || busy || !requoted) return;
    setBusy(true);
    setNote(null);
    try {
      const market = await port.getMarket(target.marketId);
      if (!isOk(market)) return setNote(diagnosisCopy(market.error.kind).headline);
      if (!market.value) return setNote(CASH_OUT.noLiquidity);
      const exit = requoted;
      setRequoted(null);
      const outcome = await submitter.submitCashOut({ market: market.value, side: target.side, contractsRaw: exit.contractsRaw, displayedExit: exit, wallet });
      switch (outcome.status) {
        case "confirmed":
          notify.neutral(CASH_OUT.done, CASH_OUT.doneBody(money(outcome.booked.proceedsBase)));
          announce(`${CASH_OUT.done}. ${CASH_OUT.doneBody(money(outcome.booked.proceedsBase))}`);
          await invalidateAfterWrite(queryClient, { wallet, marketId: target.marketId });
          return;
        case "requote":
          setRequoted(outcome.exit);
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

  const cancel = () => setRequoted(null);
  return { canSign: submitter !== null && wallet !== null, busy, note, exit: requoted, prepare, cashOut, cancel, money };
}
