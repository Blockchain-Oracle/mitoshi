"use client";
// Tradash's Add (RV-54) as a centred modal (D-190): more of the same side on the same Window, at a stake from the chips
// (25 / 50 / 75 % of what can be spent, or Max), with "After this order" — the position's contracts and cost once it
// fills. Through the ticket's own quote and order lane (`useQuote`, `useTicketRoute`, `usePlaceBet`).
import { isOk, type EventMarket, type Side } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { useMarket, useSigner } from "@cwf/markets/react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { usePlaceBet } from "@/features/markets/ticket/usePlaceBet";
import { useQuote } from "@/features/markets/ticket/useQuote";
import { useTicketRoute } from "@/features/session";
import { useNowMs } from "@/lib/clock";
import { tapFeedback, tradeFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { TERMINAL } from "../copy";
import { money, multipleOf, sideWord } from "../format";
import type { TerminalPosition } from "../terminal-positions";

const CHIPS = [2_500n, 5_000n, 7_500n, 10_000n] as const;

export function AddModal({ p, open, onOpenChange, spendableBase }: { p: TerminalPosition; open: boolean; onOpenChange: (o: boolean) => void; spendableBase: bigint | null }) {
  const nowMs = useNowMs();
  const { address, hasSigner } = useSigner();
  const reading = useMarket(open ? p.marketId : null);
  const market = reading && isOk(reading) ? reading.value : null;
  const [stakeBase, setStakeBase] = useState(0n);
  useEffect(() => {
    if (open && spendableBase !== null) setStakeBase((spendableBase * CHIPS[0]) / 10_000n);
  }, [open, spendableBase]);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={TERMINAL.add.title(sideWord(p.side), p.asset)} description={TERMINAL.add.body}>
      {market ? <AddBody p={p} market={market} side={p.side} stakeBase={stakeBase} setStakeBase={setStakeBase} spendableBase={spendableBase} nowMs={nowMs} wallet={address} enabled={hasSigner && open} onDone={() => onOpenChange(false)} /> : <p className="tm-empty">…</p>}
    </Modal>
  );
}

function AddBody({ p, market, side, stakeBase, setStakeBase, spendableBase, nowMs, wallet, enabled, onDone }: {
  p: TerminalPosition; market: EventMarket; side: Side; stakeBase: bigint; setStakeBase: (b: bigint) => void; spendableBase: bigint | null; nowMs: number; wallet: `0x${string}` | null; enabled: boolean; onDone: () => void;
}) {
  const quote = useQuote({ market, side, stakeBase, nowMs, enabled: enabled && stakeBase > 0n });
  const route = useTicketRoute({ market, side, stakeBase, quote: quote.quote, listed: false });
  const bet = usePlaceBet(wallet, { quiet: true });
  const waiting = useRef(false);
  useEffect(() => {
    const o = bet.state.outcome;
    if (!o || !waiting.current) return;
    waiting.current = false;
    if (o.status === "confirmed") {
      tradeFeedback("open", "open");
      notify.item({ id: "terminal-add", title: TERMINAL.add.added(p.asset), description: `+${money(o.booked.costBase)} staked` });
      onDone();
    } else notify.item({ id: "terminal-add", type: "warning", title: o.status === "requote" ? TERMINAL.toast.priceMoved : TERMINAL.toast.failed });
  }, [bet.state.outcome, p.asset, onDone]);
  const q = quote.quote;
  const afterContracts = q ? p.heldRaw + q.contractsRaw : null;
  const afterCost = q ? p.costBase + q.expectedCostBase : null;
  const add = () => {
    if (!q || route.fallback) return;
    waiting.current = true;
    notify.item({ id: "terminal-add", type: "loading", title: TERMINAL.add.adding(p.asset) });
    void bet.place({ market, side, stakeBase: q.partial ? q.fillableStakeBase : stakeBase, displayedQuote: q, route: route.route });
  };
  return (
    <div className="tm-add">
      <div className="tm-choices">
        {CHIPS.map((bps) => (
          <button key={String(bps)} type="button" className="tm-choice" disabled={spendableBase === null} onClick={() => (tapFeedback(), spendableBase !== null && setStakeBase((spendableBase * bps) / 10_000n))}>
            {bps === 10_000n ? TERMINAL.settings.max : `${Number(bps) / 100}%`}
          </button>
        ))}
      </div>
      <div className="tm-tiles">
        <span><small>{TERMINAL.add.stake}</small>{money(stakeBase)}</span>
        <span><small>{TERMINAL.stack.pays}</small>{q ? multipleOf(q.avgPriceBps / 10) : "—"}</span>
      </div>
      <p className="tm-card-title">{TERMINAL.add.after}</p>
      <div className="tm-tiles">
        <span><small>{TERMINAL.add.contracts}</small>{afterContracts === null ? "—" : formatBaseUnits(afterContracts, p.decimals, { minDp: 0, maxDp: 2 })}</span>
        <span><small>{TERMINAL.positions.staked}</small>{afterCost === null ? "—" : money(afterCost)}</span>
      </div>
      {route.fallback ? <p className="tm-field-hint tm-warn">{route.fallback.reason}</p> : null}
      <button type="button" className="tm-btn tm-btn-cta" disabled={!q || bet.placing || Boolean(route.fallback)} onClick={add}>{TERMINAL.add.cta(money(q?.partial ? q.fillableStakeBase : stakeBase))}</button>
    </div>
  );
}

