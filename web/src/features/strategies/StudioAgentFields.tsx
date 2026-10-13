"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/StudioAgentFields.tsx (R4-6, D-227) — an agent's step 02: the
// brief with its counter, the gate posture as `.desk-modes` radios with each posture's real rule (core POSTURES), and
// the Window lengths it reads as chips; "In plain words" is describeSpec over the draft.
import { AGENT_CADENCES_SEC, AGENT_PERSONA_MAX_CHARS, AGENT_POSTURES, describeSpec, formatCadence, POSTURES } from "@cwf/core";
import { cn } from "@/lib/utils";
import { STUDIO as T } from "./studio-copy";
import { specOf, type Draft } from "./studio-draft";
import "./desk.css";

const toggle = (list: number[], c: number) => {
  const next = list.includes(c) ? list.filter((x) => x !== c) : [...list, c];
  return next.length === 0 ? list : next.sort((a, b) => a - b);
};

export function StudioAgentFields({ draft, set, asset }: { draft: Draft; set: (patch: Partial<Draft>) => void; asset: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="studio-persona" className="desk-field-label mb-0">{T.tune.persona}</label>
          <span className={cn("strat-mono-10 tabular-nums", draft.persona.length >= AGENT_PERSONA_MAX_CHARS ? "text-accent" : "text-ink/40")}>{T.tune.count(draft.persona.length, AGENT_PERSONA_MAX_CHARS)}</span>
        </div>
        <textarea id="studio-persona" value={draft.persona} maxLength={AGENT_PERSONA_MAX_CHARS} rows={5} placeholder={T.tune.personaPlaceholder} onChange={(e) => set({ persona: e.target.value.slice(0, AGENT_PERSONA_MAX_CHARS) })} className="strat-input strat-textarea text-ink" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <div className="desk-field-label">{T.tune.posture}</div>
          <div className="desk-modes" role="radiogroup" aria-label={T.tune.posture}>
            {AGENT_POSTURES.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={draft.posture === p} onClick={() => set({ posture: p })} className={cn("desk-mode", draft.posture === p && "desk-mode--on")}>
                <span className={cn("desk-mode-label capitalize", draft.posture === p ? "text-ink" : "text-ink/60")}>{p}</span>
                <span className="desk-mode-detail">{T.tune.postureDetail(Math.round(POSTURES[p].minConfidence * 100), POSTURES[p].maxPriceCents)}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="desk-field-label">{T.tune.cadences}</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={T.tune.cadences}>
            {AGENT_CADENCES_SEC.map((c) => (
              <button key={c} type="button" aria-pressed={draft.cadences.includes(c)} onClick={() => set({ cadences: toggle(draft.cadences, c) })} className={cn("strat-chip", draft.cadences.includes(c) && "strat-chip--on")}>{formatCadence(c)}</button>
            ))}
          </div>
        </div>
      </div>
      {draft.persona.trim() && <p className="strat-choice-body mt-0">{describeSpec(specOf(draft), asset)}</p>}
    </div>
  );
}
