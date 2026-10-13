"use client";
/**
 * The aim (R4-5, D-227; Ported from Owarine 90a91d71:web/src/features/games/moonshot/AimControl.tsx): one radiogroup
 * over MOONSHOT_AIM_LADDER — the sign is the side, the distance the reach. Arrow keys climb and descend it, Home/End
 * jump to the ends, a flip cue plays only when the side crosses (a step within a side is the tap's own click), and the
 * aim is remembered on this device (default long ×5). On a phone it is a 2 × 5 pad (long ×2…×25 over short ×2…×25);
 * from 768 Owarine's ladder with the ×N readout beside it.
 */
import { MOONSHOT_AIM_LADDER, aimToCall, callToAim, type MoonshotAim, type MoonshotCall } from "@cwf/core/range";
import { useCallback, type KeyboardEvent } from "react";
import { tapFeedback, tradeFeedback } from "@/lib/feedback";
import { usePersistedState } from "@/lib/persisted";
import { cn } from "@/lib/utils";
import { MOONSHOT } from "./copy";

const AIM_KEY = "cwf:moonshot:aim";
const DEFAULT_AIM: MoonshotAim = 5;
const LAST = MOONSHOT_AIM_LADDER.length - 1;
const LONG_RUNGS = MOONSHOT_AIM_LADDER.filter((a) => a > 0);
const SHORT_RUNGS = MOONSHOT_AIM_LADDER.filter((a) => a < 0).reverse();
const aimCodec = {
  parse: (raw: string): MoonshotAim | null => ((MOONSHOT_AIM_LADDER as readonly number[]).includes(Number(raw)) ? (Number(raw) as MoonshotAim) : null),
  serialize: (aim: MoonshotAim) => String(aim),
};

/** The call, remembered on this device; the default until storage has been read, so server and client agree. */
export function useRememberedCall(): [MoonshotCall, (call: MoonshotCall) => void] {
  const [aim, setAim] = usePersistedState<MoonshotAim>(AIM_KEY, DEFAULT_AIM, aimCodec);
  const setCall = useCallback((call: MoonshotCall) => setAim(callToAim(call)), [setAim]);
  return [aimToCall(aim), setCall];
}

export function AimPad({ call, onCall, disabled }: { call: MoonshotCall; onCall: (call: MoonshotCall) => void; disabled?: boolean }) {
  const words = MOONSHOT.aim;
  const aim = callToAim(call);
  const index = MOONSHOT_AIM_LADDER.indexOf(aim);
  const set = useCallback(
    (next: number) => {
      const nextAim = MOONSHOT_AIM_LADDER[Math.max(0, Math.min(LAST, next))];
      if (nextAim === undefined || nextAim === aim) return;
      if (nextAim > 0 !== aim > 0) tradeFeedback("open", "move");
      else tapFeedback();
      onCall(aimToCall(nextAim));
    },
    [aim, onCall],
  );
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") set(index + 1);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") set(index - 1);
    else if (e.key === "Home") set(LAST);
    else if (e.key === "End") set(0);
    else return;
    e.preventDefault();
  };
  const rung = (value: MoonshotAim) => {
    const long = value > 0;
    return (
      <button
        key={value}
        type="button"
        role="radio"
        aria-checked={value === aim}
        aria-label={words.valueText(long ? "long" : "short", Math.abs(value))}
        tabIndex={value === aim ? 0 : -1}
        disabled={disabled}
        onClick={() => set(MOONSHOT_AIM_LADDER.indexOf(value))}
        className={cn("ms-rung numbers", long ? "is-long" : "is-short")}
      >
        {words.rung(Math.abs(value))}
      </button>
    );
  };
  return (
    <div className="ms-aim">
      <div className="ms-pad" role="radiogroup" aria-label={words.ladder} onKeyDown={onKeyDown}>
        <span className="ms-side" aria-hidden>▲ {words.long}</span>
        {LONG_RUNGS.map(rung)}
        <span className="ms-side" aria-hidden>▼ {words.short}</span>
        {SHORT_RUNGS.map(rung)}
      </div>
      <div className="ms-readout">
        <strong className={cn("numbers", call.direction === "long" ? "text-up" : "text-down")}>{words.rung(call.multiple)}</strong>
        <p className="ms-hint">{words.hint}</p>
      </div>
    </div>
  );
}
