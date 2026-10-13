"use client";
/**
 * The aim (R4-5, D-227; Ported from Owarine 90a91d71:web/src/features/games/moonshot/AimControl.tsx): one radiogroup
 * over MOONSHOT_AIM_LADDER — the sign is the side, the distance the reach. Home/End jump to the ends, a flip cue plays
 * only when the side crosses (a step within a side is the tap's own click), and the aim is remembered on this device
 * (default long ×5). On a phone it is a 2 × 5 pad (long ×2…×25 over short ×2…×25); from 768 Owarine's ladder (deepest
 * long at the top, deepest short at the floor) with the ×N readout, the side and the step buttons beside it.
 * R4-5 review (D-227): the arrow keys follow the layout on screen — on the ladder Up/Right climb and Down/Left descend
 * (Owarine's); on the pad Right/Left reach further/nearer along the row and Up/Down cross to long/short at the same
 * reach (the short row runs ×2→×25 left to right, so a ladder step there moved the pick the other way) — and focus
 * follows the pick, as a radiogroup's does.
 */
import { MOONSHOT_AIM_LADDER, aimToCall, callToAim, type MoonshotAim, type MoonshotCall } from "@cwf/core/range";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useRef, type KeyboardEvent } from "react";
import { tapFeedback, tradeFeedback } from "@/lib/feedback";
import { usePersistedState } from "@/lib/persisted";
import { cn } from "@/lib/utils";
import { MOONSHOT } from "./copy";

const AIM_KEY = "cwf:moonshot:aim";
const DEFAULT_AIM: MoonshotAim = 5;
const LAST = MOONSHOT_AIM_LADDER.length - 1;
const LONG_RUNGS = MOONSHOT_AIM_LADDER.filter((a) => a > 0);
const SHORT_RUNGS = MOONSHOT_AIM_LADDER.filter((a) => a < 0).reverse();
/** Where the pad becomes the ladder (range.css `.ms-pad` at 768). */
const LADDER_QUERY = "(min-width: 48rem)";
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

/** The rung an arrow key lands on, by the layout on screen; undefined where the key has nowhere to go. */
function keyTarget(key: string, aim: MoonshotAim, ladder: boolean): MoonshotAim | undefined {
  const index = MOONSHOT_AIM_LADDER.indexOf(aim);
  const at = (i: number) => MOONSHOT_AIM_LADDER[Math.max(0, Math.min(LAST, i))];
  if (key === "Home") return at(LAST);
  if (key === "End") return at(0);
  if (ladder) return key === "ArrowUp" || key === "ArrowRight" ? at(index + 1) : key === "ArrowDown" || key === "ArrowLeft" ? at(index - 1) : undefined;
  const long = aim > 0;
  const reach = Math.abs(aim);
  if (key === "ArrowUp") return reach as MoonshotAim;
  if (key === "ArrowDown") return -reach as MoonshotAim;
  if (key !== "ArrowRight" && key !== "ArrowLeft") return undefined;
  const further = key === "ArrowRight";
  const next = at(index + (long === further ? 1 : -1));
  return next !== undefined && next > 0 === long ? next : aim;
}

export function AimPad({ call, onCall, disabled }: { call: MoonshotCall; onCall: (call: MoonshotCall) => void; disabled?: boolean }) {
  const words = MOONSHOT.aim;
  const aim = callToAim(call);
  const index = MOONSHOT_AIM_LADDER.indexOf(aim);
  const group = useRef<HTMLDivElement>(null);
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
    const target = keyTarget(e.key, aim, window.matchMedia(LADDER_QUERY).matches);
    if (target === undefined) return;
    e.preventDefault();
    set(MOONSHOT_AIM_LADDER.indexOf(target));
    group.current?.querySelector<HTMLElement>(`[data-aim="${target}"]`)?.focus();
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
        data-aim={value}
        onClick={() => set(MOONSHOT_AIM_LADDER.indexOf(value))}
        className={cn("ms-rung numbers", long ? "is-long" : "is-short")}
      >
        {words.rung(Math.abs(value))}
      </button>
    );
  };
  const long = call.direction === "long";
  return (
    <div className="ms-aim">
      <div ref={group} className="ms-pad" role="radiogroup" aria-label={words.ladder} onKeyDown={onKeyDown}>
        <span className="ms-side ms-side--long" aria-hidden>▲ {words.long}</span>
        {LONG_RUNGS.map(rung)}
        <span className="ms-side ms-side--short" aria-hidden>▼ {words.short}</span>
        {SHORT_RUNGS.map(rung)}
      </div>
      <div className="ms-readout" aria-live="polite">
        <strong className={cn("numbers", long ? "text-up" : "text-down")}>{words.rung(call.multiple)}</strong>
        <span className={cn("ms-readout-side", long ? "text-up" : "text-down")}>{long ? words.long : words.short}</span>
        <p className="ms-hint">{words.hint}</p>
        <div className="ms-steps">
          <button type="button" className="ms-step" onClick={() => set(index + 1)} disabled={disabled || index === LAST} aria-label={words.up} title={words.up}>
            <ChevronUp aria-hidden className="size-4" />
          </button>
          <button type="button" className="ms-step" onClick={() => set(index - 1)} disabled={disabled || index === 0} aria-label={words.down} title={words.down}>
            <ChevronDown aria-hidden className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
