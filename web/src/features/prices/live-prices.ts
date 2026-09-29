/**
 * The ticker's live data (L-04, D-049), loaded on idle by `LiveMarquee`: the page's shared stream connection
 * (`@cwf/markets/stream`), topic `prices`, reduced to one latest tick per listed ticker (the ops feed also publishes a
 * `-24` session variant; the fresher of the two wins). Cells are in the registry's order; a figure is formatted from
 * the integer `priceE8` (no float), and the arrow compares with the previous tick for that ticker.
 */
import { TICKER_SYMBOLS } from "@cwf/core/market";
import { isPriceTick, subscribeTopic, type PriceTick } from "@cwf/markets/stream";
import type { MarqueeCell } from "@/components/shell/Marquee";
import { ensureStream } from "./stream-config";

/** `priceE8` → "$64,000.12" (two decimals; sub-dollar prices keep four). */
export function formatE8(priceE8: string): string {
  const v = BigInt(priceE8);
  const whole = v / 100_000_000n;
  const dp = whole === 0n ? 4 : 2;
  const frac = ((v % 100_000_000n) / 10n ** BigInt(8 - dp)).toString().padStart(dp, "0");
  return `$${whole.toLocaleString("en-US")}.${frac}`;
}

export function startLivePrices(onCells: (cells: MarqueeCell[]) => void): () => void {
  if (!ensureStream()) return () => undefined;
  const latest = new Map<string, PriceTick>();
  const previous = new Map<string, bigint>();
  return subscribeTopic("prices", (events) => {
    for (const e of events) {
      if (e.event !== "price" || !isPriceTick(e.data)) continue;
      const base = e.data.symbol.replace(/-24$/, "");
      const held = latest.get(base);
      if (held && held.publishTimeSec > e.data.publishTimeSec) continue;
      if (held) previous.set(base, BigInt(held.priceE8));
      latest.set(base, { ...e.data, symbol: base });
    }
    const cells: MarqueeCell[] = [];
    for (const symbol of TICKER_SYMBOLS) {
      const tick = latest.get(symbol);
      if (!tick) continue;
      const now = BigInt(tick.priceE8);
      const before = previous.get(symbol);
      cells.push({ label: symbol, value: formatE8(tick.priceE8), direction: before === undefined || before === now ? "" : now > before ? "up" : "down" });
    }
    if (cells.length) onCells(cells);
  });
}
