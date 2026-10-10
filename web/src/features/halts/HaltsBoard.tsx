// `/status/halts` (S6): From 21st.dev 5693 preetsuthar17/system-status-block, revamped per D-044 — its one row per
// service (status icon, name, state, "Last:" incident) and its uptime strip become one row per ticker with 30 ET days;
// its incident-history toggle becomes a native <details> list. The strip is 5693's plain cells (a `title` per day), not
// 26906's hover-card buttons: 30 tappable days can't meet the 44 px target rule at 320 px, so each strip is one image
// whose label names its halted days, and every halt is listed in full below. No client JS (a site route, §3.1).
import { ET_WEEKDAY_SHORT, etDateOf, formatEtClock, haltLabel, weekdayOfDate } from "@cwf/core";
import { CheckCircleIcon, TriangleAlertIcon } from "lucide-react";
import { H1, Lead, Note } from "@/features/docs/Prose";
import type { BoardRow, DayTone } from "./board";
import { episodeLine } from "./board";
import { HALTS } from "./copy";
import type { HaltsBoard as Board } from "./board.server";

const CELL: Record<DayTone, string> = { none: "bg-surface-2", clear: "bg-up/70", stale: "bg-warning", halted: "bg-down" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Wed Oct 7" from an ET date. */
const dayWords = (date: string) => `${ET_WEEKDAY_SHORT[weekdayOfDate(date)]} ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`;

function Row({ row }: { row: BoardRow }) {
  const marked = row.days.filter((d) => d.tone === "stale" || d.tone === "halted");
  const state = row.unwatched ? HALTS.unwatched : row.now ? HALTS.now(haltLabel(row.now.reason), row.now.feed, `${formatEtClock(row.now.sinceSec)} ET`) : HALTS.clear;
  return (
    <li className="flex flex-col gap-2 border-t border-hairline py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {row.now ? <TriangleAlertIcon aria-hidden className="size-4 text-warning" /> : <CheckCircleIcon aria-hidden className={`size-4 ${row.unwatched ? "text-ink-secondary" : "text-up"}`} />}
        <b className="type-body-strong">{row.symbol}</b>
        <span className="type-caption text-ink-secondary">{row.name}</span>
        <span className="type-caption text-ink">{state}</span>
        {row.last ? <span className="type-caption ml-auto text-ink-secondary">{HALTS.last(dayWords(etDateOf(row.last.startSec)), haltLabel(row.last.reason))}</span> : null}
      </div>
      {row.unwatched ? null : (
        <div role="img" aria-label={HALTS.strip(row.symbol, marked.map((d) => dayWords(d.date)))} className="flex h-6 gap-px">
          {row.days.map((d) => (
            <div key={d.date} title={`${dayWords(d.date)} — ${d.tone === "none" ? HALTS.noRecord : d.lines.length ? d.lines.join("; ") : HALTS.noHalt}`} className={`h-full flex-1 rounded-sm ${CELL[d.tone]}`} />
          ))}
        </div>
      )}
    </li>
  );
}

export function HaltsBoard({ board }: { board: Board | null }) {
  if (!board) {
    return (
      <>
        <H1>{HALTS.title}</H1>
        <Note>{HALTS.unreadable}</Note>
      </>
    );
  }
  const halted = board.rows.filter((r) => r.now);
  return (
    <>
      <H1>{HALTS.title}</H1>
      <Lead>{HALTS.lead}</Lead>
      <div className="flex items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
        {halted.length ? <TriangleAlertIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" /> : <CheckCircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-up" />}
        <p className="type-body text-ink">{halted.length ? HALTS.someNow(halted.map((r) => r.symbol)) : HALTS.noneNow}</p>
      </div>
      <ul aria-label={HALTS.rowsLabel} className="flex flex-col">
        {board.rows.map((r) => (
          <Row key={r.symbol} row={r} />
        ))}
      </ul>
      <p className="type-caption flex flex-wrap gap-x-4 gap-y-1 text-ink-secondary">
        {(["clear", "stale", "halted", "none"] as const).map((t) => (
          <span key={t} className="inline-flex items-center gap-1.5"><span aria-hidden className={`inline-block size-2.5 rounded-sm ${CELL[t]}`} />{HALTS.legend[t]}</span>
        ))}
      </p>
      <details className="rounded-lg border border-hairline bg-surface-1 p-4">
        <summary className="type-body-strong min-h-11 cursor-pointer content-center">{HALTS.history(board.episodes.length)}</summary>
        <ol className="mt-2 flex flex-col gap-1.5">
          {board.episodes.map((e) => (
            <li key={`${e.asset}-${e.startSec}`} className="type-caption text-ink-secondary">
              <b className="text-ink">{dayWords(etDateOf(e.startSec))} · {e.asset.replace(/-24$/, "")}</b> · {episodeLine(e, board.nowSec)}
            </li>
          ))}
        </ol>
      </details>
      <Note>{HALTS.checked(new Date(board.nowSec * 1000).toISOString().replace("T", " ").slice(0, 16))}</Note>
    </>
  );
}
