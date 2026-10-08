"use client";
// Tradash's TP/SL sheet (RV-51/23e) as a right-edge drawer (D-190), on Mitoshi's definition (D-197, D-200): a
// take-profit and a stop-loss on what Close pays — set as ROI on the stake or in dollars — that the open tab closes the
// position at with the one-tap Close; drawn on the chart in spot terms ("≈"). The server-side keeper is S24 (D-193):
// until then they run only while Mitoshi is open, and need a key that signs without a prompt until the Window closes.
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { useEffect, useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { tapFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { TERMINAL } from "../copy";
import { setExits } from "../entries";
import { money, sideWord, USD_DECIMALS } from "../format";
import type { TerminalPosition } from "../terminal-positions";
import type { PositionValue } from "../usePositionValue";
import { useSignerLasts } from "../useTrail";

const TP_ROI = [25, 50, 100] as const;
const SL_ROI = [-25, -50, -75] as const;

const target = (cost: bigint, pct: number) => (cost * BigInt(100 + pct)) / 100n;
const text = (base: bigint | null) => (base === null ? "" : formatBaseUnits(base, USD_DECIMALS, { group: false, minDp: 2, maxDp: 2 }));

function Row({ label, roi, cost, value, onChange }: { label: string; roi: readonly number[]; cost: bigint; value: bigint | null; onChange: (b: bigint | null) => void }) {
  const [typed, setTyped] = useState(text(value));
  useEffect(() => setTyped(text(value)), [value]);
  return (
    <div className="tm-field">
      <span className="tm-field-head">{label}{value !== null ? <span className="tm-stack-value">{money(value)}</span> : null}</span>
      <div className="tm-choices">
        {roi.map((pct) => (
          <button key={pct} type="button" className="tm-choice" aria-pressed={value === target(cost, pct)} onClick={() => (tapFeedback(), onChange(target(cost, pct)))}>{TERMINAL.exits.roi(pct)}</button>
        ))}
        <button type="button" className="tm-choice" aria-pressed={value === null} onClick={() => (tapFeedback(), onChange(null))}>{TERMINAL.exits.off}</button>
      </div>
      <input className="tm-input" inputMode="decimal" aria-label={label} value={typed} placeholder="0.00" onChange={(e) => setTyped(e.target.value)} onBlur={() => onChange(typed.trim() ? (parseDecimalToBaseUnits(typed, USD_DECIMALS) ?? null) : null)} />
    </div>
  );
}

export function ExitsDrawer({ p, value, open, onOpenChange }: { p: TerminalPosition | null; value: PositionValue | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const lasts = useSignerLasts();
  const [tp, setTp] = useState<bigint | null>(null);
  const [sl, setSl] = useState<bigint | null>(null);
  useEffect(() => {
    if (!open || !p) return;
    setTp(p.tpBase);
    setSl(p.slBase);
  }, [open, p]);
  if (!p) return null;
  const save = () => {
    tapFeedback();
    const id = `exits-${p.marketId}`;
    if ((tp !== null || sl !== null) && !lasts(p)) return void notify.item({ id, type: "warning", title: TERMINAL.trail.needsKey, description: TERMINAL.trail.needsKeyBody });
    setExits(p.marketId, p.side, { tpBase: tp, slBase: sl }, value?.spot ?? p.entrySpot ?? 0);
    notify.item({ id, title: TERMINAL.exits.saved(p.asset), description: [tp !== null ? TERMINAL.exits.when(TERMINAL.exits.tp, `≥ ${money(tp)}`) : null, sl !== null ? TERMINAL.exits.when(TERMINAL.exits.sl, `≤ ${money(sl)}`) : null].filter(Boolean).join(" · ") || TERMINAL.exits.off });
    onOpenChange(false);
  };
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={TERMINAL.exits.title(sideWord(p.side), p.asset)} description={TERMINAL.exits.body}>
        {value?.valueBase != null ? <p className="tm-field-hint">{TERMINAL.exits.now(`${value.approx ? "≈ " : ""}${money(value.valueBase)}`)} · {TERMINAL.positions.staked} {money(p.costBase)}</p> : null}
        <Row label={TERMINAL.exits.tp} roi={TP_ROI} cost={p.costBase} value={tp} onChange={setTp} />
        <Row label={TERMINAL.exits.sl} roi={SL_ROI} cost={p.costBase} value={sl} onChange={setSl} />
        <button type="button" className="tm-btn tm-btn-cta" onClick={save}>{TERMINAL.exits.save}</button>
      </SlideOverContent>
    </SlideOver>
  );
}
