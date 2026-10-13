"use client";
/**
 * One parlay ticket's state — the quote, the blocker, the write — computed once and shared by everything that shows
 * it (R4-5, D-227): the phone's SlipBar and its sheet place the same ticket with the same hold, so a tap on either is
 * the same order. Ported from the S10a ParlaySlip (Masayume 68f7a09:web/src/features/parlay/ParlayTicket.tsx's place
 * ladder): the CTA names its blocker (D-045); a requote in flight never replaces the hold (only a verdict does); signed
 * out, the hold opens sign-in for the order (sign-in at the end).
 */
import { mulBpsCeil, parseDecimalToBaseUnits } from "@cwf/core/units";
import { USD_DECIMALS, type ParlayMode, type ParlayReserveState } from "@cwf/core";
import { parseRefusal } from "@cwf/markets/parlay";
import { useBalanceSheet } from "@cwf/markets/react";
import { useMemo, useState } from "react";
import { FUNDING } from "@/features/funding/copy";
import { useFirstFunding } from "@/features/funding/first-fund-state";
import { useWalletSession } from "@/lib/wallet-session";
import { PARLAY } from "./copy";
import type { LegWindow } from "./data";
import { usd } from "./format";
import { useSlip } from "./slip-state";
import { useParlayQuote } from "./useParlayQuote";
import { useParlayWrites } from "./useParlayWrites";

/** The Range lane's headroom (Masayume `RANGE_STAKE_HEADROOM_BPS`): a quote that drifts a hair before it lands is still the deal shown. */
const STAKE_HEADROOM_BPS = 100;

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

  const blocker = ((): string | null => {
    if (reserve.paused) return PARLAY.cta.paused;
    if (slip.legs.length < 2) return PARLAY.cta.needTwo;
    if (amountBase === 0n) return PARLAY.cta.enterAmount;
    if (q.error) {
      if (refusal?.kind === "thin-book") return PARLAY.cta.thinShort(slip.legs.findIndex((l) => l.marketId.toLowerCase() === refusal.marketId.toLowerCase()) + 1);
      if (q.error.kind === "reserve-cap") return PARLAY.cta.reserveCap;
      if (q.error.errorName === "LongShot") return PARLAY.cta.longShot;
      return PARLAY.cta.unavailable;
    }
    if (!quote) return PARLAY.cta.pricing;
    if (q.capacity) return q.capacity.kind === "reserve-cap" ? PARLAY.cta.reserveCap : PARLAY.cta.unavailable;
    if (q.spotsDown) return PARLAY.cta.spotsDown;
    if (q.fair?.blockedLeg != null) return PARLAY.cta.belowFairShort(q.fair.blockedLeg + 1);
    if (!q.fair) return PARLAY.cta.pricing;
    if (!signedOut && funding && (spendable === null || spendable < quote.stakeBase)) return FUNDING.firstFund.funding;
    if (!signedOut && spendable !== null && spendable < quote.stakeBase) return PARLAY.cta.topUp;
    return null;
  })();

  const busy = writes.tx.kind === "signing" || writes.tx.kind === "submitted" || writes.tx.kind === "unknown";
  // The slip as placed (R4-13a, D-227): its legs and latest close, for the receipt's Share card while the slip moves on.
  const [placed, setPlaced] = useState<{ legs: number; band: string; expirySec: number } | null>(null);
  const place = () => {
    if (!quote || blocker) return;
    if (signedOut) return session.connectFor(PARLAY.cta.signInFor(slip.legs.length, usd(quote.stakeBase)));
    setPlaced({ legs: slip.legs.length, band: slip.legs.map((l) => `${l.laneKey.split("|")[0]} ${l.side.toUpperCase()}`).join(" + "), expirySec: Math.max(...legs.map((l) => l.expirySec)) });
    void writes.open({ legs, maxPayoutBase: quote.maxPayoutBase, maxStakeBase: mulBpsCeil(quote.stakeBase, 10_000 + STAKE_HEADROOM_BPS), spots: q.spots });
  };
  return { slip, q, quote, shown: q.shown, refusal, blocker, busy, place, placed, writes, signedOut };
}

export type ParlayTicket = ReturnType<typeof useParlayTicket>;
