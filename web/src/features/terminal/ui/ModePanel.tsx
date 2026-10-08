"use client";
// The terminal's modes (S23i): Up/Down (Tradash's one tap) beside Mitoshi's other ways to call the same Window — Range,
// Boost and Private, whose bodies are the ticket's own (`RangeTicketMode`, `BoostTicketMode`, `PrivateTicketMode`, lazy
// islands with their stylesheets) hosted for the Window on screen; Parlay, whose slip takes the Window on screen as a
// leg (`ParlayMode`); and Moonshot, which has its own screen (`/games/moonshot`). Each mode names the prompt it will ask for (Q-032: until the wallet key covers those
// selectors, Range, Boost and Private ask the passkey).
import type { EventMarket, Side } from "@cwf/core";
import dynamic from "next/dynamic";
import Link from "next/link";
import { LoadingState } from "@/components/states";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";
import "@/styles/prediction-ticket.css";
import "@/styles/ticket.css";

const RangeTicketMode = dynamic(() => import("@/features/range/RangeTicketMode").then((m) => m.RangeTicketMode), { ssr: false, loading: () => <LoadingState shape="ticket" /> });
const BoostTicketMode = dynamic(() => import("@/features/boost/BoostTicketMode").then((m) => m.BoostTicketMode), { ssr: false, loading: () => <LoadingState shape="ticket" /> });
const PrivateTicketMode = dynamic(() => import("@/features/private/PrivateTicketMode").then((m) => m.PrivateTicketMode), { ssr: false, loading: () => <LoadingState shape="ticket" /> });
const ParlayMode = dynamic(() => import("./ParlayMode").then((m) => m.ParlayMode), { ssr: false, loading: () => <LoadingState shape="ticket" /> });

export type TerminalMode = "updown" | "range" | "boost" | "private" | "parlay";
const MODES: TerminalMode[] = ["updown", "range", "boost", "private", "parlay"];

export function ModeChips({ mode, onMode }: { mode: TerminalMode; onMode: (m: TerminalMode) => void }) {
  return (
    <div className="tm-modes" role="tablist" aria-label={TERMINAL.modes.label}>
      {MODES.map((m) => (
        <button key={m} type="button" role="tab" aria-selected={mode === m} className="tm-choice" onClick={() => (tapFeedback(), onMode(m))}>
          {TERMINAL.modes.names[m]}
        </button>
      ))}
      <Link href="/games/moonshot" className="tm-choice tm-link">{TERMINAL.modes.moonshot}</Link>
    </div>
  );
}

export function ModePanel({ mode, market, side }: { mode: Exclude<TerminalMode, "updown">; market: EventMarket; side: Side | null }) {
  return (
    <section className="tm-mode-panel tk-ticket" aria-label={TERMINAL.modes.names[mode]}>
      <p className="tm-field-hint">{TERMINAL.modes.prompt[mode]}</p>
      {mode === "range" ? <RangeTicketMode market={market} /> : mode === "boost" ? <BoostTicketMode market={market} side={side} /> : mode === "parlay" ? <ParlayMode market={market} /> : <PrivateTicketMode market={market} side={side} />}
    </section>
  );
}
