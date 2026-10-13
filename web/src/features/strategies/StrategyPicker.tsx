"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/StrategyPicker.tsx (R4-6, D-227) — the wallet's own
// strategies in a bordered dropdown, each with its portrait and why it is yours (Published by you · Copying · Fading ·
// Paused). Closes on an outside tap or Escape.
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AgentPortrait } from "./AgentPortrait";
import { strategyIdentity } from "./identity";
import type { MinePayload, StrategyWire } from "./protocol";
import "./builder.css";

const P = { label: "Manage a strategy", choose: "Choose a strategy", published: "Published by you", copying: "Copying", fading: "Fading", paused: "Paused" };

export function roleOf(card: StrategyWire, sub: MinePayload["subscriptions"][number] | null, wallet: string | null): string {
  const roles: string[] = [];
  if (wallet && card.creator.toLowerCase() === wallet.toLowerCase()) roles.push(P.published);
  if (sub) roles.push(!sub.active ? P.paused : sub.mode === "fade" ? P.fading : P.copying);
  return roles.join(" · ");
}

export function StrategyPicker({ strategies, selected, onSelect, subOf, wallet }: { strategies: readonly StrategyWire[]; selected: string | null; onSelect: (id: string) => void; subOf: (id: string) => MinePayload["subscriptions"][number] | null; wallet: string | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const current = strategies.find((s) => s.strategyId === selected) ?? null;
  return (
    <div className="strat-picker" ref={root}>
      <p className="desk-field-label mb-2" id="strat-picker-label">{P.label}</p>
      <button type="button" className="strat-picker-btn" aria-haspopup="listbox" aria-expanded={open} aria-labelledby="strat-picker-label" onClick={() => setOpen((o) => !o)}>
        {current ? <Row card={current} role={roleOf(current, subOf(current.strategyId), wallet)} /> : <span className="strat-picker-empty">{P.choose}</span>}
        <ChevronDown className={cn("strat-picker-chevron", open && "strat-picker-chevron--open")} aria-hidden="true" />
      </button>
      {open && (
        <div className="strat-picker-menu" role="listbox" aria-labelledby="strat-picker-label">
          {strategies.map((card) => (
            <button key={card.strategyId} type="button" role="option" aria-selected={card.strategyId === selected} className={cn("strat-picker-item", card.strategyId === selected && "strat-picker-item--on")} onClick={() => { onSelect(card.strategyId); setOpen(false); }}>
              <Row card={card} role={roleOf(card, subOf(card.strategyId), wallet)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ card, role }: { card: StrategyWire; role: string }) {
  const { name, seed } = strategyIdentity(card);
  return (
    <span className="strat-picker-row">
      <AgentPortrait seed={seed} name={name} size="small" />
      <span className="min-w-0">
        <span className="strat-picker-name">{name}</span>
        <span className="strat-picker-meta">#{card.strategyId}{role && ` · ${role}`}</span>
      </span>
    </span>
  );
}
