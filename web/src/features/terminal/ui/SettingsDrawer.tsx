"use client";
// Ported from Owarine 90a91d71:web/src/features/terminal/ui/sheets/SettingsSheet.tsx (P3, D-223) — SIZE (input, slider,
// Min/25/50/Max, reset), PAYOUT tiles, Mitoshi's Boost, TRAILING (slider and chips), the Close tolerance (D-197) and the
// order summary. The engine charges no fee, so Fees reads Free from the quote's own rule.
import { formatBaseUnits, parseDecimalToBaseUnits } from "@cwf/core/units";
import { getLeverageReserveState } from "@cwf/markets/leverage";
import { useReadingQuery } from "@cwf/markets/react";
import { useEffect, useState } from "react";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { boostKeys } from "@/features/boost/useBoostWrites";
import { tapFeedback } from "@/lib/feedback";
import { TERMINAL } from "../copy";
import { money, USD_DECIMALS } from "../format";
import { CLOSE_TOLERANCE_CHOICES_BPS, SCHEDULED_PRICE_CHIPS, setTradeSettings, TRAIL_CHOICES, TRAIL_MAX, TRAIL_MIN, useTradeSettings } from "../settings";
import { TapTradingChip } from "@/features/session";
import { trailWords } from "./TradeButtons";

export function SettingsDrawer({ open, onOpenChange, stakeBase, minBase, maxBase, capped, pays = "—" }: { open: boolean; onOpenChange: (open: boolean) => void; stakeBase: bigint; minBase: bigint; maxBase: bigint | null; capped: keyof typeof TERMINAL.stack.cappedWhy | null; pays?: string }) {
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
  const sliderMax = maxBase !== null && maxBase > minBase ? maxBase : minBase * 20n;
  const [upPays, downPays] = pays.includes("·") ? pays.split("·").map((x) => x.trim()) : [pays, pays];
  const multiple = (x: string | undefined) => Number.parseFloat(x ?? "");
  const paysIfRight = (x: string | undefined) => (Number.isFinite(multiple(x)) ? money(BigInt(Math.round(Number(stakeBase) * multiple(x)))) : "—");
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={TERMINAL.settings.title} fields>
        <div className="tm-sheet">
          <Section title={TERMINAL.settings.size} right={maxBase === null ? TERMINAL.settings.balanceUnavailable : TERMINAL.settings.available(money(maxBase))}>
            <input
              id="tm-size"
              aria-label={TERMINAL.settings.size}
              className="tm-sheet-big"
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => {
                const base = parseDecimalToBaseUnits(text, USD_DECIMALS);
                if (base !== null && base > 0n) setSize(base);
              }}
            />
            <input
              type="range"
              className="tm-sheet-range"
              aria-label={TERMINAL.settings.size}
              min={Number(minBase)}
              max={Number(sliderMax)}
              step={Number(minBase) || 10_000}
              value={Math.min(Number(stakeBase), Number(sliderMax))}
              onChange={(e) => {
                const base = BigInt(e.target.value);
                setText(formatBaseUnits(base, USD_DECIMALS, { group: false, minDp: 0, maxDp: 2 }));
                setTradeSettings({ sizeBase: base.toString() });
              }}
            />
            <div className="tm-sheet-chips">
              {presets.map(([label, base]) => (
                <button key={label} type="button" className="tm-sheet-chip" data-on={base !== null && base === stakeBase ? "" : undefined} disabled={base === null || base <= 0n} onClick={() => base !== null && setSize(base)}>
                  {label}
                </button>
              ))}
            </div>
            {settings.sizeBase !== null ? (
              <button type="button" className="tm-sheet-link" onClick={() => setSize(null)}>{TERMINAL.settings.sizeReset}</button>
            ) : null}
            {capped ? <p className="tm-field-hint" role="status">{TERMINAL.stack.capped(money(stakeBase))} — {TERMINAL.stack.cappedWhy[capped]}</p> : null}
          </Section>
          <Section title={TERMINAL.settings.payout} right={TERMINAL.settings.payoutRight}>
            <div className="tm-sheet-tiles">
              <div className="tm-up-soft tm-sheet-tile"><span>{TERMINAL.settings.upPays}</span><b>{upPays}</b></div>
              <div className="tm-down-soft tm-sheet-tile"><span>{TERMINAL.settings.downPays}</span><b>{downPays}</b></div>
            </div>
          </Section>
          <BoostField boostX={settings.boostX} />
          <Section title={TERMINAL.settings.trailing} right={TERMINAL.settings.behindPrice}>
            <p className="tm-sheet-big">{trailWords(settings.trailPct)}%</p>
            <input type="range" className="tm-sheet-range" aria-label={TERMINAL.settings.trailing} min={TRAIL_MIN * 100} max={TRAIL_MAX * 100} step={0.1} value={settings.trailPct * 100} onChange={(e) => setTradeSettings({ trailPct: Math.min(TRAIL_MAX, Math.max(TRAIL_MIN, Number(e.target.value) / 100)) })} />
            <div className="tm-sheet-chips">
              {TRAIL_CHOICES.map((pct) => (
                <button key={pct} type="button" className="tm-sheet-chip" data-on={settings.trailPct === pct ? "" : undefined} onClick={() => (tapFeedback(), setTradeSettings({ trailPct: pct }))}>
                  {trailWords(pct)}%
                </button>
              ))}
            </div>
          </Section>
          {/* R4-3 (D-227): one-tap lives here (Owarine: each action carries its own consent — no card above UP/DOWN). */}
          <Section title={TERMINAL.settings.oneTap} right={TERMINAL.settings.oneTapRight}>
            <TapTradingChip className="tm-choice tm-arm-cta" offLabel={TERMINAL.arm.cta} />
          </Section>
          <Section title={TERMINAL.settings.scheduledPrice} right={TERMINAL.settings.scheduledRight}>
            <div className="tm-sheet-chips">
              {SCHEDULED_PRICE_CHIPS.map((c) => (
                <button key={c} type="button" className="tm-sheet-chip" data-on={settings.scheduledCents === c ? "" : undefined} onClick={() => (tapFeedback(), setTradeSettings({ scheduledCents: c }))}>
                  {c}¢
                </button>
              ))}
            </div>
          </Section>
          <Section title={TERMINAL.settings.tolerance}>
            <div className="tm-sheet-chips">
              {CLOSE_TOLERANCE_CHOICES_BPS.map((bps) => (
                <button key={bps} type="button" className="tm-sheet-chip" data-on={settings.closeToleranceBps === bps ? "" : undefined} onClick={() => (tapFeedback(), setTradeSettings({ closeToleranceBps: bps }))}>
                  {(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%
                </button>
              ))}
            </div>
          </Section>
          <dl className="tm-sheet-summary">
            <dt>{TERMINAL.settings.stake}</dt><dd>{money(stakeBase)}</dd>
            <dt>{TERMINAL.settings.paysIfRight}</dt><dd>{paysIfRight(upPays)} up · {paysIfRight(downPays)} down</dd>
            <dt>{TERMINAL.settings.fees}</dt><dd>{TERMINAL.stack.free}</dd>
          </dl>
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}

/** One of Owarine 90a91d71 SettingsSheet's sections: the title in caps, what it is read against on the right. */
function Section({ title, right, children }: { title: string; right?: string; children: React.ReactNode }) {
  return (
    <section className="tm-sheet-section">
      <div className="tm-sheet-head">
        <span>{title}</span>
        {right ? <span className="tm-sheet-right">{right}</span> : null}
      </div>
      {children}
    </section>
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
