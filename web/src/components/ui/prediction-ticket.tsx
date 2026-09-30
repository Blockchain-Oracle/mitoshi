"use client";
/**
 * From 21st.dev 16240 starc007/be-ui-prediction-market — revamped per D-044 onto Masayume's ticket (the nine blocks stay
 * the host's): the outcome pills (Up/Down with each side's own price), the animated amount field, the quick-add chips
 * and the "to win" figure. What changed: its bundled Tabs become one radiogroup with a CSS thumb (no layout projection,
 * §3.1), its float `buildQuote` is gone (the host passes the chain's quote as base-unit strings), its `$` input is ≥ 16 px
 * and keeps a real <input> under the rolling digits, its StatefulButton states are the host's TxLifecycle CTA (D-052),
 * lucide stays, motion is `m.*` under the island's LazyMotion with a plain swap under reduced motion, and every colour
 * is a token (the up/down washes, never emerald/red literals). Keyboard: arrows move between the outcomes.
 */
import NumberFlow from "@number-flow/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useId, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface TicketOutcome<K extends string> {
  id: K;
  label: string;
  /** "54¢", or "—" when nothing rests on that side. */
  price: string;
}

export function OutcomePills<K extends string>({ outcomes, value, onChange, label }: { outcomes: readonly TicketOutcome<K>[]; value: K | null; onChange: (id: K) => void; label: string }) {
  const index = outcomes.findIndex((o) => o.id === value);
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = outcomes[(Math.max(0, index) + (e.key === "ArrowRight" ? 1 : outcomes.length - 1)) % outcomes.length]!;
    onChange(next.id);
  };
  return (
    <div role="radiogroup" aria-label={label} className="pt-pills" data-side={value ?? undefined} style={{ "--pill-index": Math.max(0, index) } as React.CSSProperties} onKeyDown={onKey}>
      {index >= 0 ? <span aria-hidden className="pt-pill-thumb" /> : null}
      {outcomes.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === value} tabIndex={o.id === value || (index < 0 && o === outcomes[0]) ? 0 : -1} data-outcome={o.id} className="pt-pill" onClick={() => onChange(o.id)}>
          <span>{o.label}</span>
          <span className="numbers">{o.price}</span>
        </button>
      ))}
    </div>
  );
}

function sanitize(value: string): string {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole = "", ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

/** 16240's `AnimatedAmountInput`: a real input (transparent ink) under rolling digits, sized by how long the figure is. */
export function AmountField({ value, onChange, label, describedBy, placeholder = "0" }: { value: string; onChange: (text: string) => void; label: string; describedBy?: string; placeholder?: string }) {
  const id = useId();
  const reduce = useReducedMotion() === true;
  const shown = value || placeholder;
  const seen = new Map<string, number>();
  const chars = shown.split("").map((c) => {
    const n = seen.get(c) ?? 0;
    seen.set(c, n + 1);
    return { key: `${c}-${n}`, c };
  });
  const size = shown.replace(/\D/g, "").length >= 8 ? "pt-amount--sm" : shown.replace(/\D/g, "").length >= 6 ? "pt-amount--md" : "";
  return (
    <div className={cn("pt-amount", size)}>
      <span aria-hidden className="pt-amount-unit">$</span>
      <span className="pt-amount-box" style={{ "--amount-chars": chars.length } as React.CSSProperties}>
        <input id={id} value={value} onChange={(e) => onChange(sanitize(e.target.value))} placeholder={placeholder} inputMode="decimal" autoComplete="off" aria-label={label} aria-describedby={describedBy} className="pt-amount-input" />
        <span aria-hidden className={cn("pt-amount-digits", !value && "is-empty")}>
          <AnimatePresence initial={false} mode="popLayout">
            {chars.map(({ key, c }) => (
              <m.span key={key} initial={reduce ? { opacity: 0 } : { opacity: 0, y: "0.5em" }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: "-0.4em" }} transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }} className="pt-amount-char">
                {c}
              </m.span>
            ))}
          </AnimatePresence>
        </span>
      </span>
    </div>
  );
}

export function QuickAdds({ adds, onAdd, label }: { adds: readonly number[]; onAdd: (units: number) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="pt-adds">
      {adds.map((n) => (
        <button key={n} type="button" className="pt-add" onClick={() => onAdd(n)}>+${n}</button>
      ))}
    </div>
  );
}

/** "To win" (16240's footer) — the one headline figure: NumberFlow over a decimal string, never a float. */
export function ToWin({ label, amount, note }: { label: string; amount: string | null; note: string | null }) {
  return (
    <div className="pt-towin" aria-live="polite">
      <div className="min-w-0">
        <div className="pt-towin-label">{label}</div>
        {note ? <p className="pt-towin-note">{note}</p> : null}
      </div>
      <span className={cn("pt-towin-figure numbers", amount === null && "is-empty")}>{amount === null ? "—" : <NumberFlow value={Number(amount)} format={{ style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }} willChange />}</span>
    </div>
  );
}
