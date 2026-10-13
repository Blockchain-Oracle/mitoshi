"use client";
/**
 * The reserve card (R4-7, D-227; R6 money S09, D-230) — what a supplier earned, first. Senryo's Earn (P5, D-325) on
 * Owarine 90a91d71's black money card (`.money-hero`): the return since launch in words and tone ("Suppliers −1.09%",
 * the loss colour when it's a loss), how long that is ("since launch · 14 d") with the reserve's risk one tap away (the
 * (i), From 21st.dev 398 originui/popover), the share price small under it, the share-price line from the reserve's own
 * indexed history (`ShareChart`, 29532) over 7D · 30D · All ending on the live price, what $100 did over the same span,
 * then Idle and the reserve's committed word as one split bar (kit `CapitalBar`, From 21st.dev 35046
 * kuratlielia/usage-meter) under its Value line. Never a projected yield: the chain can't back one. A status chip shows only when
 * the reserve is paused or the maker is off. While the sheet answers the page's skeleton holds the box; while the
 * history answers only the chart frame waits.
 */
import { oneUnit, type ReserveKind, type ReserveSheet } from "@cwf/core";
import { earnHistoryKeys, useReserveHistory, useReserveLaunchedAt } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import type { HistoryRange } from "@cwf/markets/earn";
import { useState } from "react";
import { CapitalBar } from "@/components/kit/CapitalBar";
import { Pill } from "@/components/kit/Pill";
import { PendingRoute } from "@/components/shell/CapabilityPending";
import { StateFrame } from "@/components/states/EmptyState";
import { RangeSelector } from "@/components/ui/chart-engine";
import { InfoPopover } from "@/components/ui/info-popover";
import { useNowMs } from "@/lib/clock";
import { EARN } from "./copy";
import { bpsPct, formatSharePrice, money2 } from "./format";
import type { ReserveWords } from "./reserves";
import { ageDays, hundredBecame, rangeReturn, sinceLaunch, type ReturnRead } from "./returns";
import { ShareChart, type SharePoint } from "./ShareChart";
import "@/components/kit/kit.css";

interface ReserveCardProps {
  sheet: ReserveSheet;
  words: ReserveWords;
  /** The maker vault's extra state: quoting is off without a maker key, whatever the sheet says. */
  makerOff?: boolean;
}

const RANGE_OF: Record<string, HistoryRange> = { "7D": "7d", "30D": "30d", All: "all" };
const LABEL_OF: Record<HistoryRange, string> = { "7d": "7D", "30d": "30D", all: "All" };
const MONTH_DAYS = 30;

/** The series the chart draws: the stored points, ending on the live sheet's price (the line ends where the card reads). */
function withLive(points: readonly { atSec: number; sharePriceRaw: bigint }[], live: bigint, nowMs: number): { atSec: number; sharePriceRaw: bigint }[] {
  const last = points.at(-1);
  const nowSec = Math.floor(nowMs / 1000);
  return last && nowSec > last.atSec ? [...points, { atSec: nowSec, sharePriceRaw: live }] : [...points];
}

/** The reserve's launch time and its default range: All while it is younger than a month (30D would be all of it). */
function useDefaultRange(kind: ReserveKind): { age: number | null; range: HistoryRange } {
  const nowMs = useNowMs();
  const launched = useReserveLaunchedAt(kind);
  const launchedAtSec = launched?.ok ? launched.value : null;
  const age = launchedAtSec !== null && nowMs > 0 ? ageDays(launchedAtSec, Math.floor(nowMs / 1000)) : null;
  return { age, range: age !== null && age >= MONTH_DAYS ? "30d" : "all" };
}

/** Starts the card's reads beside the page's vault read, so the line lands with the card instead of after it. */
export function useReserveCardEarly(kind: ReserveKind) {
  useReserveHistory(kind, useDefaultRange(kind).range);
}

