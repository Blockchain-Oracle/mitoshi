"use client";
// Ported from Masayume 68f7a09:web/src/features/markets/hero/HeroSettlesIn.tsx — the clock, flipping vermilion as it
// runs out (urgency scales with the cadence). A leaf: it reads the shared clock itself (ux-audit fix 12). Before a
// Listed Window's bell it counts to the open instead.
import { countdown } from "@cwf/core/lifecycle";
import { Countdown } from "@/components/data";
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
      <Countdown expirySec={target} intervalSec={intervalSec} nowMs={nowMs} announce={!beforeOpen} className="mh-settles-value" />
    </div>
  );
}
