"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/StudioForm.tsx (R4-6, D-227) — the studio's editable panels on
// Mitoshi's `Draft`: 01 the name, another portrait and the four approaches (2-up even at 320); 02 the approach's fields,
// the market, the two spend limits and the risk mode; 04 who runs it, the fee, the ERC-8004 identity and the
// description (prefilled from describeSpec). Step 03, the test read, is CreatorStudio's own.
import { PRESETS, type PresetKey } from "@cwf/core";
import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { SeriesWire } from "./protocol";
import { RiskModePicker } from "./RiskModePicker";
import { StudioAgentFields } from "./StudioAgentFields";
import { StudioMirrorFields } from "./StudioMirrorFields";
import { STUDIO as T } from "./studio-copy";
import { DESCRIPTION_MAX, NAME_MAX, type Draft } from "./studio-draft";
import "./strategies.css";
import "./builder.css";

const ORDER: readonly PresetKey[] = ["momentum", "reversion", "agent", "mirror"];
const THRESHOLDS = [10, 20, 50, 100] as const;

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="block">
      <label htmlFor={htmlFor} className="desk-field-label">{label}</label>
      {children}
    </div>
  );
}

interface StudioFormProps {
  step: 1 | 2 | 4;
  draft: Draft;
  set: (patch: Partial<Draft>) => void;
  series: readonly SeriesWire[];
  houseRunner: string | null;
  onReroll: () => void;
}

export function StudioForm({ step, draft, set, series, houseRunner, onReroll }: StudioFormProps) {
  if (step === 1) return (
    <div className="flex flex-col gap-5">
      <Field label={T.name} htmlFor="studio-name">
        <input id="studio-name" value={draft.name} maxLength={NAME_MAX} onChange={(e) => set({ name: e.target.value })} placeholder={T.namePlaceholder} className="strat-input text-ink" />
      </Field>
      <div>
        <div className="desk-field-label">{T.approach}</div>
        <div className="agent-choices" role="radiogroup" aria-label={T.approach}>
          {ORDER.map((p) => (
            <button key={p} type="button" role="radio" aria-checked={draft.preset === p} onClick={() => set({ preset: p })} className={cn("strat-choice group", draft.preset === p && "strat-choice--on")}>
              <span className="strat-choice-title text-ink">{PRESETS[p].name}</span>
              <span className="strat-choice-body block">{T.approaches[p]}</span>
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="strat-sensei self-start" onClick={onReroll}>{T.reroll}</button>
    </div>
  );

  if (step === 2) {
    const asset = series.find((s) => s.seriesId === draft.seriesId)?.symbol ?? "the asset";
    return (
      <div className="flex flex-col gap-6">
        {draft.preset === "agent" ? (
          <StudioAgentFields draft={draft} set={set} asset={asset} />
        ) : draft.preset === "mirror" ? (
          <StudioMirrorFields draft={draft} set={set} />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="desk-field-label">{T.tune.threshold}</div>
            <div className="flex flex-wrap gap-2">
              {THRESHOLDS.map((bps) => (
                <button key={bps} type="button" aria-pressed={draft.thresholdBps === bps} onClick={() => set({ thresholdBps: bps })} className={cn("strat-chip", draft.thresholdBps === bps && "strat-chip--on")}>{bps / 100}%</button>
              ))}
            </div>
            <details>
              <summary className="strat-meta cursor-pointer text-ink-muted">{T.tune.more}</summary>
              <label className="mt-3 block" htmlFor="studio-lookback">
                <span className="desk-field-label">{T.tune.lookback}</span>
                <input id="studio-lookback" inputMode="numeric" className="strat-input text-ink" value={String(draft.lookback)} onChange={(e) => /^\d{0,2}$/.test(e.target.value) && set({ lookback: Number(e.target.value || 0) })} />
              </label>
            </details>
          </div>
        )}
        <Field label={T.tune.market} htmlFor="studio-series">
          <select id="studio-series" value={draft.seriesId} onChange={(e) => set({ seriesId: e.target.value })} className="strat-input min-h-touch text-ink">
            <option value="">{T.tune.anyWindow}</option>
            {series.map((s) => <option key={s.seriesId} value={s.seriesId}>{s.label}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-5">
          <Field label={T.limits.perTrade} htmlFor="studio-per-trade"><input id="studio-per-trade" inputMode="decimal" className="strat-input text-ink" value={draft.perTradeText} onChange={(e) => set({ perTradeText: e.target.value })} /></Field>
          <Field label={T.limits.daily} htmlFor="studio-daily"><input id="studio-daily" inputMode="decimal" className="strat-input text-ink" value={draft.dailyText} onChange={(e) => set({ dailyText: e.target.value })} /></Field>
        </div>
        <RiskModePicker draft={draft} set={set} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="desk-field-label">{T.publish.runner}</div>
        <div className="agent-choices" role="radiogroup" aria-label={T.publish.runner}>
          {(["house", "own"] as const).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={draft.runner === r} disabled={r === "house" && !houseRunner} onClick={() => set({ runner: r })} className={cn("strat-choice group", draft.runner === r && "strat-choice--on", r === "house" && !houseRunner && "strat-choice--off")}>
              <span className="strat-choice-title text-ink">{T.publish[r][0]}</span>
              <span className="strat-choice-body block">{T.publish[r][1]}</span>
            </button>
          ))}
        </div>
        {draft.runner === "own" && (
          <label className="mt-3 block" htmlFor="studio-own-runner">
            <span className="desk-field-label">{T.publish.ownRunner}</span>
            <input id="studio-own-runner" value={draft.ownRunner} placeholder="0x…" spellCheck={false} onChange={(e) => set({ ownRunner: e.target.value })} className="strat-input font-mono text-ink" />
          </label>
        )}
      </div>
      <Field label={T.publish.fee} htmlFor="studio-fee"><input id="studio-fee" inputMode="decimal" className="strat-input text-ink" value={draft.feeText} onChange={(e) => set({ feeText: e.target.value })} /></Field>
      <label className="flex min-h-touch items-center justify-between gap-4">
        <span className="desk-field-label mb-0">{T.publish.identity}</span>
        <Switch checked={draft.identity} onCheckedChange={(identity) => set({ identity })} />
      </label>
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="studio-description" className="desk-field-label mb-0">{T.publish.description}</label>
          <span className="strat-mono-10 tabular-nums text-ink/40">{T.tune.count(draft.description.length, DESCRIPTION_MAX)}</span>
        </div>
        <textarea id="studio-description" rows={3} maxLength={DESCRIPTION_MAX} value={draft.description} onChange={(e) => set({ description: e.target.value })} className="strat-input strat-textarea text-ink" />
      </div>
    </div>
  );
}
