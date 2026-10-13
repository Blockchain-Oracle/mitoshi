"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/StudioMirrorFields.tsx (R4-6, D-227) — whose calls (a Tempo
// address, prefilled from a profile's "Copy this trader") and how fresh one must be, as chips; one line on the caveat.
import { isAddress } from "viem";
import { cn } from "@/lib/utils";
import { STUDIO as T } from "./studio-copy";
import type { Draft } from "./studio-draft";

const WITHIN = [30, 60, 120, 300] as const;
const label = (sec: number) => (sec < 60 ? `${sec}s` : `${sec / 60}m`);

export function StudioMirrorFields({ draft, set }: { draft: Draft; set: (patch: Partial<Draft>) => void }) {
  const trader = draft.trader.trim();
  const bad = trader.length > 0 && !isAddress(trader);
  return (
    <div className="flex flex-col gap-5">
      <label className="desk-field-label block" htmlFor="mirror-trader">
        {T.tune.trader}
        <input id="mirror-trader" value={draft.trader} spellCheck={false} autoComplete="off" onChange={(e) => set({ trader: e.target.value.trim() })} placeholder={T.tune.traderPlaceholder} className={cn("strat-input mt-2 font-mono text-ink", bad && "copy-field-bad")} aria-invalid={bad || undefined} />
      </label>
      <div>
        <div className="desk-field-label">{T.tune.within}</div>
        <div className="flex flex-wrap gap-2">
          {WITHIN.map((sec) => (
            <button key={sec} type="button" aria-pressed={draft.withinSec === sec} onClick={() => set({ withinSec: sec })} className={cn("strat-chip", draft.withinSec === sec && "strat-chip--on")}>{label(sec)}</button>
          ))}
        </div>
      </div>
      <p className="strat-choice-body mt-0">{T.tune.lands}</p>
    </div>
  );
}
