"use client";

// Lucky's three reels — asset, side, reach (R4-9, D-227). The cabinet and the 720 / 980 / 1240 ms stagger with
// ascending thunks are Owarine 90a91d71's (web/src/features/games/lucky/LuckyReels.tsx); the reels themselves are one
// continuous strip that decelerates onto the sealed draw (components/ui/slot-reel.tsx — 21st.dev 33159 by way of
// Senryo's machine). The ratchet ticks under the spin; the last reel lands, the pick is held lit a beat, then the deal.
import { LUCKY_ASSETS, LUCKY_MULTIPLIERS } from "@cwf/core/games";
import type { Side } from "@cwf/core";
import { useEffect, useRef, useState } from "react";
import { SlotReel } from "@/components/ui/slot-reel";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { SIDE_WORD } from "@/features/markets/side-styles";
import { useGames } from "../GamesProvider";
import { LUCKY } from "./copy";
import { reelLock, reelPick, reelTick } from "./reel-sfx";

const STOPS_MS: readonly number[] = [720, 980, 1_240];
/** Pips' lock-in: the pick held lit before the machine commits. */
const LOCKIN_MS = 480;
const SIDES: readonly Side[] = ["up", "down"];

export interface ReelTarget {
  asset: string;
  side: Side;
  multiplier: number;
}

export function LuckyReels({ cycling, landing, target, onLanded }: { cycling: boolean; landing: boolean; target: ReelTarget | null; onLanded: () => void }) {
  const { feedback, reducedMotion } = useGames();
  const [spinId, setSpinId] = useState(0);
  const [announce, setAnnounce] = useState("");
  const stopped = useRef(0);
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;

  // A new spin restarts the strips and the count of landed reels.
  useEffect(() => {
    if (!cycling) return;
    stopped.current = 0;
    setAnnounce("");
    setSpinId((n) => n + 1);
  }, [cycling]);

  const live = landing && target !== null;
  const onLand = (index: number) => () => {
    reelLock(index, index === STOPS_MS.length - 1);
    feedback("confirm");
    stopped.current += 1;
    if (stopped.current < STOPS_MS.length || !target) return;
    window.setTimeout(
      () => {
        reelPick();
        setAnnounce(LUCKY.reels.announce(target.asset, SIDE_WORD[target.side], target.multiplier));
        landedRef.current();
      },
      reducedMotion ? 0 : LOCKIN_MS,
    );
  };

  return (
    <div className="lk-reels" role="group" aria-label={LUCKY.title}>
      <SlotReel<string>
        items={LUCKY_ASSETS}
        target={live ? target.asset : null}
        spinId={spinId}
        label={LUCKY.reels.asset}
        stopAfterMs={STOPS_MS[0]!}
        tone="asset"
        onTick={reelTick}
        onLand={onLand(0)}
        face={(asset) => (
          <span className="lk-slot-face">
            <AssetDisc asset={asset} className="gm-disc lk-slot-disc" />
            {asset}
          </span>
        )}
      />
      <SlotReel<Side>
        items={SIDES}
        target={live ? target.side : null}
        spinId={spinId}
        label={LUCKY.reels.side}
        stopAfterMs={STOPS_MS[1]!}
        tone={live ? target.side : undefined}
        onLand={onLand(1)}
        face={(side) => (
          <span className="lk-slot-face" data-side={side}>
            {side === "up" ? "▲" : "▼"} {SIDE_WORD[side]}
          </span>
        )}
      />
      <SlotReel<number>
        items={LUCKY_MULTIPLIERS}
        target={live ? target.multiplier : null}
        spinId={spinId}
        label={LUCKY.reels.reach}
        stopAfterMs={STOPS_MS[2]!}
        tone="reach"
        onLand={onLand(2)}
        face={(m) => <span className="lk-slot-face lk-slot-face--reach">{LUCKY.reels.multiple(m)}</span>}
      />
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
