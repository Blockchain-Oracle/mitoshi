"use client";
// Ported in shape from Owarine ecb7565b:web/src/features/terminal/ui/sheets/SettingsSheet.tsx — a right-edge drawer
// (D-190) instead of a bottom sheet, with Mitoshi's rows: Size in dollars (integer base units), the trailing distance
// and the Close tolerance (D-197). Sound & Vibration stays in /settings/account (one app-wide setting).
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { useEffect, useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";
import { money, USD_DECIMALS } from "../format";
import { CLOSE_TOLERANCE_CHOICES_BPS, setTradeSettings, TRAIL_CHOICES, useTradeSettings } from "../settings";
import { trailWords } from "./TradeButtons";

export function SettingsDrawer({ open, onOpenChange, stakeBase, minBase, maxBase }: { open: boolean; onOpenChange: (open: boolean) => void; stakeBase: bigint; minBase: bigint; maxBase: bigint | null }) {
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
          <p className="tm-field-hint">{TERMINAL.settings.sizeHint}</p>
        </div>
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
