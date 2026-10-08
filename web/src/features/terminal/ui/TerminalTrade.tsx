"use client";
// The trade buttons on the Window on screen (S23c): mounted only when there is a Window, since the ticket's hooks
// (`useQuote`, `useTicketRoute`) take one. Pays × from the live quote, else the top of the book.
import type { EventMarket } from "@cwf/core";
import type { MarketPhase } from "@cwf/core/lifecycle";
import { useEffect } from "react";
import { TERMINAL } from "../copy";
import { money, multipleOf } from "../format";
import { useTerminalBoost } from "../useTerminalBoost";
import { useTerminalOpen } from "../useTerminalOpen";
import { TradeButtons } from "./TradeButtons";

/** `multiple` is what a dollar pays (1000 ÷ ask ticks); `multipleOf` takes the ask, so it goes back through 1000 ÷. */
const paysText = (multiple: number | null, cappedTo: string | null = null) =>
  multiple && Number.isFinite(multiple) ? `${TERMINAL.buttons.pays(multipleOf(1000 / multiple))}${cappedTo ? ` · ${TERMINAL.buttons.max(cappedTo)}` : ""}` : null;

export function TerminalTrade({ market, phase, stakeBase, spot, boostX, onPays }: { market: EventMarket; phase: MarketPhase | null; stakeBase: bigint; spot: number | null; boostX: number; onPays: (text: string) => void }) {
  const t = useTerminalOpen({ market, phase, stakeBase, spot });
  // A Boost set in the stack (RV-41): UP/DOWN open it, with its own refusals under each button.
  const b = useTerminalBoost({ market, stakeBase, multiple: boostX, enabled: phase === "trading" });
  const pair = paysPair(t.sides.up.multiple, t.sides.down.multiple);
  useEffect(() => onPays(pair), [pair, onPays]);
  if (b.on) {
    return (
      <TradeButtons mode="flat" onUp={() => b.open("up")} onDown={() => b.open("down")} busy={b.busy} upSub={TERMINAL.boost.sub(boostX)} downSub={TERMINAL.boost.sub(boostX)} upNote={b.blocked.up} downNote={b.blocked.down} />
    );
  }
  return (
    <TradeButtons
      mode="flat"
      onUp={() => t.open("up")}
      onDown={() => t.open("down")}
      busy={t.busy}
      upSub={paysText(t.sides.up.multiple, t.sides.up.capped ? money(t.sides.up.stakeBase) : null)}
      downSub={paysText(t.sides.down.multiple, t.sides.down.capped ? money(t.sides.down.stakeBase) : null)}
      upNote={t.sides.up.blocked}
      downNote={t.sides.down.blocked}
    />
  );
}

/** What both sides pay, for the settings stack ("1.9×·2.1×"). */
export function paysPair(up: number | null, down: number | null): string {
  return up && down ? `${multipleOf(1000 / up)}·${multipleOf(1000 / down)}` : "—";
}
