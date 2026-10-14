"use client";
/**
 * One parlay ticket's state — the quote, the blocker, the write — computed once and shared by everything that shows
 * it (R4-5, D-227): the phone's SlipBar and its sheet place the same ticket with the same hold, so a tap on either is
 * the same order. Ported from the S10a ParlaySlip (Masayume 68f7a09:web/src/features/parlay/ParlayTicket.tsx's place
 * ladder): the CTA names its blocker (D-045); a requote in flight never replaces the hold (only a verdict does); signed
 * out, the hold opens sign-in for the order (sign-in at the end).
 * R6 games §4.4 (T06, T17): the blocker is `parlayBlocker`'s fix (swap or drop a leg, Use $X, Add money), the quote's and
 * the first dollars' waits named then honest when late.
 */
import { mulBpsCeil, parseDecimalToBaseUnits } from "@cwf/core/units";
import { USD_DECIMALS, type ParlayMode, type ParlayReserveState } from "@cwf/core";
import { parseRefusal } from "@cwf/markets/parlay";
import { keys, useBalanceSheet } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useFirstFunding } from "@/features/funding/first-fund-state";
import { useNowMs } from "@/lib/clock";
import { useWalletSession } from "@/lib/wallet-session";
import { fitAmountBase } from "../range/blockers";
import { useLate } from "../range/useLate";
import { parlayBlocker } from "./blockers";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { usd } from "./format";
import { useSlip } from "./slip-state";
import { useParlayQuote } from "./useParlayQuote";
import { useParlayWrites } from "./useParlayWrites";

/** The Range lane's headroom (Masayume `RANGE_STAKE_HEADROOM_BPS`): a quote that drifts a hair before it lands is still the deal shown. */
const STAKE_HEADROOM_BPS = 100;
const QUOTE_LATE_MS = 15_000;
const FUNDING_LATE_MS = 30_000;

export function useParlayTicket(reserve: ParlayReserveState, windows: readonly LegWindow[]) {
  const slip = useSlip();
  const session = useWalletSession();
  const sheet = useBalanceSheet(session.address);
  const writes = useParlayWrites(session.address);
  const amountBase = parseDecimalToBaseUnits(slip.amountText || "0", USD_DECIMALS) ?? 0n;
  const mode: ParlayMode = slip.mode === "fixStake" ? { kind: "fixStake", stakeBase: amountBase } : { kind: "fixPayout", maxPayoutBase: amountBase };
  const legs = useMemo(() => {
    const byId = new Map(windows.map((w) => [w.market.marketId, w.market.expirySec]));
    return slip.legs.map((l) => ({ marketId: l.marketId, side: l.side, feed: l.feed, expirySec: byId.get(l.marketId) ?? 0 }));
  }, [slip.legs, windows]);
  const q = useParlayQuote({ legs, mode, params: reserve.params, enabled: !reserve.paused });
  const quote = q.quote;
  const refusal = parseRefusal(q.error);
  const spendable = sheet?.ok ? sheet.value.spendableBase : null;
  const signedOut = !session.isConnected;
  // A brand-new account signed in for this order: its first test dollars are landing (R4-4, critic gap 10).
  const funding = useFirstFunding();

  const nowMs = useNowMs();
  const queryClient = useQueryClient();
  const ready = quote !== null && q.fair !== null;
  const fundingWaits = !signedOut && funding && quote !== null && (spendable === null || spendable < quote.stakeBase);
  const fundingClock = useLate(fundingWaits, FUNDING_LATE_MS, nowMs);
  const quoteClock = useLate(!ready && q.error === null, QUOTE_LATE_MS, nowMs, `${slip.legs.map((l) => `${l.marketId}:${l.side}`).join("|")}|${slip.mode}:${amountBase}`);
  const priced = quote ?? q.last;
  const fit = priced ? fitAmountBase({ stakeBase: priced.stakeBase, maxPayoutBase: priced.maxPayoutBase, reserve, lockedByExpiryBase: q.lockedByExpiryBase, mode: slip.mode, decimals: USD_DECIMALS }) : null;
  const thinLeg = refusal?.kind === "thin-book" ? slip.legs.findIndex((l) => l.marketId.toLowerCase() === refusal.marketId.toLowerCase()) : -1;
  const blocker = parlayBlocker({
    paused: reserve.paused,
    legs: slip.legs,
    amountZero: amountBase === 0n,
    error: q.error,
    thinLeg: thinLeg >= 0 ? thinLeg : null,
    quote: ready ? "ready" : quoteClock.late ? "late" : "waiting",
    capacity: q.capacity,
    spotsDown: q.spotsDown,
    underFairLeg: q.fair?.blockedLeg ?? null,
    legProbBps: priced && priced.legProbBps.length === slip.legs.length ? priced.legProbBps : null,
    fitText: fit !== null ? usd(fit) : null,
    funding: !fundingWaits ? "ready" : fundingClock.late ? "late" : "waiting",
    overBalance: !signedOut && quote && spendable !== null && spendable < quote.stakeBase ? { freeText: usd(spendable), stakeText: usd(quote.stakeBase) } : null,
    windows,
  });
  const retryQuote = () => {
    quoteClock.restart();
    q.retry();
  };
  const retryFunds = () => {
    fundingClock.restart();
    void queryClient.invalidateQueries({ queryKey: keys.balanceSheet(session.address) });
  };

  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  // The slip as placed (R4-13a, D-227): its legs and latest close, for the receipt's Share card while the slip moves on.
  const [placed, setPlaced] = useState<{ legs: number; band: string; expirySec: number } | null>(null);
  const place = () => {
    if (!quote || blocker) return;
    if (signedOut) return session.connectFor(PARLAY.cta.signInFor(slip.legs.length, usd(quote.stakeBase)));
    setPlaced({ legs: slip.legs.length, band: slip.legs.map((l) => `${l.laneKey.split("|")[0]} ${l.side.toUpperCase()}`).join(" + "), expirySec: Math.max(...legs.map((l) => l.expirySec)) });
    void writes.open({ legs, maxPayoutBase: quote.maxPayoutBase, maxStakeBase: mulBpsCeil(quote.stakeBase, 10_000 + STAKE_HEADROOM_BPS), spots: q.spots });
  };
  return { slip, q, quote, shown: q.shown, refusal, blocker, busy, place, placed, writes, signedOut, retryQuote, retryFunds };
}

export type ParlayTicket = ReturnType<typeof useParlayTicket>;
