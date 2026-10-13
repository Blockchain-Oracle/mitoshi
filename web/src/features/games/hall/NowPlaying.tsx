"use client";

// The hall's now-playing marquee (R4-9, D-227; the games spec's creative direction "Gēsen"): one 32 px strip moved by the
// kit's InfiniteSlider (Ported from Owarine 90a91d71:web/src/components/kit/InfiniteSlider.tsx, R4-2), mixing the
// venue's real fills of the last ten minutes ("0x3f…a1 · UP · BTC 5m · 12s") with the arcade's newest replayed runs
// ("0x…a1 · Line Rider 1,240"), a wallet's best flagged. Hidden when both are empty; still under reduced motion.
import { useMemo } from "react";
import { InfiniteSlider } from "@/components/kit";
import { cadenceLabel } from "../stage/SwipeDeck";
import { ARCADE } from "../arcade/copy";
import { GAMES } from "../copy";
import { shortHex, takerLeansUp, useRecentRuns, useTape } from "./data";

const WINDOW_SEC = 600;

interface Item {
  key: string;
  who: string;
  what: string;
  tone: "up" | "down" | "run" | "best";
  ago: string;
}

export function NowPlaying({ nowMs }: { nowMs: number }) {
  // The ten-minute window moves by the minute, so the read's key holds between ticks.
  const nowSec = Math.floor(nowMs / 1_000);
  const since = nowSec > 0 ? Math.floor((nowSec - WINDOW_SEC) / 60) * 60 : 0;
  const tape = useTape(since);
  const runs = useRecentRuns();

  const items = useMemo<Item[]>(() => {
    const fills = tape
      .filter((f) => f.symbol !== null)
      .slice(0, 16)
      .map((f, i) => ({
        key: `f${i}-${f.tsSec}`,
        who: shortHex(f.taker),
        what: `${takerLeansUp(f.takerKind) ? GAMES.hall.tapeUp : GAMES.hall.tapeDown} · ${f.symbol}${f.cadenceSec ? ` ${cadenceLabel(f.cadenceSec)}` : ""}`,
        tone: takerLeansUp(f.takerKind) ? ("up" as const) : ("down" as const),
        ago: GAMES.hall.tapeAgo(Math.max(0, nowSec - f.tsSec)),
      }));
    const played = runs.slice(0, 8).map((r, i) => ({
      key: `r${i}-${r.at}`,
      who: shortHex(r.wallet),
      what: `${r.best ? `${GAMES.hall.newBest} · ` : ""}${GAMES.hall.runLine(ARCADE.games[r.game].title, ARCADE.fmt(r.score))}`,
      tone: r.best ? ("best" as const) : ("run" as const),
      ago: GAMES.hall.tapeAgo(Math.max(0, nowSec - Math.floor(Date.parse(r.at) / 1_000))),
    }));
    // Interleave so a busy tape never hides the arcade.
    const out: Item[] = [];
    for (let i = 0; i < Math.max(fills.length, played.length); i++) {
      if (fills[i]) out.push(fills[i]!);
      if (played[i]) out.push(played[i]!);
    }
    return out;
  }, [tape, runs, nowSec]);

  if (items.length === 0) return <span className="hall-now hall-now--empty" aria-hidden />;
  return (
    <div className="hall-now" role="marquee" aria-label={GAMES.hall.nowPlaying}>
      <InfiniteSlider gapRem={1.5} duration={Math.max(24, items.length * 4)} durationOnHover={120}>
        {items.map((item) => (
          <span key={item.key} className="hall-now-item" data-tone={item.tone}>
            <span className="hall-now-dot" aria-hidden />
            <span className="hall-now-who">{item.who}</span>
            <span className="hall-now-what">{item.what}</span>
            <span className="hall-now-ago">{item.ago}</span>
          </span>
        ))}
      </InfiniteSlider>
    </div>
  );
}
