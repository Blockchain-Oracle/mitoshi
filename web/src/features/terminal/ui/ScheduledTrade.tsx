"use client";
// A prelisted Window's scheduled call on the terminal (S23c, D-088): the Window hasn't opened, so a tap rests a call
// at the user's own cents price that fills when it opens — the ticket's `restingQuote` on the Series grid and
// `usePlaceBet(…, { resting: true })` from the wallet (a scheduled call never pays from the Trading Balance).
import { restingQuote, type EventMarket, type Side } from "@cwf/core";
import { useSeriesGrid, useSigner } from "@cwf/markets/react";
import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TICKET } from "@/features/markets/copy";
import { DEFAULT_PRICE_CENTS } from "@/features/markets/ticket/PriceControl";
import { usePlaceBet } from "@/features/markets/ticket/usePlaceBet";
import { CONNECT } from "@/lib/copy";
import { tapFeedback, tradeFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { TERMINAL } from "../copy";
import { clockText, multipleOf, sideWord } from "../format";
import { TradeButtons } from "./TradeButtons";

const PRICE_CHIPS = [50, 55, 60, 70] as const;
const TOAST = "terminal-schedule";

export function ScheduledTrade({ market, stakeBase }: { market: EventMarket; stakeBase: bigint }) {
  const session = useWalletSession();
  const { address } = useSigner();
  const grid = useSeriesGrid(market.seriesId);
  const [cents, setCents] = useState(DEFAULT_PRICE_CENTS);
  const bet = usePlaceBet(address, { quiet: true });
  const [busy, setBusy] = useState<Side | null>(null);
  const tapped = useRef<Side | null>(null);

  useEffect(() => {
    const outcome = bet.state.outcome;
    const side = tapped.current;
    if (!outcome || !side) return;
    tapped.current = null;
    setBusy(null);
    if (outcome.status === "nothingFilled") {
      tradeFeedback("open", "open");
      return void notify.item({ id: TOAST, title: TICKET.scheduled.rested, description: `${sideWord(side)} ${market.asset} at ${cents}¢` });
    }
    if (outcome.status === "confirmed") return void notify.item({ id: TOAST, title: TERMINAL.toast.opened(sideWord(side), market.asset) });
    notify.item({ id: TOAST, type: "warning", title: TERMINAL.toast.failed, description: TERMINAL.toast.nothingTaken });
  }, [bet.state.outcome, cents, market.asset]);

  const schedule = (side: Side) => {
    if (!session.isConnected) return void notify.item({ id: TOAST, title: TERMINAL.toast.signIn, action: { label: CONNECT.connect, onClick: session.connect } });
    if (!grid?.ok) return void notify.item({ id: TOAST, title: TERMINAL.toast.gettingPrice, timeout: 2_000 });
    const q = restingQuote({ side, priceCents: cents, stakeBase, grid: grid.value, decimals: market.decimals, quotedAtMs: Date.now() });
    if (!q.ok) return void notify.item({ id: TOAST, type: "warning", title: q.blocker === "too-small" ? TICKET.scheduled.tooSmall : TERMINAL.toast.failed, description: TERMINAL.toast.nothingTaken });
    tapped.current = side;
    setBusy(side);
    notify.item({ id: TOAST, type: "loading", title: TERMINAL.scheduled.scheduling(sideWord(side), market.asset) });
    void bet.place({ market, side, stakeBase, displayedQuote: q.quote, route: { kind: "wallet" } }, { resting: true });
  };
  const step = (d: number) => {
    tapFeedback();
    setCents((c) => Math.max(1, Math.min(99, c + d)));
  };
  const pays = multipleOf(cents * 10);

  return (
    <div className="tm-scheduled">
      <p className="tm-field-hint">{TERMINAL.scheduled.note(clockText(market.tradingStartSec))}</p>
      <div className="tm-price" role="group" aria-label={TICKET.scheduled.priceLabel}>
        <button type="button" className="tm-choice" aria-label={TICKET.scheduled.stepDown} onClick={() => step(-1)}><Minus aria-hidden className="size-4" /></button>
        <output className="tm-price-value" aria-live="polite">{cents}¢</output>
        <button type="button" className="tm-choice" aria-label={TICKET.scheduled.stepUp} onClick={() => step(1)}><Plus aria-hidden className="size-4" /></button>
        {PRICE_CHIPS.map((c) => (
          <button key={c} type="button" className="tm-choice" aria-pressed={cents === c} onClick={() => (tapFeedback(), setCents(c))}>{c}¢</button>
        ))}
      </div>
      <TradeButtons
        mode="flat"
        onUp={() => schedule("up")}
        onDown={() => schedule("down")}
        busy={busy}
        upSub={TERMINAL.buttons.pays(pays)}
        downSub={TERMINAL.buttons.pays(pays)}
        upNote={null}
        downNote={null}
      />
    </div>
  );
}
