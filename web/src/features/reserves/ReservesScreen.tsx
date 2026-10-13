"use client";
/**
 * `/reserves` (R4-12, D-227; S14 14w): is every bridged stock backed? Ported from Owarine 90a91d71 `features/earn`
 * (the hero over the reserve's own numbers, `ReserveBounds`), `features/proof/ReverifyChecks.tsx` (status rows) and
 * `features/funding/CcRailPanel.tsx` (the one covered sentence). Phone: the verdict and Re-check in the first screen,
 * then one row per ticker with its partition bar; from 1024 px the rows read as a table and a right column holds the
 * 30-day history (21st 26906) and the log of re-checks and alerts (21st 25163). Everything shown was read — the
 * Robinhood column says "Not live yet" until its lockboxes exist (owner-actions S14c). The stage pads; this adds none.
 */
import { reserveVerdict, type ReserveVerdict } from "@cwf/core";
import Link from "next/link";
import { useState } from "react";
import { ErrorState, LoadingState } from "@/components/states";
import { AuditLog, type AuditLogItem } from "@/components/ui/audit-log";
import { StatusBar, type StatusDay, type StatusDayTone } from "@/components/ui/status-bar";
import { useNowMs } from "@/components/data/useNowMs";
import { webEnv } from "@/lib/env";
import { blockText } from "../bridge/format";
import { RESERVES } from "./copy";
import { TickerRow } from "./TickerRow";
import { useReserves, type ReserveHistory, type RecheckEntry } from "./useReserves";
import { VerdictHero } from "./VerdictHero";
import "@/styles/bridge-kit.css";
import "./reserves.css";

const network = webEnv.markets.network;
const TONE: Record<ReserveVerdict, StatusDayTone> = { backed: "ok", partial: "warn", short: "bad" };
const RANK: Record<ReserveVerdict, number> = { backed: 0, partial: 1, short: 2 };
const LOG_TONE = { backed: "ok", partial: "warn", short: "bad" } as const;

function days(history: ReserveHistory | null, nowMs: number): StatusDay[] {
  const byDay = new Map<string, { verdict: ReserveVerdict; n: number }>();
  for (const rows of Object.values(history?.days ?? {})) {
    for (const r of rows) {
      const prev = byDay.get(r.day);
      byDay.set(r.day, { verdict: !prev || RANK[r.verdict] > RANK[prev.verdict] ? r.verdict : prev.verdict, n: (prev?.n ?? 0) + r.snapshots });
    }
  }
  return Array.from({ length: 30 }, (_, i) => {
    const day = new Date(nowMs - (29 - i) * 86_400_000).toISOString().slice(0, 10);
    const hit = byDay.get(day);
    return { day, tone: hit ? TONE[hit.verdict] : "none", label: hit ? RESERVES.history.day(day, RESERVES.verdict[hit.verdict].word, hit.n) : `${day} · ${RESERVES.history.none}` };
  });
}

function logItems(log: readonly RecheckEntry[], history: ReserveHistory | null): AuditLogItem[] {
  const time = (ms: number) => new Date(ms).toISOString().slice(5, 16).replace("T", " ");
  const checks = log.map((e) => ({ at: e.atMs, item: { id: `r${e.atMs}`, time: time(e.atMs), title: RESERVES.log.recheck, tag: RESERVES.verdict[e.verdict].word, tone: LOG_TONE[e.verdict], detail: RESERVES.log.blocks(blockText(e.tempoBlock)) } }));
  const alerts = (history?.alerts ?? []).map((a) => ({ at: a.atMs, item: { id: `a${a.atMs}${a.ticker}`, time: time(a.atMs), title: `b${a.ticker}`, tag: RESERVES.log.alert, tone: "bad" as const, detail: a.alert ?? undefined } }));
  return [...checks, ...alerts].sort((a, b) => b.at - a.at).map((x) => x.item);
}

export function ReservesScreen() {
  const { view, history, steps, log, recheck } = useReserves();
  const [busy, setBusy] = useState(false);
  const nowMs = useNowMs() || Date.now();
  const run = async () => {
    setBusy(true);
    await recheck().finally(() => setBusy(false));
  };
  return (
    <div className="rsv-page">
      <header className="rsv-head">
        <div className="rsv-head-text">
          <h1 className="rsv-title">{RESERVES.title}</h1>
          <p className="rsv-line">{RESERVES.line}</p>
        </div>
        <Link href="/bridge" className="rsv-link">{RESERVES.bridge}</Link>
      </header>
      <div className="rsv-grid">
        <div className="rsv-main">
          {!view ? (
            <LoadingState shape="hero" label={RESERVES.reading} />
          ) : !view.ok ? (
            <ErrorState diagnosis={view.error} retry={() => void run()} />
          ) : (
            <>
              <VerdictHero verdict={reserveVerdict(view.value.tickers.map((t) => t.check))} view={view.value} steps={steps} busy={busy} onRecheck={() => void run()} />
              <div className="rsv-table" role="group" aria-label={RESERVES.title}>
                <div className="rsv-colheads" aria-hidden>
                  <span>{RESERVES.ticker}</span>
                  <span>{RESERVES.locked}</span>
                  <span>{RESERVES.onTempo}</span>
                  <span>{RESERVES.inFlight}</span>
                  <span>{RESERVES.held}</span>
                  <span>{RESERVES.check}</span>
                </div>
                <ul className="rsv-rows">
                  {view.value.tickers.map((t) => (
                    <TickerRow key={t.ticker} t={t} network={network} nowSec={Math.floor(nowMs / 1000)} />
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
        <aside className="rsv-side">
          <section className="rsv-panel" aria-label={RESERVES.history.label}>
            <h2 className="rsv-h2">{RESERVES.history.title}</h2>
            <StatusBar days={days(history, nowMs)} label={RESERVES.history.label} startText={RESERVES.history.start} endText={RESERVES.history.end} />
          </section>
          <section className="rsv-panel" aria-label={RESERVES.log.label}>
            <h2 className="rsv-h2">{RESERVES.log.title}</h2>
            <AuditLog items={logItems(log, history)} label={RESERVES.log.label} empty={RESERVES.log.empty} />
          </section>
        </aside>
      </div>
    </div>
  );
}
