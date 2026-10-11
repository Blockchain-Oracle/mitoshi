"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/{StudioForm,StudioAgentFields,StudioMirrorFields}.tsx —
// the builder's first three steps on Mitoshi's inputs: the instinct (Masayume's presets + Agari's mirror), its knobs and
// the market it trades, and the hard limits every copier's grant must fit inside.
import { AGENT_CADENCES_SEC, AGENT_PERSONA_MAX_CHARS, formatCadence, PRESETS, type AgentPosture, type PresetKey } from "@cwf/core";
import { Bot, Repeat2, TrendingUp, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";
import { STUDIO as T } from "./studio-copy";
import type { Draft } from "./studio-draft";
import type { SeriesWire } from "./protocol";

type Set = (patch: Partial<Draft>) => void;
const ICON: Record<PresetKey, typeof Bot> = { momentum: TrendingUp, reversion: Repeat2, agent: Bot, mirror: UserRound };
const ORDER: readonly PresetKey[] = ["momentum", "reversion", "agent", "mirror"];

export function Labelled({ id, label, help, children }: { id: string; label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="type-body-strong text-ink">{label}</label>
      {children}
      {help ? <span className="type-caption text-ink-secondary">{help}</span> : null}
    </div>
  );
}

export function InstinctStep({ draft, set }: { draft: Draft; set: Set }) {
  return (
    <div role="radiogroup" aria-label={T.instinct.label} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {ORDER.map((key) => {
        const Icon = ICON[key];
        const on = draft.preset === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set({ preset: key })}
            className={cn("flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors", on ? "border-ink bg-surface-2" : "border-hairline hover:border-ink-muted")}
          >
            <span className="inline-flex items-center gap-2 type-body-strong text-ink">
              <Icon aria-hidden className="size-4" />
              {PRESETS[key].name}
            </span>
            <span className="type-caption text-ink-secondary">{PRESETS[key].how}</span>
          </button>
        );
      })}
    </div>
  );
}

function SeriesPicker({ draft, set, series }: { draft: Draft; set: Set; series: readonly SeriesWire[] }) {
  return (
    <Labelled id="studio-series" label={T.tune.market} help={T.tune.marketHelp}>
      <select id="studio-series" value={draft.seriesId} onChange={(e) => set({ seriesId: e.target.value })} className="min-h-touch rounded-md border border-input bg-ground px-3 type-body text-ink">
        <option value="">{T.tune.anyWindow}</option>
        {series.map((s) => (
          <option key={s.seriesId} value={s.seriesId}>{s.label}</option>
        ))}
      </select>
    </Labelled>
  );
}

const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) && v.trim() !== "" ? Math.trunc(Number(v)) : fallback);

export function TuneStep({ draft, set, series }: { draft: Draft; set: Set; series: readonly SeriesWire[] }) {
  return (
    <div className="flex flex-col gap-4">
      {draft.preset === "agent" ? (
        <>
          <Labelled id="studio-persona" label={T.tune.persona} help={`${draft.persona.length}/${AGENT_PERSONA_MAX_CHARS} · ${T.tune.personaHelp}`}>
            <textarea id="studio-persona" value={draft.persona} maxLength={AGENT_PERSONA_MAX_CHARS} rows={4} onChange={(e) => set({ persona: e.target.value })} className="rounded-md border border-input bg-ground px-3 py-2 type-body text-ink" />
          </Labelled>
          <SegmentedControl<AgentPosture> label={T.tune.posture} options={T.tune.postures} value={draft.posture} onValueChange={(posture) => set({ posture })} />
          <fieldset className="flex flex-col gap-2">
            <legend className="type-body-strong text-ink">{T.tune.cadences}</legend>
            <div className="flex flex-wrap gap-2">
              {AGENT_CADENCES_SEC.map((c) => {
                const on = draft.cadences.includes(c);
                return (
                  <button key={c} type="button" aria-pressed={on} onClick={() => set({ cadences: on ? draft.cadences.filter((x) => x !== c) : [...draft.cadences, c] })} className={cn("min-h-touch rounded-full border px-4 type-body-strong", on ? "border-ink bg-surface-2 text-ink" : "border-hairline text-ink-secondary")}>
                    {formatCadence(c)}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </>
      ) : draft.preset === "mirror" ? (
        <>
          <Labelled id="studio-trader" label={T.tune.trader} help={T.tune.traderHelp}>
            <Input id="studio-trader" value={draft.trader} placeholder="0x…" autoComplete="off" spellCheck={false} onChange={(e) => set({ trader: e.target.value })} className="min-h-touch font-mono" />
          </Labelled>
          <Labelled id="studio-within" label={T.tune.within} help={T.tune.withinHelp}>
            <Input id="studio-within" inputMode="numeric" value={String(draft.withinSec)} onChange={(e) => set({ withinSec: num(e.target.value, draft.withinSec) })} className="min-h-touch tabular-nums" />
          </Labelled>
          <p className="type-caption text-ink-secondary">{T.tune.mirrorCaveat}</p>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Labelled id="studio-threshold" label={T.tune.threshold} help={T.tune.thresholdHelp(draft.thresholdBps)}>
            <Input id="studio-threshold" inputMode="numeric" value={String(draft.thresholdBps)} onChange={(e) => set({ thresholdBps: num(e.target.value, draft.thresholdBps) })} className="min-h-touch tabular-nums" />
          </Labelled>
          <Labelled id="studio-lookback" label={T.tune.lookback} help={T.tune.lookbackHelp}>
            <Input id="studio-lookback" inputMode="numeric" value={String(draft.lookback)} onChange={(e) => set({ lookback: num(e.target.value, draft.lookback) })} className="min-h-touch tabular-nums" />
          </Labelled>
        </div>
      )}
      <SeriesPicker draft={draft} set={set} series={series} />
    </div>
  );
}

export function LimitsStep({ draft, set }: { draft: Draft; set: Set }) {
  const field = (id: keyof Draft, label: string, help: string, prefix: string | null) => (
    <Labelled id={`studio-${id}`} label={label} help={help}>
      <div className="relative">
        {prefix && <span aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 type-body text-ink-secondary">{prefix}</span>}
        <Input id={`studio-${id}`} inputMode="decimal" value={draft[id] as string} onChange={(e) => set({ [id]: e.target.value } as Partial<Draft>)} className={cn("min-h-touch tabular-nums", prefix && "pl-7")} />
      </div>
    </Labelled>
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="type-body text-ink-secondary">{T.limits.lead}</p>
      <div className="grid grid-cols-2 gap-3">
        {field("perTradeText", T.limits.perTrade, T.limits.perTradeHelp, "$")}
        {field("dailyText", T.limits.daily, T.limits.dailyHelp, "$")}
        {field("openText", T.limits.open, T.limits.openHelp, null)}
        {field("priceCentsText", T.limits.price, T.limits.priceHelp, "¢")}
      </div>
      {field("feeText", T.limits.fee, T.limits.feeHelp, "$")}
    </div>
  );
}
