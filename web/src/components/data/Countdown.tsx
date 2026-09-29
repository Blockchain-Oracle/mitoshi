"use client";
// Ported from Masayume 68f7a09:web/src/components/data/Countdown.tsx

import { useEffect, useRef, useState } from "react";
import { SETTLING } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { countdown, type Countdown as CountdownState } from "@cwf/core/lifecycle";
import { formatClock } from "@cwf/core/units";
import { useNowMs } from "./useNowMs";

const ANNOUNCE_AT_SEC = 60;
const ANNOUNCE_MINUTE = "One minute left";
const PLACEHOLDER = "–:––";

interface CountdownProps {
  expirySec: number;
  intervalSec: number;
  /** Chain-corrected clock from the port; omit to tick locally (fixtures). */
  nowMs?: number;
  /** Screen readers hear the 60 s mark and settlement once — never every tick. */
  announce?: boolean;
  className?: string;
}

function useCountdownAnnouncement(state: CountdownState | null, enabled: boolean): string {
  const [text, setText] = useState("");
  const said = useRef({ minute: false, settle: false });
  useEffect(() => {
    if (!enabled || !state) return;
    if (state.settling && !said.current.settle) {
      said.current.settle = true;
      setText(SETTLING);
    } else if (!state.settling && state.remainingSec <= ANNOUNCE_AT_SEC && !said.current.minute) {
      said.current.minute = true;
      setText(ANNOUNCE_MINUTE);
    }
  }, [state, enabled]);
  return text;
}

export function Countdown({ expirySec, intervalSec, nowMs, announce = false, className }: CountdownProps) {
  const now = useNowMs(nowMs);
  const state = now > 0 ? countdown(now, expirySec, intervalSec) : null;
  const announcement = useCountdownAnnouncement(state, announce);

  return (
    <span role="timer" className={cn("numbers", state?.urgent && "text-accent", className)}>
      {state ? (state.settling ? SETTLING : formatClock(state.remainingSec)) : PLACEHOLDER}
      {announce && (
        <span className="sr-only" aria-live="polite">
          {announcement}
        </span>
      )}
    </span>
  );
}
