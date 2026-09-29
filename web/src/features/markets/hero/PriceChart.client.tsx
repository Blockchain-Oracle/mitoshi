"use client";
/**
 * Ported from Masayume 68f7a09:web/src/features/markets/hero/PriceChart.client.tsx — lightweight-charts 5 over the
 * Window's signed feed: history once with `setData`, then every live tick with `series.update` outside React (D-049),
 * the opening print as the priced line. Theme from the container's tokens, never literals (docs: lightweight-charts
 * v5.2 intro "Update or add data", `createPriceLine`).
 */
import { ColorType, CrosshairMode, LineSeries, LineStyle, createChart, type AutoscaleInfo, type IChartApi, type IPriceLine, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { HERO } from "../copy";
import type { ChartPoint } from "../data/useChartSeries";
import { PRICE_SCALE, toChartValue } from "../units";

export interface PriceChartProps {
  points: readonly ChartPoint[];
  openingRaw: bigint | null;
  className?: string;
}

interface Built {
  chart: IChartApi;
  series: ISeriesApi<"Line">;
  priceLine: IPriceLine | null;
  lastTime: number;
  count: number;
}

const DISPLAY_DP = 2;

export function cssVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || "currentColor";
}

function build(container: HTMLDivElement): Built {
  const chart = createChart(container, {
    autoSize: true,
    layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: cssVar(container, "--color-ink-muted"), fontFamily: cssVar(container, "--font-data"), attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: cssVar(container, "--color-hairline") } },
    rightPriceScale: { borderVisible: false },
    timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    crosshair: { mode: CrosshairMode.Hidden },
    handleScroll: false,
    handleScale: false,
  });
  const series = chart.addSeries(LineSeries, {
    color: cssVar(container, "--color-ink"),
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
    priceFormat: { type: "price", precision: DISPLAY_DP, minMove: 10 ** -DISPLAY_DP },
  });
  return { chart, series, priceLine: null, lastTime: 0, count: 0 };
}

/** Keeps the opening print inside the visible range; the series alone would autoscale it out of view. */
function includeInAutoscale(series: ISeriesApi<"Line">, price: number): void {
  series.applyOptions({
    autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
      const info = original();
      if (!info?.priceRange) return info;
      return { ...info, priceRange: { minValue: Math.min(info.priceRange.minValue, price), maxValue: Math.max(info.priceRange.maxValue, price) } };
    },
  });
}

export function usePriceChart({ points, openingRaw }: Omit<PriceChartProps, "className">) {
  const containerRef = useRef<HTMLDivElement>(null);
  const builtRef = useRef<Built | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const built = build(containerRef.current);
    builtRef.current = built;
    return () => {
      built.chart.remove();
      builtRef.current = null;
    };
  }, []);

  // History with setData; after that, only new ticks — `series.update` appends without re-laying the series.
  useEffect(() => {
    const built = builtRef.current;
    if (!built || points.length === 0) return;
    const last = points.at(-1)!;
    const appendOnly = built.count > 0 && points.length >= built.count && points.length - built.count <= 3 && points[built.count - 1]?.timeSec === built.lastTime;
    if (appendOnly) {
      for (const p of points.slice(built.count)) built.series.update({ time: p.timeSec as UTCTimestamp, value: toChartValue(p.valueRaw) });
    } else {
      built.series.setData(points.map((p) => ({ time: p.timeSec as UTCTimestamp, value: toChartValue(p.valueRaw) })));
      built.chart.timeScale().fitContent();
    }
    built.count = points.length;
    built.lastTime = last.timeSec;
  }, [points]);

  useEffect(() => {
    const built = builtRef.current;
    const container = containerRef.current;
    if (!built || !container || openingRaw === null || built.priceLine) return;
    const price = toChartValue(openingRaw);
    includeInAutoscale(built.series, price);
    built.priceLine = built.series.createPriceLine({ price, color: cssVar(container, "--color-ink-secondary"), lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: HERO.openingPrint });
  }, [openingRaw]);

  return { containerRef, builtRef };
}

export function PriceChartClient({ points, openingRaw, className }: PriceChartProps) {
  const { containerRef } = usePriceChart({ points, openingRaw });
  return <div ref={containerRef} className={cn("h-56 w-full", className)} data-scale={PRICE_SCALE} />;
}

export default PriceChartClient;
