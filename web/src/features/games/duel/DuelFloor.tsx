"use client";
// Duel before a game (R6 games §4.6, S26; Abode's lobby — who is waiting beside the Join; Turf's join with the people
// next to the CTA and its compact last results): under the entry, the stage shows the live game rather than an empty
// board. "Waiting now" is the selected pot's players (From 21st.dev 33338 adrielzimbril/user-presence-avatar — the
// avatar cluster, no online toggle, at most five then "+n"), and "Last duels" the decided pots (From 21st.dev 29394
// felipemenezes098/activity-feed — a two-avatar pair, the match, the pot and who took it, the time). Real reads only:
// the queue's own rows and the record (`/api/games/duel/presence`, `/api/games/duel/recent`).
import { STAKE_TIERS, type StakeTierId } from "@cwf/core/games";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { AccountAvatar } from "@/components/shell/header/AccountAvatar";
import { timeAgo } from "@/features/markets/history/time-ago";
import { useNowMs } from "@/lib/clock";
import { diagnosis } from "@cwf/core";
import { DUEL } from "./copy";
import type { DuelRecentWire } from "./duel.server";
import { dollars } from "./DuelParts";
import { useDuelPresence } from "./MatchTile";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const CLUSTER_MAX = 5;

export function useDuelRecent() {
  return useQuery({
    queryKey: ["games", "duel", "recent"],
    queryFn: async () => {
      const res = await fetch("/api/games/duel/recent");
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { configured: boolean; rows: DuelRecentWire[] };
    },
    refetchInterval: 30_000,
    retry: 1,
  });
}

export function DuelFloor({ tier, onFind }: { tier: StakeTierId; onFind: () => void }) {
  const presence = useDuelPresence();
  const recent = useDuelRecent();
  const nowMs = useNowMs();
  const pot = STAKE_TIERS.find((t) => t.id === tier);
  const potWord = DUEL.entry.tierWord(tier, pot?.potUnits ?? 0);
  const players = (presence.data?.players ?? []).filter((p) => p.tier === tier);
  const F = DUEL.floor;
  return (
    <section className="du-floor" aria-label={F.label}>
      <div className="du-floor-now">
        <h2 className="du-floor-title">{F.waitingNow}</h2>
        {players.length > 0 ? (
          <div className="du-floor-cluster">
            <span className="du-avatars">
              {players.slice(0, CLUSTER_MAX).map((p) => (
                <span key={p.wallet} className="du-avatar" title={short(p.wallet)}>
                  <AccountAvatar seed={p.wallet} size={24} />
                </span>
              ))}
              {players.length > CLUSTER_MAX ? <span className="du-avatar du-avatar-more">+{players.length - CLUSTER_MAX}</span> : null}
            </span>
            <span className="du-floor-count">{F.waitingAt(players.length, potWord)}</span>
          </div>
        ) : (
          <p className="du-floor-count">{F.nobody(potWord)}</p>
        )}
      </div>

      <div className="du-floor-last">
        <h2 className="du-floor-title">{F.lastDuels}</h2>
        {recent.isPending ? (
          <LoadingState shape="row" />
        ) : recent.isError ? (
          <ErrorState diagnosis={diagnosis("indexer-down", "duel recent unreadable")} retry={() => void recent.refetch()} />
        ) : !recent.data?.configured || recent.data.rows.length === 0 ? (
          <EmptyState why={F.emptyWhy} detail={F.emptyDetail} nextAction={{ label: F.find, onClick: onFind }} />
        ) : (
          <ol className="du-feed">
            {recent.data.rows.map((r) => (
              <li key={r.matchId}>
                <Link href={`/games/duel/${r.matchId}`} className="du-feed-row">
                  <span className="du-feed-pair" aria-hidden>
                    <AccountAvatar seed={r.creator} size={24} />
                    <AccountAvatar seed={r.challenger} size={24} />
                  </span>
                  <span className="du-feed-main">
                    <span className="du-feed-title">{F.vs(short(r.creator), short(r.challenger))}</span>
                    <span className="du-feed-sub">{r.status === "refunded" ? F.refunded(dollars(r.potBase)) : F.wonBy(dollars(r.potBase), r.winner ? short(r.winner) : "—")}</span>
                  </span>
                  <span className="du-feed-time">{nowMs > 0 ? timeAgo(Date.parse(r.at), nowMs) : ""}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
