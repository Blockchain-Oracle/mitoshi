"use client";
// `/status` — Ported from Owarine 90a91d71:web/src/features/status/{StatusScreen,StatusRows}.tsx on Mitoshi's probes
// (R4-10, D-227): the verdict as the hero (the slowest part, Tempo's head block, a tally, one bar per check), then what
// needs attention in full, then every check by the system it watches as dropdowns (a system with a problem starts
// open), two stacks on wide screens. The footer's ring counts down to the next read, every 30 s.
import { Activity, Boxes, CalendarClock, HandCoins, LineChart, Wallet, type LucideIcon } from "lucide-react";
import { CountdownRing } from "@/components/kit/CountdownRing";
import { cn } from "@/lib/utils";
import { BoardBanner, BoardStack, CheckLine, RANK, SystemItem, TONE, type BoardTone } from "./BoardParts";
import { STATUS } from "./copy";
import type { StatusGroup, StatusReport, StatusRow } from "./probes";
import { STATUS_POLL_MS, useStatus } from "./useStatus";
import "@/components/kit/kit.css";

const GLYPH: Record<StatusGroup, LucideIcon> = { Chain: Boxes, Prices: LineChart, Windows: Activity, Payouts: HandCoins, Markets: CalendarClock, Fees: Wallet };
/** Checks that open a board of their own: the halts board, and the settled prints' proofs. */
const LINKS: Record<string, string> = { "halt-watch": "/status/halts", "price-relay": "/proof" };

function summaryOf(rows: StatusRow[]): { text: string; tone: BoardTone } {
  const n = (t: BoardTone) => rows.filter((r) => r.tone === t).length;
  if (n("bad")) return { text: STATUS.summary.bad(n("bad")), tone: "bad" };
  if (n("warn")) return { text: STATUS.summary.warn(n("warn")), tone: "warn" };
  if (n("wait")) return { text: STATUS.summary.wait(n("wait")), tone: "wait" };
  return { text: STATUS.summary.good(rows.length), tone: "good" };
}

function Attention({ rows }: { rows: StatusRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="status-attention">
      <h2 id="status-attention" className="type-title text-ink">{STATUS.attention}</h2>
      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => (
          <li key={r.id} className={cn("flex gap-3 rounded-xl px-5 py-4 ring-1", TONE[r.tone].wash)}>
            <span aria-hidden className={cn("mt-2 size-2.5 shrink-0 rounded-full", TONE[r.tone].dot)} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="type-body-strong text-ink">{r.label}</span>
                <span className={cn("shrink-0 font-mono type-body font-bold tabular-nums", TONE[r.tone].ink)}>{r.figure}</span>
              </div>
              <p className="type-caption text-ink-secondary">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Systems({ rows }: { rows: StatusRow[] }) {
  const groups = new Map<StatusGroup, StatusRow[]>();
  for (const r of rows) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);
  const worst = (list: StatusRow[]) => Math.min(...list.map((r) => RANK[r.tone]));
  const ordered = [...groups.entries()]
    .map(([name, list], i) => ({ name, i, list: [...list].sort((a, b) => RANK[a.tone] - RANK[b.tone]) }))
    .sort((a, b) => worst(a.list) - worst(b.list) || a.i - b.i);
  const open = ordered.filter((g) => worst(g.list) <= 1).map((g) => g.name);
  const stacks = [ordered.filter((_, i) => i % 2 === 0), ordered.filter((_, i) => i % 2 === 1)];
  return (
    <section className="flex flex-col gap-3" aria-labelledby="status-all">
      <h2 id="status-all" className="type-title text-ink">{STATUS.allChecks(rows.length)}</h2>
      <div className="grid items-start gap-3 lg:grid-cols-2">
        {stacks.map((stack, i) => (
          <BoardStack key={i} open={open}>
            {stack.map(({ name, list }) => {
              const Glyph = GLYPH[name];
              const summary = summaryOf(list);
              return (
                <SystemItem key={name} value={name} glyph={<Glyph aria-hidden className="size-4.5 text-ink" />} name={name} summary={summary.text} summaryTone={summary.tone} dots={list.map((r) => r.tone)}>
                  {list.map((r) => (
                    <CheckLine key={r.id} tone={r.tone} label={r.label} figure={r.figure} detail={r.detail} href={LINKS[r.id]} />
                  ))}
                </SystemItem>
              );
            })}
          </BoardStack>
        ))}
      </div>
    </section>
  );
}

export function StatusBoard({ initial }: { initial: StatusReport }) {
  const report = useStatus(initial);
  const tone: BoardTone = report.overall === "healthy" ? "good" : report.overall === "waiting" ? "wait" : report.overall === "degraded" ? "warn" : "bad";
  const attention = report.rows.filter((r) => r.tone !== "good").sort((a, b) => RANK[a.tone] - RANK[b.tone]);
  const slowest = attention[0] ?? null;
  const at = new Date(report.checkedAtMs).toISOString().slice(11, 16);
  return (
    <>
      <BoardBanner
        tone={tone}
        eyebrow={STATUS.eyebrow}
        verdict={STATUS.verdict(report)}
        sub={slowest ? STATUS.slowest(slowest.label, slowest.figure) : report.overall === "unreachable" ? STATUS.noAnswer : STATUS.allFresh}
        figureLabel={STATUS.head}
        figure={report.head === null ? STATUS.noHead : report.head.toLocaleString("en-US")}
        tally={(["good", "bad", "warn", "wait"] as const).map((t) => ({ tone: t, n: report.rows.filter((r) => r.tone === t).length, word: STATUS.tally[t] }))}
        pulse={report.rows.map((r) => ({ id: r.id, label: `${r.label} · ${STATUS.tone[r.tone]}`, tone: r.tone }))}
      />
      <Attention rows={attention} />
      <Systems rows={report.rows} />
      <footer className="status-checked">
        <CountdownRing key={report.checkedAtMs} startMs={report.checkedAtMs} endMs={report.checkedAtMs + STATUS_POLL_MS} size="sm" />
        <span>{STATUS.checked(`${at} UTC`)}</span>
      </footer>
    </>
  );
}
