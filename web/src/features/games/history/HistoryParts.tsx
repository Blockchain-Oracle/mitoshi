"use client";
// History's pieces (R6 games §4.9, T07/T10/T16): one section frame with the kit's states — row bones while it reads
// (21st.dev 21489 shadcnspace/list-skeleton-with-icons' anatomy on the kit's bones), the error with Retry, an inline empty
// that names the game that fills it — and one row in the terminal's grammar for a run, a duel or a draw, shared by your
// own history and the signed-out preview (where each row adds whose it is). No bare one-liners.
import { diagnosis } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import Link from "next/link";
import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingFrame } from "@/components/states";
import { RowBones } from "@/components/states/shapes/bones";
import { SIDE_WORD } from "@/features/markets/side-styles";
import { ARCADE } from "../arcade/copy";
import { GAMES } from "../copy";
import { DUEL } from "../duel/copy";
import type { DuelRecentWire } from "../duel/duel.server";
import { LUCKY } from "../lucky/copy";
import type { LuckyRecentWire, LuckyRowWire } from "../lucky/lucky-wire";

const H = GAMES.history;
const BONES = 5;

export const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
export const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const usd = (base: string) => `$${formatBaseUnits(BigInt(base), 6, { minDp: 0 })}`;

export interface SectionRead {
  isError: boolean;
  refetch: () => unknown;
}

export interface SectionEmpty {
  why: string;
  detail: string;
  label: string;
  href: string;
}

export function ListBones({ label }: { label: string }) {
  return (
    <LoadingFrame shape="history-rows" label={label}>
      <div className="rk-list">
        {Array.from({ length: BONES }, (_, i) => <RowBones key={i} />)}
      </div>
    </LoadingFrame>
  );
}

/**
 * A titled list in one of its states: `count` undefined while the first read is out (bones, or the error with Retry
 * once it failed), 0 for the empty with its action, otherwise the rows. Rows already read stay through a failed refresh.
 */
export function HistorySection({ title, q, count, empty, aside, children }: { title: string; q: SectionRead; count: number | undefined; empty: SectionEmpty; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rk-section" aria-label={title}>
      <h2 className="rk-section-title">{title}</h2>
      {aside}
      {count === undefined ? (
        q.isError ? <ErrorState diagnosis={diagnosis("indexer-down", `${title} unreadable`)} retry={() => void q.refetch()} /> : <ListBones label={title} />
      ) : count === 0 ? (
        <EmptyState size="inline" why={empty.why} detail={empty.detail} nextAction={{ label: empty.label, href: empty.href }} />
      ) : (
        <ol className="rk-list">{children}</ol>
      )}
    </section>
  );
}

/** Every read failed (the record is down, not one game): one error, one Retry for all of them. */
export function AllFailed({ reads }: { reads: SectionRead[] }) {
  const retry = () => reads.forEach((q) => void q.refetch());
  return <ErrorState diagnosis={diagnosis("indexer-down", "game history unreadable")} retry={retry} />;
}

export interface RowProps {
  title: string;
  sub: string;
  figure: string;
  note?: string | null;
  result?: string;
  href?: string;
}

export function HistoryRow({ title, sub, figure, note, result, href }: RowProps) {
  const main = (
    <>
      <span className="rk-row-title">{title}</span>
      <span className="rk-row-sub">{sub}</span>
    </>
  );
  return (
    <li className="rk-row">
      {href ? <Link href={href} className="rk-row-main">{main}</Link> : <span className="rk-row-main">{main}</span>}
      <span className="rk-row-side">
        <span className="rk-row-figure">{figure}</span>
        {note ? <span className="rk-row-sub" data-result={result}>{note}</span> : null}
      </span>
    </li>
  );
}

const subOf = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ");

export interface RunLike {
  game: "line-rider" | "candle-hop";
  wallet?: string;
  score: number;
  at: string;
  seed?: string | null;
  calm?: boolean;
  rank?: number | null;
}

/** A replayed run; `owner` adds whose it is (the public preview). */
export const runRow = (r: RunLike, owner = false): RowProps => ({
  title: ARCADE.games[r.game].title,
  sub: subOf(owner && r.wallet ? short(r.wallet) : null, when(r.at), r.seed ? ARCADE.over.seed(r.seed) : null, r.calm ? H.calm : null),
  figure: ARCADE.fmt(r.score),
  note: r.rank !== null && r.rank !== undefined ? H.rank(r.rank) : null,
});

const RESULT_WORD: Record<string, string> = { won: LUCKY.history.won, lost: LUCKY.history.lost, void: LUCKY.history.void, "cashed-out": LUCKY.history.cashedOut, placed: LUCKY.history.placed, pending: LUCKY.history.placed, refused: LUCKY.history.refused, unknown: LUCKY.history.unknown, drawn: LUCKY.history.drawn };

const drawTitle = (asset: string | null, side: "up" | "down" | null, multiplier: number | null) =>
  [asset, side ? SIDE_WORD[side] : null, multiplier ? LUCKY.reels.multiple(multiplier) : null].filter(Boolean).join(" · ");

/** One of your draws: what the reels landed on, the stake, and what the ticket lane did with it. */
export const drawRow = (r: LuckyRowWire): RowProps => ({
  title: drawTitle(r.asset, r.side, r.multiplier),
  sub: subOf(when(r.createdAt), r.txHash ? `${r.txHash.slice(0, 10)}…` : r.refusal),
  figure: usd(r.costBase ?? r.stakeBase),
  note: RESULT_WORD[r.result] ?? r.result,
  result: r.result,
});

/** Anyone's draw on the public floor, with whose it is. */
export const publicDrawRow = (r: LuckyRecentWire): RowProps => ({
  title: drawTitle(r.asset, r.side, r.multiplier),
  sub: subOf(short(r.wallet), when(r.placedAt)),
  figure: usd(r.costBase ?? r.stakeBase),
  note: RESULT_WORD[r.result] ?? r.result,
  result: r.result,
});

export interface DuelHistoryRowWire {
  matchId: string;
  tier: string;
  status: string;
  opponent: string;
  createdAt: string;
}

/** One of your duels; it opens its own page. */
export const duelRow = (r: DuelHistoryRowWire): RowProps => ({
  title: `${DUEL.lobby.vs.toLowerCase()} ${short(r.opponent)}`,
  sub: when(r.createdAt),
  figure: DUEL.entry.tierWord(r.tier, Number(r.tier.slice(1)) || 0),
  note: DUEL.result.title(r.status),
  href: `/games/duel/${r.matchId}`,
});

/** A decided duel on the public record: both players, the pot, who took it. */
export const publicDuelRow = (r: DuelRecentWire): RowProps => ({
  title: DUEL.floor.vs(short(r.creator), short(r.challenger)),
  sub: subOf(when(r.at), r.status === "refunded" ? null : r.winner ? H.wonBy(short(r.winner)) : null),
  figure: usd(r.potBase),
  note: DUEL.result.title(r.status),
  href: `/games/duel/${r.matchId}`,
});
