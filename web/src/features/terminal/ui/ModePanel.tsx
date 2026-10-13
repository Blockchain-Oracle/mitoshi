"use client";
// The terminal's modes (S23i): Up/Down (Tradash's one tap) beside Mitoshi's other ways to call the same Window — Range,
// Boost and Private, whose bodies are the ticket's own (`RangeTicketMode`, `BoostTicketMode`, `PrivateTicketMode`, lazy
// islands with their stylesheets) hosted for the Window on screen; Parlay, whose slip takes the Window on screen as a
// leg (`ParlayMode`). Each mode names the prompt it will ask for (Q-032: until the wallet key covers those selectors,
// Range, Boost and Private ask the passkey). R4-3 (D-227): the row is Owarine's TextTabs (words with a sliding bar, the
// kit's port of Owarine 90a91d71 components/kit/TextTabs.tsx), not six chips; Moonshot left the row (the dock's More →
// Games has it); Boost is offered once on a phone — the stack's Boost setting — and stays a tab on desktop, where the
// inline knock-out ticket has room.
import type { EventMarket, Side } from "@cwf/core";
import dynamic from "next/dynamic";
import { TextTabs } from "@/components/kit/TextTabs";
import { LoadingState } from "@/components/states";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";
import { useIsDesktop } from "../useIsDesktop";
import "@/styles/prediction-ticket.css";
import "@/styles/ticket.css";
import "@/components/kit/kit.css";

const RangeTicketMode = dynamic(() => import("@/features/range/RangeTicketMode").then((m) => m.RangeTicketMode), { ssr: false, loading: () => <LoadingState shape="ticket" /> });
const BoostTicketMode = dynamic(() => import("@/features/boost/BoostTicketMode").then((m) => m.BoostTicketMode), { ssr: false, loading: () => <LoadingState shape="ticket" /> });
const PrivateTicketMode = dynamic(() => import("@/features/private/PrivateTicketMode").then((m) => m.PrivateTicketMode), { ssr: false, loading: () => <LoadingState shape="ticket" /> });
const ParlayMode = dynamic(() => import("./ParlayMode").then((m) => m.ParlayMode), { ssr: false, loading: () => <LoadingState shape="ticket" /> });

export type TerminalMode = "updown" | "range" | "boost" | "private" | "parlay";
export const MODES: readonly TerminalMode[] = ["updown", "range", "boost", "private", "parlay"];

export function ModeChips({ mode, onMode }: { mode: TerminalMode; onMode: (m: TerminalMode) => void }) {
  const desktop = useIsDesktop();
  const tabs = MODES.filter((m) => desktop || m !== "boost").map((m) => ({ value: m, label: TERMINAL.modes.names[m] }));
  return <TextTabs value={mode} onChange={(m) => (tapFeedback(), onMode(m))} tabs={tabs} label={TERMINAL.modes.label} className="tm-modes" />;
}

export function ModePanel({ mode, market, side }: { mode: Exclude<TerminalMode, "updown">; market: EventMarket; side: Side | null }) {
  return (
    <section className="tm-mode-panel tk-ticket" aria-label={TERMINAL.modes.names[mode]}>
      <p className="tm-field-hint">{TERMINAL.modes.prompt[mode]}</p>
      {mode === "range" ? <RangeTicketMode market={market} /> : mode === "boost" ? <BoostTicketMode market={market} side={side} /> : mode === "parlay" ? <ParlayMode market={market} /> : <PrivateTicketMode market={market} side={side} />}
    </section>
  );
}
