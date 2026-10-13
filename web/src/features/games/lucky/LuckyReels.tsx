"use client";

// Ported from Owarine 90a91d71:web/src/features/games/lucky/LuckyReels.tsx (R4-9, D-227) — on Mitoshi's AssetDisc,
// side words and pixel marks; the stops at 720, 980 and 1240 ms with ascending thunks are Owarine's.
import { LUCKY_ASSETS, LUCKY_MULTIPLIERS } from "@cwf/core/games";
import type { Side } from "@cwf/core";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { SIDE_WORD } from "@/features/markets/side-styles";
import { BearMark, BullMark, CoinMark } from "../art/PixelArt";
import { useGames } from "../GamesProvider";
import { LUCKY } from "./copy";
import { reelLock, reelPick, reelTick } from "./reel-sfx";
import "../stage/stage.css";

/**
 * Three reels — asset, side, reach — behind the stage's CRT faces (Pips' slot band, `lucky.tsx` §Reel).
 *
 * The reels move from the tap, through both round trips, and stop only once the deal is in hand:
 * staggered at 720, 980 and 1240 ms, each with its own thunk and a buzz, the last one ringing longer.
 * Every tick steps to the NEXT value in the pool rather than a random one, so the face never freezes on
 * the same word twice. Reduced motion keeps every state and drops the movement: the reels sit blank
 * until the deal, then land together.
 */
const CYCLE_MS = 60;
const TICK_MS = 70;
const STOPS_MS: readonly number[] = [720, 980, 1_240];
/** The beat between the last reel landing and the card appearing — Pips' lock-in, where the pick is held lit. */
const LOCKIN_MS = 480;

export interface ReelTarget {
  asset: string;
  side: Side;
  multiplier: number;
}

interface ReelProps<T> {
  index: number;
  label: string;
  pool: readonly T[];
  target: T | null;
  cycling: boolean;
  landing: boolean;
  reduced: boolean;
  tone: (value: T) => "asset" | "up" | "down" | "reach";
  render: (value: T | null) => ReactNode;
  onStop: (index: number) => void;
}

function Reel<T>({ index, label, pool, target, cycling, landing, reduced, tone, render, onStop }: ReelProps<T>) {
  const [shown, setShown] = useState<T | null>(null);
  const [locked, setLocked] = useState(false);
  const { feedback } = useGames();
  const stopRef = useRef(onStop);
  stopRef.current = onStop;

  // Idle or already dealt: the face shows the target, or nothing.
  useEffect(() => {
    if (cycling || landing) return;
    setShown(target);
    setLocked(target !== null);
  }, [cycling, landing, target]);

  // Moving: step the pool; landing: schedule this reel's stop.
  useEffect(() => {
    if (!cycling && !landing) return;
    setLocked(false);
    let at = index % pool.length;
    const interval = reduced
      ? null
      : setInterval(() => {
          at = (at + 1) % pool.length;
          setShown(pool[at] ?? null);
        }, CYCLE_MS);
    if (reduced) setShown(null);
    const stop =
      landing && target !== null
        ? setTimeout(
            () => {
              if (interval) clearInterval(interval);
              setShown(target);
              setLocked(true);
              feedback("confirm");
              reelLock(index, index === STOPS_MS.length - 1);
              stopRef.current(index);
            },
            reduced ? 0 : (STOPS_MS[index] ?? 0),
          )
        : null;
    return () => {
      if (interval) clearInterval(interval);
      if (stop) clearTimeout(stop);
    };
  }, [cycling, landing, target, index, pool, reduced, feedback]);

  return (
    <div className="lk-reel" data-cycling={cycling || (landing && !locked) ? "true" : "false"} data-locked={locked ? "true" : "false"} data-tone={shown === null ? undefined : tone(shown)}>
      <span className="lk-reel-k">{label}</span>
      <div className="lk-face crt-screen" aria-hidden>
        <span className="st-art-screw st-art-screw--tl" />
        <span className="st-art-screw st-art-screw--tr" />
        <span className="st-art-screw st-art-screw--bl" />
        <span className="st-art-screw st-art-screw--br" />
        {render(shown)}
        <span className="lk-foot" />
      </div>
    </div>
  );
}

