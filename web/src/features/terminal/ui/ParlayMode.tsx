"use client";
// Parlay in the terminal (RV-59, S23i), Owarine ecb7565b:web/src/features/terminal/parlay/useTerminalParlay.tsx's
// grammar on Mitoshi's own parlay: UP/DOWN add the Window on screen to the slip (the same side again takes it out, the
// other side flips it), and the slip is `/parlay`'s — legs that follow their lane when a Window rolls, the reserve's
// quote on signed spots, stake or payout, one passkey prompt (Q-032) — beside the chart on desktop, in a drawer on a
// phone. Switching the symbol keeps the slip, so a leg on another market is one markets-drawer tap away. A lazy island.
import type { EventMarket, Side } from "@cwf/core";
import { EmptyState, LoadingState } from "@/components/states";
import { PARLAY } from "@/features/parlay/copy";
import { useParlayReserve, useParlayWindows, type ParlayWindows } from "@/features/parlay/data";
import { ParlaySlip } from "@/features/parlay/ParlaySlip";
import { SlipProvider, useSlip } from "@/features/parlay/slip-state";
import { useNowMs } from "@/lib/clock";
import { tapFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { TERMINAL } from "../copy";
import { TradeButtons } from "./TradeButtons";
import "@/styles/parlay.css";

const LEG_TOAST = "terminal-parlay";

function AddLeg({ market, windows }: { market: EventMarket; windows: ParlayWindows }) {
  const slip = useSlip();
  const w = windows.byId.get(market.marketId) ?? null;
  const leg = slip.legs.find((l) => l.marketId === market.marketId) ?? null;
  const tap = (side: Side) => {
    tapFeedback();
    if (leg && leg.side === side) return slip.remove(leg.key);
    if (!w) return void notify.item({ id: LEG_TOAST, type: "warning", title: TERMINAL.parlay.closing });
    if (!w.model) return void notify.item({ id: LEG_TOAST, type: "warning", title: TERMINAL.parlay.unpriced(market.asset) });
    if (!leg && slip.legs.length >= slip.maxLegs) return void notify.item({ id: LEG_TOAST, type: "warning", title: TERMINAL.parlay.full(slip.maxLegs) });
    slip.add(w, side);
  };
  const sub = (side: Side) => (leg?.side === side ? TERMINAL.parlay.inSlip : TERMINAL.parlay.add);
  return <TradeButtons mode="flat" onUp={() => tap("up")} onDown={() => tap("down")} busy={null} picked={leg?.side ?? null} upSub={sub("up")} downSub={sub("down")} upNote={null} downNote={null} />;
}

export function ParlayMode({ market }: { market: EventMarket }) {
  const nowMs = useNowMs();
  const reading = useParlayReserve();
  const windows = useParlayWindows(nowMs);
  if (reading === null) return <LoadingState shape="ticket" />;
  const reserve = reading.ok ? reading.value : null;
  if (!reserve) return <EmptyState why={PARLAY.notDeployed.why} />;
  return (
    <SlipProvider windows={windows.windows} maxLegs={reserve.params.maxLegs}>
      <AddLeg market={market} windows={windows} />
      <ParlaySlip reserve={reserve} windows={windows.windows} />
    </SlipProvider>
  );
}
