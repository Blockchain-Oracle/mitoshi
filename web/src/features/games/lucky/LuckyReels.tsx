"use client";

// Lucky's three reels — asset, side, reach (R4-9, D-227). The cabinet and the 720 / 980 / 1240 ms stagger with
// ascending thunks are Owarine 90a91d71's (web/src/features/games/lucky/LuckyReels.tsx); the reels themselves are one
// continuous strip that decelerates onto the sealed draw (components/ui/slot-reel.tsx — 21st.dev 33159 by way of
// Senryo's machine). The ratchet ticks under the spin; the last reel lands, the pick is held lit a beat, then the deal.
// Each asset face carries its last half hour from the feed's history (Owarine's reel plate: AssetDisc plus a sparkline),
// toned by its move — a static line, read once a minute and shared by every copy of the face on the strip.
import { LUCKY_ASSETS, LUCKY_MULTIPLIERS } from "@cwf/core/games";
import { isOk, type Side } from "@cwf/core";
import { usePriceHistory } from "@cwf/markets/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
const LINE_SEC = 1_800;
const MINUTE_SEC = 60;
/** The face line's drawing box; CSS sizes it (`.lk-slot-line`). */
const LINE_W = 60;
const LINE_H = 12;

const minuteNow = () => Math.floor(Date.now() / 1_000 / MINUTE_SEC) * MINUTE_SEC;

/** The asset's last 30 minutes as one polyline, up or down by its first and last print. */
function ReelLine({ asset, toSec }: { asset: string; toSec: number }) {
  const history = usePriceHistory(asset, toSec - LINE_SEC, toSec);
  const line = useMemo(() => {
    if (!history || !isOk(history) || history.value.length < 2) return null;
    const prices = history.value.map((p) => p.priceRaw);
    let lo = prices[0]!;
    let hi = prices[0]!;
    for (const v of prices) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo === 0n ? 1n : hi - lo;
    const last = prices.length - 1;
    // Drawing only: the bigint prices become box coordinates here and nowhere else.
    const points = prices.map((v, i) => `${((i / last) * LINE_W).toFixed(1)},${(LINE_H - (Number(((v - lo) * 1_000n) / span) / 1_000) * LINE_H).toFixed(1)}`).join(" ");
    return { points, up: prices[last]! >= prices[0]! };
  }, [history]);
  if (!line) return <span className="lk-slot-line lk-slot-line--empty" aria-hidden />;
  return (
    <svg className="lk-slot-line" data-trend={line.up ? "up" : "down"} viewBox={`0 0 ${LINE_W} ${LINE_H}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={line.points} />
    </svg>
  );
}

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
  const [toSec, setToSec] = useState(minuteNow);
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;

  // The face lines move by the minute, so their read keys hold still between ticks.
  useEffect(() => {
    const id = window.setInterval(() => setToSec(minuteNow()), MINUTE_SEC * 1_000);
    return () => window.clearInterval(id);
  }, []);

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
          <span className="lk-slot-face lk-slot-face--asset">
            <span className="lk-slot-face">
              <AssetDisc asset={asset} className="gm-disc lk-slot-disc" />
              {asset}
            </span>
            <ReelLine asset={asset} toSec={toSec} />
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
