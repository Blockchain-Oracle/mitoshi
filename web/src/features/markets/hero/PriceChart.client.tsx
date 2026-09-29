"use client";
/**
 * The hero chart (Ported from Masayume 68f7a09:web/src/features/markets/hero/PriceChart.client.tsx) with the readout and
 * keyboard scrub of 21st.dev 20107 ssychui/candle-chart around it (E.1): lightweight-charts 5 draws the Window's signed
 * feed — history once with `setData`, then each live tick with `series.update` outside React (D-049) — and the opening
 * print is the priced line. Pointer or arrow keys move a crosshair; a readout card (`role="status"`) says the time, the
 * price and how far it sits from the line (the one hue-carrying number, 20107's "Chg"); Escape returns to live. Theme
 * from the container's tokens, never literals. Docs: lightweight-charts v5.2 "Update or add data", `createPriceLine`,
 * `subscribeCrosshairMove`, `setCrosshairPosition`.
 */
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart, type AutoscaleInfo, type IChartApi, type IPriceLine, type ISeriesApi, type MouseEventParams, type Time, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { HERO } from "../copy";
import type { ChartPoint } from "../data/useChartSeries";
import { toChartValue, usd2 } from "../units";

export interface PriceChartProps {
  points: readonly ChartPoint[];
  openingRaw: bigint | null;
  className?: string;
  /** The hero's full chart takes the readout and the scrub; the ticket's mini chart is a picture. */
  interactive?: boolean;
}

interface Built {
  chart: IChartApi;
  series: ISeriesApi<"Line">;
  priceLine: IPriceLine | null;
  lastTime: number;
  count: number;
}

export function cssVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || "currentColor";
}

function build(container: HTMLDivElement, interactive: boolean): Built {
  const muted = cssVar(container, "--color-ink-muted");
  const chart = createChart(container, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: muted, fontFamily: cssVar(container, "--font-data"), attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: cssVar(container, "--color-hairline") } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    crosshair: interactive ? { mode: CrosshairMode.Magnet, vertLine: { color: muted, labelVisible: false }, horzLine: { color: muted, labelVisible: true } } : { mode: CrosshairMode.Hidden },
    handleScroll: false,
    handleScale: false,
  });
  const series = chart.addSeries(LineSeries, { color: cssVar(container, "--color-ink"), lineWidth: 2, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "price", precision: 2, minMove: 0.01 } });
  return { chart, series, priceLine: null, lastTime: 0, count: 0 };
}

function includeInAutoscale(series: ISeriesApi<"Line">, price: number): void {
  series.applyOptions({
    autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
      const info = original();
      if (!info?.priceRange) return info;
      return { ...info, priceRange: { minValue: Math.min(info.priceRange.minValue, price), maxValue: Math.max(info.priceRange.maxValue, price) } };
    },
  });
}

const timeText = (sec: number) => new Date(sec * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

export function PriceChartClient({ points, openingRaw, className, interactive = false }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const builtRef = useRef<Built | null>(null);
  const pointsRef = useRef(points);
  const [cursor, setCursor] = useState<number | null>(null);
  pointsRef.current = points;

  useEffect(() => {
    if (!containerRef.current) return;
    const built = build(containerRef.current, interactive);
    builtRef.current = built;
    const onMove = (param: MouseEventParams<Time>) => {
      if (param.time === undefined || !param.point) return setCursor(null);
      const idx = pointsRef.current.findIndex((p) => p.timeSec === Number(param.time));
      setCursor(idx >= 0 ? idx : null);
    };
    if (interactive) built.chart.subscribeCrosshairMove(onMove);
    return () => {
      if (interactive) built.chart.unsubscribeCrosshairMove(onMove);
      built.chart.remove();
      builtRef.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const built = builtRef.current;
    if (!built || points.length === 0) return;
    const appendOnly = built.count > 0 && points.length >= built.count && points.length - built.count <= 3 && points[built.count - 1]?.timeSec === built.lastTime;
    if (appendOnly) {
      for (const p of points.slice(built.count)) built.series.update({ time: p.timeSec as UTCTimestamp, value: toChartValue(p.valueRaw) });
    } else {
      built.series.setData(points.map((p) => ({ time: p.timeSec as UTCTimestamp, value: toChartValue(p.valueRaw) })));
      built.chart.timeScale().fitContent();
    }
    built.count = points.length;
    built.lastTime = points.at(-1)!.timeSec;
  }, [points]);

  useEffect(() => {
    const built = builtRef.current;
    const container = containerRef.current;
    if (!built || !container || openingRaw === null || built.priceLine) return;
    const price = toChartValue(openingRaw);
    includeInAutoscale(built.series, price);
    built.priceLine = built.series.createPriceLine({ price, color: cssVar(container, "--color-ink-secondary"), lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: HERO.openingPrint });
  }, [openingRaw]);

  const moveTo = (idx: number | null) => {
    const built = builtRef.current;
    setCursor(idx);
    if (!built) return;
    if (idx === null) return built.chart.clearCrosshairPosition();
    const p = pointsRef.current[idx];
    if (p) built.chart.setCrosshairPosition(toChartValue(p.valueRaw), p.timeSec as UTCTimestamp, built.series);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = points.length;
    if (n === 0) return;
    if (e.key === "Escape") return moveTo(null);
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      return moveTo(e.key === "Home" ? 0 : n - 1);
    }
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    moveTo(Math.max(0, Math.min(n - 1, (cursor ?? n - 1) + (e.key === "ArrowRight" ? 1 : -1))));
  };

  const shown = cursor !== null ? points[cursor] : null;
  const diff = shown && openingRaw !== null ? shown.valueRaw - openingRaw : null;
  const flip = cursor !== null && cursor > points.length / 2;
  return (
    <div className={cn("relative h-56 w-full", className)}>
      <div
        ref={containerRef}
        className="h-full w-full rounded-md focus-visible:outline-(--focus-ring)"
        tabIndex={interactive ? 0 : -1}
        role="img"
        aria-label={interactive ? `${HERO.chartLabel("", usd2(openingRaw ?? 0n), points.at(-1) ? usd2(points.at(-1)!.valueRaw) : "—")}. ${HERO.scrubHint}` : undefined}
        aria-hidden={interactive ? undefined : true}
        onKeyDown={interactive ? onKeyDown : undefined}
        onBlur={() => cursor !== null && moveTo(null)}
      />
      {interactive && shown ? (
        <div role="status" className={cn("pointer-events-none absolute top-1 z-10 min-w-32 rounded-md border border-hairline bg-surface-2 px-3 py-2", flip ? "left-2" : "right-14")}>
          <div className="type-label-micro text-ink-muted">{timeText(shown.timeSec)}</div>
          <div className="mt-1 type-data text-ink">{usd2(shown.valueRaw)}</div>
          {diff !== null ? (
            <div className={cn("type-caption numbers", diff >= 0n ? "text-profit" : "text-loss")}>
              {diff >= 0n ? "+" : "−"}{usd2(diff < 0n ? -diff : diff)} {HERO.vsLine}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default PriceChartClient;
