"use client";
// Ported from Agari 03b30ab:web/src/features/markets/ticket/PriceControl.tsx — a scheduled call's price in whole cents
// (D-088): a 1¢ stepper and four quick chips in the amount block's grammar; always an integer 1..99.
import { isPriceCents } from "@cwf/core";
import type { Side } from "@cwf/core";
import { useEffect, useState } from "react";
import { TICKET } from "../copy";
import { SIDE_WORD } from "../side-styles";

export const DEFAULT_PRICE_CENTS = 55;
const PRICE_CHIPS = [50, 55, 60, 70] as const;

export function PriceControl({ priceCents, onChange, side }: { priceCents: number; onChange: (cents: number) => void; side: Side | null }) {
  const [text, setText] = useState(String(priceCents));
  useEffect(() => setText(String(priceCents)), [priceCents]);
  const step = (by: number) => onChange(Math.min(99, Math.max(1, priceCents + by)));
  const type = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    setText(digits);
    if (digits && isPriceCents(Number(digits))) onChange(Number(digits));
  };
  const S = TICKET.scheduled;
  return (
    <div className="tk-amount tk-price">
      <div className="tk-amount-head">
        <span className="tk-amount-label">{S.priceLabel}</span>
        <span className="tk-amount-balance">{S.pays}</span>
      </div>
      <div className="tk-amount-field">
        <button type="button" className="tk-add min-h-touch" aria-label={S.stepDown} title={S.stepDown} disabled={priceCents <= 1} onClick={() => step(-1)}>−</button>
        <input inputMode="numeric" autoComplete="off" value={text} onChange={(e) => type(e.target.value)} onBlur={() => setText(String(priceCents))} className="tk-amount-input" aria-label={S.priceAria(side ? SIDE_WORD[side] : "")} />
        <span className="tk-amount-unit">¢</span>
        <button type="button" className="tk-add min-h-touch" aria-label={S.stepUp} title={S.stepUp} disabled={priceCents >= 99} onClick={() => step(1)}>+</button>
      </div>
      <div className="tk-amount-row">
        <div role="group" aria-label={S.priceChips} className="tk-adds">
          {PRICE_CHIPS.map((cents) => (
            <button key={cents} type="button" className="tk-add min-h-touch" aria-pressed={cents === priceCents} onClick={() => onChange(cents)}>{cents}¢</button>
          ))}
        </div>
      </div>
    </div>
  );
}
