"use client";
// The trade buttons on the Window on screen (S23c): mounted only when there is a Window, since the ticket's hooks
// (`useQuote`, `useTicketRoute`) take one. Pays × from the live quote, else the top of the book.
import type { EventMarket } from "@cwf/core";
import type { MarketPhase } from "@cwf/core/lifecycle";
import { useEffect } from "react";
import { TERMINAL } from "../copy";
import { multipleOf } from "../format";
import { useTerminalOpen } from "../useTerminalOpen";
import { TradeButtons } from "./TradeButtons";

/** `multiple` is what a dollar pays (1000 ÷ ask ticks); `multipleOf` takes the ask, so it goes back through 1000 ÷. */
const paysText = (multiple: number | null) => (multiple && Number.isFinite(multiple) ? TERMINAL.buttons.pays(multipleOf(1000 / multiple)) : null);

export function TerminalTrade({ market, phase, stakeBase, spot, onPays }: { market: EventMarket; phase: MarketPhase | null; stakeBase: bigint; spot: number | null; onPays: (text: string) => void }) {
  const t = useTerminalOpen({ market, phase, stakeBase, spot });
  const pair = paysPair(t.sides.up.multiple, t.sides.down.multiple);
  useEffect(() => onPays(pair), [pair, onPays]);
  return (
    <TradeButtons
      mode="flat"
      onUp={() => t.open("up")}
      onDown={() => t.open("down")}
      busy={t.busy}
      upSub={paysText(t.sides.up.multiple)}
      downSub={paysText(t.sides.down.multiple)}
      upNote={t.sides.up.blocked}
      downNote={t.sides.down.blocked}
    />
  );
}

/** What both sides pay, for the settings stack ("1.9×·2.1×"). */
export function paysPair(up: number | null, down: number | null): string {
  return up && down ? `${multipleOf(1000 / up)}·${multipleOf(1000 / down)}` : "—";
}
