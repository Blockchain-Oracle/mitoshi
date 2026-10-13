"use client";

// The hall's cabinet rail (R4-9, D-227; Senryo:apps/web/src/features/games/GamesHub.tsx "every game as a card that
// shows the game itself — a moving 16:9 scene, its name, whose money is at risk and an explicit Play"). Snap-scrolling
// with the next cabinet peeking on phones; a 2/3/4-column grid at 768/1024/1440 (hall.css). Each cabinet: the scene,
// the pixel name, the econ sticker, one live fact and a 44 px Play. A mode not built yet wears "Soon" and no Play.
import { isOk, type Reading } from "@cwf/core";
import type { GameId } from "@cwf/core/games";
import { RANGE_NOT_DEPLOYED, type RangeReserveState } from "@cwf/core/range";
import { useLanes } from "@cwf/markets/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Sticker } from "@/components/kit";
import { useRangeReserve } from "@/features/range/data";
import { useWalletSession } from "@/lib/wallet-session";
import { ARCADE } from "../arcade/copy";
import { GameScene } from "../art/scenes";
import { gameEntry } from "../catalog";
import { GAMES } from "../copy";
import { useGames } from "../GamesProvider";
import { ECON_TONE } from "../GamesRail";
import { windowsLive } from "../lanes";
import { useBoard } from "./data";

const ORDER: readonly GameId[] = ["line-rider", "candle-hop", "lucky", "range", "moonshot", "duel", "practice"];

function rangeFact(reading: Reading<RangeReserveState | null> | null): { fact: string; open: boolean } {
  if (reading === null) return { fact: "…", open: true };
  if (!isOk(reading)) return { fact: GAMES.card.unavailable, open: false };
  if (reading.value === null) return { fact: RANGE_NOT_DEPLOYED, open: false };
  if (reading.value.paused) return { fact: GAMES.card.paused, open: false };
  return { fact: "", open: true };
}

function ArcadeFact({ game }: { game: "line-rider" | "candle-hop" }) {
  const { address } = useWalletSession();
  const board = useBoard(game, address);
  if (!board) return <span className="cab-fact">{board === null ? ARCADE.board.unreachable : "…"}</span>;
  const top = board.rows[0];
  if (!top) return <span className="cab-fact">{GAMES.card.noRuns}</span>;
  return <span className="cab-fact">{GAMES.card.top(ARCADE.fmt(top.score), board.me ? ARCADE.fmt(board.me.best) : null)}</span>;
}

function Cabinet({ id, fact, open }: { id: GameId; fact: ReactNode; open: boolean }) {
  const { feedback } = useGames();
  const entry = gameEntry(id);
  const built = entry.readiness.kind === "built";
  const playable = built && open;
  return (
    <li className="cab" data-off={playable ? undefined : ""}>
      <span className="cab-lights" aria-hidden />
      <div className="cab-screen">
        <GameScene game={id} />
      </div>
      <div className="cab-foot">
        <div className="cab-id">
          <span className="cab-name">{entry.nav.name}</span>
          <Sticker tone={ECON_TONE[entry.descriptor.economicKind]} size="sm" tilt={-3} title={entry.descriptor.economicLabel}>
            {GAMES.econ[entry.descriptor.economicKind]}
          </Sticker>
        </div>
        {built ? fact : <span className="cab-fact">{GAMES.card.soon}</span>}
        {playable ? (
          <Link href={entry.nav.href} className="du-cta cab-play" onClick={() => feedback("tap")}>
            {GAMES.card.play}
          </Link>
        ) : (
          <span className="cab-soon">{built ? GAMES.card.unavailable : GAMES.card.soon}</span>
        )}
      </div>
    </li>
  );
}

export function CabinetRail({ nowMs }: { nowMs: number }) {
  const lanes = useLanes();
  const reserve = useRangeReserve();
  const nowSec = Math.floor(nowMs / 1_000);
  const live = lanes && isOk(lanes) && nowSec > 0 ? windowsLive(lanes.value, nowSec) : null;
  const range = rangeFact(reserve);
  const windowsText = live === null ? "…" : GAMES.card.windowsLive(live);
  const windowsFact = <span className="cab-fact">{windowsText}</span>;

  return (
    <ul className="cab-rail" aria-label={GAMES.title}>
      {ORDER.map((id) => {
        if (id === "line-rider" || id === "candle-hop") return <Cabinet key={id} id={id} open fact={<ArcadeFact game={id} />} />;
        if (id === "range" || id === "moonshot") return <Cabinet key={id} id={id} open={range.open} fact={<span className="cab-fact">{range.fact || windowsText}</span>} />;
        return <Cabinet key={id} id={id} open fact={windowsFact} />;
      })}
    </ul>
  );
}
