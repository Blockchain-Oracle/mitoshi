"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/DeskInputs.tsx `RiskModePicker` (R4-6, D-227) — three modes
// as `.desk-modes` radios (Guarded 1 open · ≤ 70¢, Balanced 1 open · ≤ 85¢, Active 2 open · any), plus Custom, which
// reveals the two inputs; a mode writes the draft's open Windows and price cap, which go on chain in the envelope.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { STUDIO as T } from "./studio-copy";
import { RISK_MODES, riskModeOf, type Draft, type RiskMode } from "./studio-draft";
import "./desk.css";

const ORDER: readonly RiskMode[] = ["guarded", "balanced", "active", "custom"];

export function RiskModePicker({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  // Custom stays Custom while its inputs are edited, even when the typed values happen to equal a preset's (they'd
  // otherwise vanish mid-edit); a preset tap leaves it.
  const [custom, setCustom] = useState(() => riskModeOf(draft) === "custom");
  const mode: RiskMode = custom ? "custom" : riskModeOf(draft);
  const pick = (m: RiskMode) => {
    setCustom(m === "custom");
    if (m === "custom") {
      if (mode !== "custom") set({ openText: "3", priceCentsText: "90" });
    } else set(RISK_MODES[m]);
  };
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="desk-field-label">{T.limits.risk}</div>
        <div className="desk-modes desk-modes--four" role="radiogroup" aria-label={T.limits.risk}>
          {ORDER.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => pick(m)} className={cn("desk-mode", mode === m && "desk-mode--on")}>
              <span className={cn("desk-mode-label", mode === m ? "text-ink" : "text-ink/60")}>{T.limits.modes[m][0]}</span>
              <span className="desk-mode-detail">{T.limits.modes[m][1]}</span>
            </button>
          ))}
        </div>
      </div>
      {mode === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="block"><span className="desk-field-label">{T.limits.open}</span><input inputMode="numeric" className="strat-input text-ink" value={draft.openText} onChange={(e) => set({ openText: e.target.value })} /></label>
          <label className="block"><span className="desk-field-label">{T.limits.price}</span><input inputMode="numeric" className="strat-input text-ink" value={draft.priceCentsText} placeholder="—" onChange={(e) => set({ priceCentsText: e.target.value })} /></label>
        </div>
      )}
    </div>
  );
}
