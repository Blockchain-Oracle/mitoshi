// `/status/halts` (S6) — on the status board's parts (R4-10, D-227; Owarine 90a91d71 `StatusRows.tsx`'s banner, tally and
// system accordion): the verdict ("No halts" / "Halted: TSLA" / warn when only a signed price is stale), a tally, one bar
// per ticker, then one dropdown per ticker — its mark, name, now or last — whose 30-day strip sits in the trigger on a
// wide screen and in the panel on a phone, with that ticker's halts listed under it; every halt last. The strip is
// From 21st.dev 5693 preetsuthar17/system-status-block's plain cells, one image whose label names its halted days.
import { ET_WEEKDAY_SHORT, etDateOf, formatEtClock, haltLabel, weekdayOfDate } from "@cwf/core";
import { History } from "lucide-react";
import Link from "next/link";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { BoardBanner, BoardStack, SystemItem, type BoardTone } from "@/features/status/BoardParts";
import type { BoardRow, DayTone } from "./board";
import { episodeLine } from "./board";
import type { HaltsBoard as Board } from "./board.server";
import { HALTS } from "./copy";

const CELL: Record<DayTone, string> = { none: "bg-surface-2", clear: "bg-up/70", stale: "bg-warning", halted: "bg-down" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Wed Oct 7" from an ET date. */
const dayWords = (date: string) => `${ET_WEEKDAY_SHORT[weekdayOfDate(date)]} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`;

function toneOf(row: BoardRow): BoardTone {
  if (row.unwatched) return "off";
  if (!row.now) return "good";
  return haltLabel(row.now.reason) === "Trading halted" ? "bad" : "warn";
}

function Strip({ row }: { row: BoardRow }) {
  const marked = row.days.filter((d) => d.tone === "stale" || d.tone === "halted");
  return (
    <div role="img" aria-label={HALTS.strip(row.symbol, marked.map((d) => dayWords(d.date)))} className="flex h-6 w-full gap-px">
      {row.days.map((d) => (
        <div key={d.date} title={`${dayWords(d.date)} — ${d.tone === "none" ? HALTS.noRecord : d.lines.length ? d.lines.join("; ") : HALTS.noHalt}`} className={`h-full flex-1 rounded-sm ${CELL[d.tone]}`} />
      ))}
    </div>
  );
}

function TickerItem({ row, nowSec, episodes }: { row: BoardRow; nowSec: number; episodes: Board["episodes"] }) {
  const tone = toneOf(row);
  const summary = row.unwatched
    ? HALTS.unwatched
    : row.now
      ? HALTS.now(haltLabel(row.now.reason), row.now.feed, `${formatEtClock(row.now.sinceSec)} ET`)
      : row.last
        ? `${HALTS.clear} · ${HALTS.last(dayWords(etDateOf(row.last.startSec)))}`
        : HALTS.clear;
  const mine = episodes.filter((e) => e.asset.replace(/-24$/, "") === row.symbol);
  return (
    <SystemItem
      value={row.symbol}
      glyph={<AssetDisc asset={row.symbol} className="halts-mark" />}
      name={`${row.symbol} · ${row.name}`}
      summary={summary}
      summaryTone={tone}
      wide={row.unwatched ? null : <Strip row={row} />}
    >
      {row.unwatched ? null : (
        <div className="flex flex-col gap-3 py-3">
          <div className="sm:hidden">
            <Strip row={row} />
          </div>
          {mine.length === 0 ? (
            <p className="type-caption text-ink-secondary">{HALTS.none}</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {mine.map((e) => (
                <li key={`${e.asset}-${e.startSec}`} className="type-caption text-ink-secondary">
                  <b className="text-ink">{dayWords(etDateOf(e.startSec))}</b> · {episodeLine(e, nowSec)}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </SystemItem>
  );
}

export function HaltsBoard({ board }: { board: Board | null }) {
  if (!board) {
    return <BoardBanner tone="bad" eyebrow={HALTS.eyebrow} verdict={HALTS.unreadable} sub={HALTS.sub} figureLabel={HALTS.watched} figure="—" tally={[]} pulse={[]} aside={<Back />} />;
  }
  const tones = board.rows.map(toneOf);
  const n = (t: BoardTone) => tones.filter((x) => x === t).length;
  const halted = board.rows.filter((_, i) => tones[i] === "bad").map((r) => r.symbol);
  const stale = board.rows.filter((_, i) => tones[i] === "warn").map((r) => r.symbol);
  const tone: BoardTone = halted.length ? "bad" : stale.length ? "warn" : "good";
  const verdict = halted.length ? HALTS.someNow(halted) : stale.length ? HALTS.staleNow(stale) : HALTS.noneNow;
  const open = board.rows.filter((_, i) => tones[i] === "bad" || tones[i] === "warn").map((r) => r.symbol);
  return (
    <>
      <BoardBanner
        tone={tone}
        eyebrow={HALTS.eyebrow}
        verdict={verdict}
        sub={HALTS.sub}
        figureLabel={HALTS.watched}
        figure={`${board.rows.length - n("off")} / ${board.rows.length}`}
        tally={(["bad", "warn", "good", "off"] as const).map((t) => ({ tone: t, n: n(t), word: HALTS.tally[t] }))}
        pulse={board.rows.map((r, i) => ({ id: r.symbol, label: r.symbol, tone: tones[i] ?? "off" }))}
        aside={<Back />}
      />
      <BoardStack open={open} label={HALTS.title}>
        {board.rows.map((r) => (
          <TickerItem key={r.symbol} row={r} nowSec={board.nowSec} episodes={board.episodes} />
        ))}
        <SystemItem value="history" glyph={<History aria-hidden className="size-4.5 text-ink" />} name={HALTS.history(board.episodes.length)} summary={HALTS.sub} summaryTone="good">
          <ol className="flex flex-col gap-1.5 py-3">
            {board.episodes.map((e) => (
              <li key={`${e.asset}-${e.startSec}`} className="type-caption text-ink-secondary">
                <b className="text-ink">{dayWords(etDateOf(e.startSec))} · {e.asset.replace(/-24$/, "")}</b> · {episodeLine(e, board.nowSec)}
              </li>
            ))}
          </ol>
        </SystemItem>
      </BoardStack>
      <p className="flex flex-wrap justify-center gap-x-4 gap-y-1 type-caption text-ink-secondary">
        {(["clear", "stale", "halted", "none"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span aria-hidden className={`inline-block size-2.5 rounded-sm ${CELL[t]}`} />{HALTS.legend[t]}</span>
        ))}
      </p>
      <p className="status-checked">{HALTS.checked(new Date(board.nowSec * 1000).toISOString().replace("T", " ").slice(0, 16))}</p>
    </>
  );
}

function Back() {
  return (
    <Link href="/status" className="self-start type-caption text-accent underline-offset-4 hover:underline">{HALTS.back}</Link>
  );
}
