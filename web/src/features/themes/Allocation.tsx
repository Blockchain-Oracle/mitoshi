// A theme's mix (R6, D-230; D-231) — From 21st.dev 20086 ssychui/sectors-donut, revamped per D-044: the ring of arcs
// around a centred figure, one legend row per slice, and hovering (or focusing) a row or an arc dims the rest so one
// weight reads at a time. Changed: the legend rows are the stocks themselves, in the anatomy of 21st.dev 8704
// kavikatiyar/stock-portfolio-card's Holdings (the issuer's disc · symbol over company and last close · weight over the
// biggest call it takes), so ring and list are one control; percents from basis points; the ramp is Mitoshi's
// (`--th-slice-*`); framer-motion's fades → CSS transitions (none under reduced motion); arcs and rows are keyboard-
// reachable buttons. A basket holds no shares — the weight is each stock's share of every call. Refero: Acorns' fund
// detail Top holdings (67453e13-b022-4c81-87ef-a68881d79677) for the rows; Acorns' recommended portfolio
// (e2bd5833-b4cc-4e5f-8bd9-d96cea0dc7cb — one donut with the figure in its hole) for the ring. Rendered on the server
// once the closes are read, with only the hover in the browser (`AllocationRing`).
import { basketStakeBase, type BasketSpec } from "@cwf/core";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { AllocationRing, type AllocRow } from "./AllocationRing";
import { THEMES } from "./copy";
import { companyOf, pct, sliceColor, usd6, usdFloat } from "./format";
import type { ThemeMix } from "./themes.server";

export async function Allocation({ spec, perTradeBase, mix }: { spec: BasketSpec; perTradeBase: bigint; mix: Promise<ThemeMix> }) {
  const lastBy = await mix.then((m) => m.lastBy).catch(() => ({}) as Record<string, number | null>);
  const rows: AllocRow[] = spec.members.map((m, i) => {
    const last = lastBy[m.symbol] ?? null;
    return {
      id: m.symbol, symbol: m.symbol, sub: last === null ? companyOf(m.symbol) : `${companyOf(m.symbol)} · ${usdFloat(last)}`,
      bps: m.weightBps, pct: pct(m.weightBps), call: THEMES.theme.perCall(usd6(basketStakeBase(perTradeBase, m.weightBps))), color: sliceColor(i),
    };
  });
  const marks = rows.map((r) => <AssetDisc key={r.id} asset={r.symbol} className="th-holding-mark" />);
  return <AllocationRing rows={rows} marks={marks} count={spec.members.length} />;
}