const SIDES: readonly Side[] = ["up", "down"];

export interface LuckyReelsProps {
  cycling: boolean;
  landing: boolean;
  target: ReelTarget | null;
  /** The last reel has stopped and the lock-in beat has passed. */
  onLanded: () => void;
  /** The names this spin can draw (S23): the 24/7 lanes alone while no stock Window trades. */
  pool?: readonly string[];
}

export function LuckyReels({ cycling, landing, target, onLanded, pool }: LuckyReelsProps) {
  const { reducedMotion } = useGames();
  const [stopped, setStopped] = useState(0);
  const [announce, setAnnounce] = useState("");
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;

  // A new spin resets the count of landed reels.
  useEffect(() => {
    if (cycling) {
      setStopped(0);
      setAnnounce("");
    }
  }, [cycling]);

  // The ratchet under the whole spin: one quiet stream, never one per reel.
  const moving = cycling || (landing && stopped < STOPS_MS.length);
  useEffect(() => {
    if (!moving || reducedMotion) return;
    const interval = setInterval(reelTick, TICK_MS);
    return () => clearInterval(interval);
  }, [moving, reducedMotion]);

  // The last reel lands, the pick is held lit for a beat, then the machine commits.
  useEffect(() => {
    if (!landing || stopped < STOPS_MS.length || !target) return;
    const timer = setTimeout(
      () => {
        reelPick();
        setAnnounce(LUCKY.reels.announce(target.asset, SIDE_WORD[target.side], target.multiplier));
        landedRef.current();
      },
      reducedMotion ? 0 : LOCKIN_MS,
    );
    return () => clearTimeout(timer);
  }, [landing, stopped, target, reducedMotion]);

  const onStop = () => setStopped((n) => n + 1);

  return (
    <div className="lk-reels" role="group" aria-label={LUCKY.title}>
      <Reel<string>
        index={0}
        label={LUCKY.reels.asset}
        pool={pool ?? LUCKY_ASSETS}
        target={target?.asset ?? null}
        cycling={cycling}
        landing={landing}
        reduced={reducedMotion}
        tone={() => "asset"}
        onStop={onStop}
        render={(asset) => (
          <>
            <span className="lk-face-art">{asset ? <AssetDisc asset={asset} className="gm-disc lk-asset-disc" /> : <CoinMark />}</span>
            <span className="lk-face-v">{asset ?? LUCKY.reels.blank}</span>
          </>
        )}
      />
      <Reel<Side>
        index={1}
        label={LUCKY.reels.side}
        pool={SIDES}
        target={target?.side ?? null}
        cycling={cycling}
        landing={landing}
        reduced={reducedMotion}
        tone={(side) => side}
        onStop={onStop}
        render={(side) => (
          <>
            <span className="lk-face-art">{side === "up" ? <BullMark /> : side === "down" ? <BearMark /> : <CoinMark />}</span>
            <span className="lk-face-v">{side ? SIDE_WORD[side] : LUCKY.reels.blank}</span>
          </>
        )}
      />
      <Reel<number>
        index={2}
        label={LUCKY.reels.reach}
        pool={LUCKY_MULTIPLIERS}
        target={target?.multiplier ?? null}
        cycling={cycling}
        landing={landing}
        reduced={reducedMotion}
        tone={() => "reach"}
        onStop={onStop}
        render={(m) => (
          <>
            <span className="lk-face-art">{m === null && <CoinMark />}</span>
            <span className="lk-face-v lk-face-v--reach">{m === null ? LUCKY.reels.blank : LUCKY.reels.multiple(m)}</span>
          </>
        )}
      />
      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}
