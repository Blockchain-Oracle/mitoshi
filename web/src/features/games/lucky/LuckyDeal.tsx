"use client";

// The dealt Window and the lever (R4-9, D-227; Owarine 90a91d71:web/src/features/games/lucky/LuckyDeal.tsx's role, on
// Mitoshi's own ticket lane): the Window the reels landed on, found in the browser's live lanes; the live quote on the
// drawn side at the stake (the card places on THIS, never the server's snapshot); and the kit's SwipeToConfirm (Ported
// from Owarine 90a91d71:web/src/components/kit/SwipeToConfirm.tsx, R4-2) as the pull-the-lever place control, through
// usePlaceBet — the same submitter, passkey and pathUSD every call on the venue takes.
import { impliedMultipleHundredths } from "@cwf/core/games";
import { formatBaseUnits, formatClock } from "@cwf/core/units";
import { isOk, type Address } from "@cwf/core";
import { useLanes } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { SwipeToConfirm } from "@/components/kit";
import { ConfettiBurst } from "@/components/ui/confetti-burst";
import { useQuote } from "@/features/markets/ticket/useQuote";
import { usePlaceBet } from "@/features/markets/ticket/usePlaceBet";
import { SIDE_WORD } from "@/features/markets/side-styles";
import { useNowMs } from "@/lib/clock";
import { cadenceLabel } from "../stage/SwipeDeck";
import { LUCKY } from "./copy";
import type { LuckyDealWire } from "./lucky-wire";
import { reportPlaced } from "./useLuckyDraw";

const multiple = (bps: number) => `×${(impliedMultipleHundredths(bps) / 100).toFixed(2)}`;
/** pathUSD has 6 decimals; the stake prints from its base units. */
const dollars = (base: bigint) => `$${formatBaseUnits(base, 6, { minDp: 0 })}`;

export function LuckyDeal({ deal, wallet, onAgain }: { deal: LuckyDealWire; wallet: Address; onAgain: () => void }) {
  const lanes = useLanes();
  const nowMs = useNowMs();
  const stakeBase = BigInt(deal.stakeBase);
  const market = useMemo(() => (lanes && isOk(lanes) ? (lanes.value.lanes.flatMap((l) => l.markets).find((m) => m.marketId === deal.marketId) ?? null) : null), [lanes, deal.marketId]);
  const quote = useQuote({ market: market!, side: deal.draw.side, stakeBase, nowMs, enabled: market !== null });
  const bet = usePlaceBet(wallet, { quiet: true });
  const reported = useRef(false);
  const qc = useQueryClient();

  // Report the lane's answer once, against this draw's row.
  const outcome = bet.state.outcome;
  useEffect(() => {
    if (!outcome || reported.current) return;
    if (outcome.status === "requote") return;
    reported.current = true;
    const done =
      outcome.status === "confirmed"
        ? reportPlaced(deal.drawId, { status: "confirmed", txHash: outcome.booked.txHash, costBase: outcome.booked.costBase.toString(), quantityRaw: outcome.booked.contractsRaw.toString(), refusal: null })
        : reportPlaced(deal.drawId, { status: outcome.status === "unknown" ? "unknown" : "refused", txHash: "txHash" in outcome ? (outcome.txHash ?? null) : null, costBase: null, quantityRaw: null, refusal: outcome.status });
    // The row is open now: the machine's settle watch starts from this read.
    void done.then(() => qc.invalidateQueries({ queryKey: ["games", "lucky", "history"] }));
  }, [outcome, deal.drawId, qc]);

  const remainingSec = market ? market.lockAtSec - Math.floor(nowMs / 1_000) : 0;
  const live = quote.quote;
  const placed = outcome?.status === "confirmed";
  const failed = outcome && outcome.status !== "confirmed" && outcome.status !== "requote" ? outcome.status : null;
  const state = placed ? "done" : bet.placing ? "busy" : "idle";

  return (
    <div className="lk-deal" data-side={deal.draw.side}>
      <ConfettiBurst fire={placed} />
      <div className="lk-deal-line">
        <span className="lk-deal-title">{LUCKY.deal.window(deal.draw.asset, market ? cadenceLabel(market.intervalSec) : "—")}</span>
        <span className="lk-deal-side" data-side={deal.draw.side}>
          {SIDE_WORD[deal.draw.side]}
        </span>
      </div>
      <p className="lk-deal-quote">
        {!market
          ? LUCKY.deal.gone
          : live
            ? `${LUCKY.deal.pays(multiple(live.avgPriceBps))}${deal.dealtAvgPriceBps ? ` · ${LUCKY.deal.dealt(multiple(deal.dealtAvgPriceBps))}` : ""}`
            : quote.pending
              ? LUCKY.deal.quoting
              : LUCKY.deal.noQuote}
        {market && remainingSec > 0 ? ` · ${LUCKY.deal.closes(formatClock(remainingSec))}` : ""}
      </p>
      {placed ? (
        <>
          <p className="lk-deal-done">{LUCKY.placedLine(dollars(stakeBase))}</p>
          <button type="button" className="lk-cta" onClick={onAgain} autoFocus>
            {LUCKY.again}
          </button>
        </>
      ) : (
        <>
          <SwipeToConfirm
            label={LUCKY.lever(dollars(stakeBase))}
            busyLabel={LUCKY.placing}
            doneLabel={LUCKY.placed}
            state={state}
            disabled={!market || !live || remainingSec <= 0}
            onConfirm={() => {
              if (market && live) void bet.place({ market, side: deal.draw.side, stakeBase, displayedQuote: live });
            }}
          />
          {failed ? <p className="lk-deal-fail">{LUCKY.failed(failed)}</p> : null}
          {bet.requoted ? <p className="lk-deal-fail">{LUCKY.deal.pays(multiple(bet.requoted.avgPriceBps))}</p> : null}
        </>
      )}
    </div>
  );
}
