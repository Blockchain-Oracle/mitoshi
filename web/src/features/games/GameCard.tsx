"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import type { GameEntry } from "./catalog";
import { GAMES } from "./copy";
import { useGames } from "./GamesProvider";

/**
 * What the hub knows about one mode right now.
 *
 * `pending` is a build fact — the route exists but nothing is behind it. `unavailable` is a live
 * fact read from the chain, and it carries the reason. Keeping them apart matters: "we have not
 * built this" and "the reserve is paused" are different sentences, and a player who is told the
 * second when the first is true will wait for something that is not coming.
 */
export type CardStatus =
  | { kind: "pending"; dependency: string }
  | { kind: "loading" }
  | { kind: "live" }
  /** Playable, but only on the 24/7 lanes while the stock market is shut (S23). */
  | { kind: "after-hours"; note: string }
  | { kind: "unavailable"; why: string };

/** A live, wallet-free fact about a mode — who is in it — drawn beside the build and chain facts. */
export function GameCard({ entry, status, presence }: { entry: GameEntry; status: CardStatus; presence?: string | null }) {
  const { feedback } = useGames();
  const Icon = entry.nav.icon;
  const openable = status.kind === "live" || status.kind === "loading" || status.kind === "after-hours";

  const body = (
    <>
      <div className="gm-card-head">
        <span className="gm-card-icon">
          <Icon aria-hidden />
        </span>
        <span className="gm-card-name">{entry.nav.name}</span>
        <StatusBadge status={status} />
      </div>
      <p className="gm-card-blurb">{entry.nav.description}</p>
      <div className="gm-card-foot">
        <span className={`gm-econ gm-econ--${entry.descriptor.economicKind}`}>{entry.descriptor.economicLabel}</span>
        {status.kind === "pending" && <span className="gm-card-waiting">{GAMES.card.waitingOn(status.dependency)}</span>}
        {status.kind === "unavailable" && <span className="gm-card-waiting">{status.why}</span>}
        {status.kind === "after-hours" && <span className="gm-card-waiting">{status.note}</span>}
        {status.kind === "loading" && <Skeleton className="h-3 w-24" />}
      </div>
      {presence && <p className="gm-card-presence">{presence}</p>}
    </>
  );

  if (!openable) {
    return (
      <div className="gm-card gm-card--pending" aria-disabled>
        {body}
      </div>
    );
  }

  return (
    <Link href={entry.nav.href} className="gm-card" onClick={() => feedback("tap")}>
      {body}
      <span className="gm-card-open">{GAMES.card.open}</span>
    </Link>
  );
}

function StatusBadge({ status }: { status: CardStatus }) {
  if (status.kind === "loading") return <Skeleton className="h-4 w-14 rounded-full" />;
  if (status.kind === "live") return <span className="gm-badge gm-badge--live">{GAMES.card.liveBadge}</span>;
  if (status.kind === "after-hours") return <span className="gm-badge gm-badge--after">{GAMES.card.afterHoursBadge}</span>;
  if (status.kind === "unavailable") return <span className="gm-badge">{GAMES.card.unavailableBadge}</span>;
  return <span className="gm-badge">{GAMES.card.pendingBadge}</span>;
}