export function ReserveCard({ sheet, words, makerOff = false }: ReserveCardProps) {
  const { card } = EARN;
  const kind = sheet.kind as ReserveKind;
  const one = oneUnit(sheet.decimals);
  const nowMs = useNowMs();
  const [picked, setPicked] = useState<HistoryRange | null>(null);
  const { age, range: fallback } = useDefaultRange(kind);
  const range: HistoryRange = picked ?? fallback;
  const history = useReserveHistory(kind, range);
  const queryClient = useQueryClient();
  const status = sheet.paused ? card.paused : makerOff ? card.noMaker : null;
  const usd = (base: bigint) => money2(base, sheet.decimals);

  const since = sinceLaunch(sheet.sharePriceRaw, one);
  const series = history?.ok && nowMs > 0 ? withLive(history.value.points, sheet.sharePriceRaw, nowMs) : [];
  const ranged: ReturnRead | null = range === "all" ? since : rangeReturn(series);
  const first = range === "all" ? one : series[0]?.sharePriceRaw ?? null;
  const hundred = first !== null ? hundredBecame(first, sheet.sharePriceRaw, sheet.decimals) : null;
  const chartTone = ranged?.tone ?? since.tone;
  const points: SharePoint[] = series.map((p) => ({ tMs: p.atSec * 1000, price: Number(p.sharePriceRaw) / Number(one) }));

  const chips = <RangeSelector ranges={["7D", "30D", "All"]} value={LABEL_OF[range]} onChange={(r) => setPicked(RANGE_OF[r] ?? "all")} label={card.rangeLabel} />;
  // Every face of the frame keeps the chips' row, so changing range never moves the card.
  const head = <div className="ea-chart-head"><span />{chips}</div>;
  const chart = history === null ? (
    <>
      {head}
      <div className="ea-chart-box ea-chart-wait" role="status" aria-busy="true" aria-label={card.chartLabel}>
        {[0, 1, 2, 3].map((i) => <span key={i} className="ea-chart-rule" />)}
      </div>
    </>
  ) : !history.ok ? (
    <>
      {head}
      <StateFrame
        size="inline"
        tone="warning"
        role="alert"
        title={card.historyError}
        className="ea-chart-box ea-chart-state"
        actions={<Pill tone="white" size="sm" onClick={() => void queryClient.invalidateQueries({ queryKey: earnHistoryKeys.history(kind, range) })}>{card.retry}</Pill>}
      />
    </>
  ) : points.length < 2 ? (
    <>
      {head}
      <p className="ea-chart-box ea-chart-state ea-chart-note">{card.lineEmpty}</p>
    </>
  ) : (
    <ShareChart points={points} tone={chartTone} label={card.chartLabel} caption={card.chartCaption} aside={chips} />
  );

  return (
    <section className="money-hero ea-rc" aria-label={`${words.label} · ${card.label}`}>
      <div className="ea-rc-top">
        <div className="ea-rc-return">
          <span className="ea-rc-figure numbers" data-tone={since.tone}>{card.suppliers(since.text)}</span>
          <span className="ea-rc-since">
            {card.sinceLaunch(age)}
            <InfoPopover label={card.why} className="ea-rc-info">{words.risk}</InfoPopover>
          </span>
        </div>
        {status ? <span className="ea-rc-status">{status}</span> : null}
      </div>
      <p className="ea-rc-price numbers">{card.perShare(formatSharePrice(sheet.sharePriceRaw, sheet.decimals))}</p>
      <div className="ea-rc-chart">
        {chart}
      </div>
      {hundred !== null && (range === "all" || series.length > 1) ? (
        <p className="ea-rc-hundred numbers" data-tone={ranged?.tone ?? "flat"}>{card.hundred[range](usd(hundred))}</p>
      ) : null}
      <div className="ea-rc-split">
        <p className="ea-rc-value numbers">{card.valueLine(usd(sheet.totalValueBase))}</p>
        <CapitalBar
          label={card.label}
          format={usd}
          className="ea-rc-bar"
          segments={[
            { id: "idle", label: card.idle, valueBase: sheet.liquidBase, color: "var(--ea-rc-idle)", fixed: true },
            { id: "committed", label: words.committed, valueBase: sheet.committedBase, color: "var(--color-accent)", fixed: true, extra: bpsPct(sheet.utilizationBps) },
          ]}
        />
      </div>
    </section>
  );
}

/** No maker vault on this network: the registered pending page, with what it waits on. */
export function NotDeployed() {
  return <PendingRoute route="/earn" />;
}
