"use client";

import { isOk, type Reading } from "@cwf/core";
import { RANGE_NOT_DEPLOYED, type RangeReserveState } from "@cwf/core/range";
import { useRangeReserve } from "@/features/range/data";
import Link from "next/link";
import SectionHead from "@/components/shell/SectionHead";
import { diagnosisCopy } from "@/lib/copy";
import { gameEntriesInGroup, type GameEntry } from "./catalog";
import { GAMES } from "./copy";
import { GameCard, type CardStatus } from "./GameCard";
import { GameProfileCard } from "./GameProfileCard";
import { useLastGame } from "./last-game";
import { useGames } from "./GamesProvider";
import { useMarketSession } from "@/features/markets/session/useMarketSession";

/**
 * `/games` — the selection, and everything the shell knows about the player (ported from Owarine 90a91d71; P4, D-223).
 * Mitoshi has no arena yet (S12b): the duel's card says so, and the season, match and achievements plates wait for it.
 *
 * The three groups come from core's own grouping, so a mode cannot appear here under a section its
 * economic kind disagrees with. Availability is read, not asserted: Range asks the deployed reserve
 * whether it is live, and every unbuilt mode names the slice it is waiting for. An active match
 * always renders above the selection, because resuming has to beat starting a new one.
 */
export function GamesHub() {
  const reserve = useRangeReserve();
  const { feedback } = useGames();
  const last = useLastGame();
  const session = useMarketSession();
  const closed = session !== null && !session.open;
  const status = (entry: GameEntry): CardStatus => {
    const base: CardStatus = entry.id === "range" || entry.id === "moonshot" ? rangeStatus(reserve) : entry.readiness.kind === "built" ? { kind: "live" } : { kind: "pending", dependency: entry.readiness.dependency };
    // Every mode that plays a Window runs on the 24/7 lanes alone while the stock market is shut; arcade never touches one.
    return closed && base.kind === "live" && entry.descriptor.group !== "arcade" ? { kind: "after-hours" } : base;
  };

  return (
    <div className="container gm-page">
      <div className="gm-hero">
        <span className="gm-eyebrow">{GAMES.eyebrow}</span>
        <h1 className="page-title">
          {GAMES.title}
          <span className="accent">.</span>
        </h1>
        <p className="gm-intro">{GAMES.intro}</p>
      </div>

      {last && (
        // Pips remembers the last game a player opened and offers it first.
        <Link href={last.href} className="gm-plate gm-resume gm-last" onClick={() => feedback("tap")}>
          <p className="gm-plate-title">{GAMES.lastGame.title}</p>
          <p className="gm-plate-body">{GAMES.lastGame.body(last.name)}</p>
          <span className="gm-resume-cta">{GAMES.lastGame.cta}</span>
        </Link>
      )}

      {(["prediction", "duel", "arcade"] as const).map((group, i) => {
        const head = GAMES.sections[group];
        return (
          <section key={group} className="gm-section" aria-label={head.title}>
            <SectionHead number={head.number} title={head.title} desc={head.desc} />
            {i === 0 && closed ? <p className="gm-card-waiting gm-after-hours">{GAMES.card.afterHours}</p> : null}
            <div className="gm-grid">
              {gameEntriesInGroup(group).map((entry) => (
                <GameCard key={entry.id} entry={entry} status={status(entry)} presence={null} />
              ))}
            </div>
          </section>
        );
      })}

      <section className="gm-section" aria-label={GAMES.sections.profile.title}>
        <SectionHead {...GAMES.sections.profile} />
        <GameProfileCard />
      </section>
    </div>
  );
}

/** Range and Moonshot sit on one contract, so their cards report the contract, not the repo. */
function rangeStatus(reading: Reading<RangeReserveState | null> | null): CardStatus {
  if (reading === null) return { kind: "loading" };
  if (!isOk(reading)) return { kind: "unavailable", why: diagnosisCopy(reading.error.kind).headline };
  if (reading.value === null) return { kind: "unavailable", why: RANGE_NOT_DEPLOYED };
  if (reading.value.paused) return { kind: "unavailable", why: GAMES.card.paused };
  return { kind: "live" };
}
