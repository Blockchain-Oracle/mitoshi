"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/sheets/SettingsSheet.tsx — a right-edge drawer
// (D-190) instead of a bottom sheet, with Mitoshi's rows: Size in dollars (integer base units), Boost (Tradash's
// leverage, RV-41), the trailing distance and the Close tolerance (D-197). Sound & Vibration stays in /settings/account (one app-wide setting).
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { getLeverageReserveState } from "@cwf/markets/leverage";
import { useReadingQuery } from "@cwf/markets/react";
import { useEffect, useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { boostKeys } from "@/features/boost/useBoostWrites";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";
import { money, USD_DECIMALS } from "../format";
import { CLOSE_TOLERANCE_CHOICES_BPS, setTradeSettings, TRAIL_CHOICES, useTradeSettings } from "../settings";
import { trailWords } from "./TradeButtons";

export function SettingsDrawer({ open, onOpenChange, stakeBase, minBase, maxBase, capped }: { open: boolean; onOpenChange: (open: boolean) => void; stakeBase: bigint; minBase: bigint; maxBase: bigint | null; capped: keyof typeof TERMINAL.stack.cappedWhy | null }) {
  const settings = useTradeSettings();
  const [text, setText] = useState("");
  useEffect(() => {
    if (open) setText(formatBaseUnits(stakeBase, USD_DECIMALS, { group: false, minDp: 0, maxDp: 2 }));
  }, [open, stakeBase]);
  const setSize = (base: bigint | null) => {
    tapFeedback();
    setTradeSettings({ sizeBase: base === null ? null : (base < minBase ? minBase : base).toString() });
  };
  const share = (bps: bigint) => (maxBase === null ? null : (maxBase * bps) / 10_000n);
  const presets: Array<[string, bigint | null]> = [
    [TERMINAL.settings.min, minBase],
    ["25%", share(2_500n)],
    ["50%", share(5_000n)],
    [TERMINAL.settings.max, maxBase],
  ];
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={TERMINAL.settings.title}>
        <div className="tm-field">
          <label className="tm-field-head" htmlFor="tm-size">
            {TERMINAL.settings.size}
            <span className="tm-stack-value">{money(stakeBase)}</span>
          </label>
          {/* Tradash's Size header (§8): what can be spent, or "Balance unavailable" before it's read. */}
          <span className="tm-field-hint">{maxBase === null ? TERMINAL.settings.balanceUnavailable : TERMINAL.settings.available(money(maxBase))}</span>
          <input
            id="tm-size"
            className="tm-input"
            inputMode="decimal"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              const base = parseDecimalToBaseUnits(text, USD_DECIMALS);
              if (base !== null && base > 0n) setSize(base);
            }}
          />
          <div className="tm-choices">
            {presets.map(([label, base]) => (
              <button key={label} type="button" className="tm-choice" disabled={base === null || base <= 0n} onClick={() => base !== null && setSize(base)}>
                {label}
              </button>
            ))}
            <button type="button" className="tm-choice" aria-pressed={settings.sizeBase === null} onClick={() => setSize(null)}>
              {TERMINAL.settings.sizeReset}
            </button>
          </div>
          {capped ? <p className="tm-field-hint" role="status">{TERMINAL.stack.capped(money(stakeBase))} — {TERMINAL.stack.cappedWhy[capped]}</p> : null}
          <p className="tm-field-hint">{TERMINAL.settings.sizeHint}</p>
        </div>
        <BoostField boostX={settings.boostX} />
        <div className="tm-field">
          <span className="tm-field-head">{TERMINAL.settings.trailing}</span>
          <div className="tm-choices">
            {TRAIL_CHOICES.map((pct) => (
              <button key={pct} type="button" className="tm-choice" aria-pressed={settings.trailPct === pct} onClick={() => (tapFeedback(), setTradeSettings({ trailPct: pct }))}>
                {trailWords(pct)}%
              </button>
            ))}
          </div>
          <p className="tm-field-hint">{TERMINAL.settings.trailingHint}</p>
        </div>
        <div className="tm-field">
          <span className="tm-field-head">{TERMINAL.settings.tolerance}</span>
          <div className="tm-choices">
            {CLOSE_TOLERANCE_CHOICES_BPS.map((bps) => (
              <button key={bps} type="button" className="tm-choice" aria-pressed={settings.closeToleranceBps === bps} onClick={() => (tapFeedback(), setTradeSettings({ closeToleranceBps: bps }))}>
                {(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%
              </button>
            ))}
          </div>
          <p className="tm-field-hint">{TERMINAL.settings.toleranceHint}</p>
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}

/**
 * Boost (RV-41: Tradash's leverage, as Mitoshi's): Off or a multiple up to the reserve's own maximum, read live; the
 * knock-out and the passkey prompt said where it is chosen (Q-032's default). Hidden where no reserve is deployed.
 */
function BoostField({ boostX }: { boostX: number }) {
  const reserve = useReadingQuery([...boostKeys.all, "reserve"], getLeverageReserveState, { pollMs: 30_000 });
  const state = reserve?.ok ? reserve.value : null;
  if (!state) return null;
  const max = Math.max(1, Math.floor(state.params.maxLeverageBps / 10_000));
  const choices = Array.from({ length: max }, (_, k) => k + 1);
  return (
    <div className="tm-field">
      <span className="tm-field-head">{TERMINAL.settings.boost}</span>
      <div className="tm-choices">
        {choices.map((x) => (
          <button key={x} type="button" className="tm-choice" aria-pressed={Math.min(boostX, max) === x} onClick={() => (tapFeedback(), setTradeSettings({ boostX: x }))}>
            {x === 1 ? TERMINAL.settings.boostOff : `${x}×`}
          </button>
        ))}
      </div>
      <p className="tm-field-hint">{boostX > 1 ? TERMINAL.settings.boostOn(Math.min(boostX, max)) : TERMINAL.settings.boostHint}</p>
    </div>
  );
}
