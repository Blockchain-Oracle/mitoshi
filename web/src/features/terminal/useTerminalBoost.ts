"use client";
// Boost from the terminal's UP/DOWN (RV-41, RV-59, S23i): with the settings stack at a multiple above 1×, a tap opens a
// Boost on the Window instead of a plain call — the ticket's own terms (`useBoostTicket`: the reserve's sizing, the
// fair-value check, the void bound, its caps, named before anything is signed) and its own write lane (`useBoostWrites`:
// a fresh signed spot, then one passkey prompt, Q-032's default). The outcome is said in the terminal's toast.
import type { EventMarket, Side } from "@cwf/core";
import { blockerLine, diagnosisCopy } from "@cwf/core/copy";
import type { MarketPhase } from "@cwf/core/lifecycle";
import { useEffect, useRef, useState } from "react";
import { BOOST } from "@/features/boost/copy";
import { useBoostTicket } from "@/features/boost/useBoostTicket";
import { useBoostWrites } from "@/features/boost/useBoostWrites";
import { laneBlocker } from "@/features/markets/ticket/ticket-guards";
import { useLaneGuard } from "@/features/markets/ticket/useLaneGuard";
import { CONNECT } from "@/lib/copy";
import { tradeFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { useWalletSession } from "@/lib/wallet-session";
import { TERMINAL } from "./copy";
import { money, sideWord } from "./format";

const BOOST_TOAST = "terminal-boost";

export function useTerminalBoost({ market, phase, stakeBase, multiple, enabled }: { market: EventMarket; phase: MarketPhase | null; stakeBase: bigint; multiple: number; enabled: boolean }) {
  const session = useWalletSession();
  // The session and the lane (S6) hold a Boost as they hold a plain call: a halt or a paused lane is named first.
  const guard = useLaneGuard(market);
  const laneKind = phase ? laneBlocker(phase, guard.lane) : null;
  const held = laneKind ? blockerLine(laneKind, guard.ctx) : null;
  const writes = useBoostWrites(session.address);
  const on = multiple > 1;
  const up = useBoostTicket({ market, side: "up", stakeBase, multiple, enabled: on && enabled });
  const down = useBoostTicket({ market, side: "down", stakeBase, multiple, enabled: on && enabled });
  const [lastSide, setLastSide] = useState<Side | null>(null);
  const tapped = useRef<Side | null>(null);

  // The outcome of the last tap, said once.
  const outcome = writes.outcome;
  useEffect(() => {
    const side = tapped.current;
    if (!outcome || !side) return;
    tapped.current = null;
    if (outcome.status === "confirmed") {
      tradeFeedback("open", "open");
      const b = outcome.booked;
      return void notify.item({ id: BOOST_TOAST, title: TERMINAL.boost.opened(sideWord(side), market.asset, multiple), description: b ? TERMINAL.boost.openedBody(money(b.stakeBase)) : BOOST.outcome.placedUnread });
    }
    notify.item({ id: BOOST_TOAST, type: "warning", title: TERMINAL.toast.failed, description: `${diagnosisCopy(outcome.diagnosis.kind).headline} ${TERMINAL.toast.nothingTaken}` });
  }, [outcome, market.asset, multiple]);

  const open = (side: Side) => {
    if (!session.isConnected) return void notify.item({ id: BOOST_TOAST, title: TERMINAL.toast.signIn, description: TERMINAL.toast.signInBody, action: { label: CONNECT.connect, onClick: session.connect } });
    if (held) return void notify.item({ id: BOOST_TOAST, type: "warning", title: held });
    const t = side === "up" ? up : down;
    if (t.blocker || !t.openArgs) return void notify.item({ id: BOOST_TOAST, type: "warning", title: t.blocker ?? BOOST.cta.pricing });
    tapped.current = side;
    setLastSide(side);
    notify.item({ id: BOOST_TOAST, type: "loading", title: TERMINAL.boost.opening(sideWord(side), market.asset, multiple) });
    void writes.open(t.openArgs);
  };
  const placing = writes.fetchingSpot || writes.tx.kind === "signing" || writes.tx.kind === "submitted";
  return { on, open, busy: placing ? lastSide : null, blocked: { up: held ?? up.blocker, down: held ?? down.blocker } };
}
