"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/hero/HeroSettlesIn.tsx — the clock, flipping vermilion as it
// runs out (urgency scales with the cadence). A leaf: it reads the shared clock itself (ux-audit fix 12). Before a
// Listed Window's bell it counts to the open instead.
import { SETTLING } from "@cwf/core/copy";
import { countdown } from "@cwf/core/lifecycle";
import { formatClock } from "@cwf/core/units";
import { useEffect, useRef, useState } from "react";
import { RollingClock } from "@/components/ui/rolling-clock";
import { useNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { HERO_HEAD } from "../copy";

export function HeroSettlesIn({ tradingStartSec, expirySec, intervalSec }: { tradingStartSec: number; expirySec: number; intervalSec: number }) {
  const nowMs = useNowMs();
  const beforeOpen = nowMs > 0 && nowMs < tradingStartSec * 1000;
  const target = beforeOpen ? tradingStartSec : expirySec;
  const state = nowMs > 0 ? countdown(nowMs, target, intervalSec) : null;
  return (
    <div className={cn("mh-settles", !beforeOpen && state?.urgent && "urgent")}>
      <span className="mh-settles-label">{beforeOpen ? HERO_HEAD.opensIn : HERO_HEAD.settlesIn}</span>
      <RollingClock text={state ? (state.settling ? SETTLING : formatClock(state.remainingSec)) : "–:––"} className="mh-settles-value" />
      {!beforeOpen ? <MinuteAnnouncer remainingSec={state?.remainingSec ?? null} settling={state?.settling ?? false} /> : null}
    </div>
  );
}

/** One polite announcement at a minute left and one at settling — never every tick (Masayume `Countdown`). */
function MinuteAnnouncer({ remainingSec, settling }: { remainingSec: number | null; settling: boolean }) {
  const [text, setText] = useState("");
  const said = useRef({ minute: false, settle: false });
  useEffect(() => {
    if (remainingSec === null) return;
    if (settling && !said.current.settle) {
      said.current.settle = true;
      setText(SETTLING);
    } else if (!settling && remainingSec <= 60 && !said.current.minute) {
      said.current.minute = true;
      setText(HERO_HEAD.minuteLeft);
    }
  }, [remainingSec, settling]);
  return <span className="sr-only" aria-live="polite">{text}</span>;
}
