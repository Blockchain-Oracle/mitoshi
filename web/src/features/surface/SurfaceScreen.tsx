"use client";
/**
 * `/surface` (S10e; plan "31861 table + 30538 sparklines"; Ported in role from Masayume 68f7a09:web/src/features/surface/
 * SurfaceScreen.tsx — the crumb, title, intro, the asset chips, then the structure): every live Window of the chosen
 * asset as a sortable 31861 table, nearest close first, each with its 30538 price path since the open, the book's UP
 * ask and bid, the fair-value guard's model where the Series has one, and the book's distance from it; a row expands to
 * the Window's depth. No figure the chain or the signed feed did not give: hydrating is "…", an empty side "—".
 */
import { useCallback, useMemo, useState } from "react";
import { ReadingBoundary } from "@/components/states";
import { Table, TableBody, TableHead, TableHeader, TableRow, type SortDirection } from "@/components/ui/data-table";
import { useNowMs } from "@/lib/clock";
import { cn } from "@/lib/utils";
import { SURFACE } from "./copy";
import { SURFACE_COLUMNS as C, SurfaceRow } from "./SurfaceRow";
import { useSurfaceSelection, type RowFigures } from "./useSurface";
import "@/styles/surface.css";

type SortKey = "closes" | "up" | "model" | "gap" | "spread";

/** The guard models a Series only with its σ set and a spot source for its ticker (the reserves refuse the rest). */
const isModelled = (m: { sigmaE8: bigint; feed: string | null } | undefined) => m !== undefined && m.sigmaE8 > 0n && m.feed !== null;

export function SurfaceScreen() {
  const nowMs = useNowMs();
  const sel = useSurfaceSelection();
  const [figures, setFigures] = useState<Record<string, RowFigures>>({});
  const [sort, setSort] = useState<{ key: SortKey; dir: Exclude<SortDirection, null> }>({ key: "closes", dir: "asc" });
  const [open, setOpen] = useState<string | null>(null);
  const onFigures = useCallback((id: string, f: RowFigures) => setFigures((prev) => (prev[id] === f ? prev : { ...prev, [id]: f })), []);

  const rows = useMemo(() => {
    const value = (id: string, expirySec: number): number | null => {
      const f = figures[id];
      if (sort.key === "closes") return expirySec;
      if (!f) return null;
      if (sort.key === "up") return f.upAskBps;
      if (sort.key === "spread") return f.spreadBps;
      const fair = f.fairUpE6 === null ? null : Number(f.fairUpE6) / 100;
      if (sort.key === "model") return fair;
      return fair !== null && f.upAskBps !== null ? f.upAskBps - fair : null;
    };
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...sel.rows].sort((a, b) => {
      const va = value(a.market.marketId, a.market.expirySec);
      const vb = value(b.market.marketId, b.market.expirySec);
      if (va === null && vb === null) return a.market.expirySec - b.market.expirySec;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va - vb) * sign;
    });
  }, [sel.rows, figures, sort]);

  const head = (key: SortKey) => ({ sortDirection: sort.key === key ? sort.dir : null, onSort: () => setSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" })) });

  return (
    <div className="sf mx-auto flex w-full max-w-(--content-wide) flex-col gap-6 px-gutter py-8">
      <header className="flex flex-col gap-2">
        <span className="type-label-micro text-ink-secondary">{SURFACE.eyebrow}</span>
        <h1 className="type-display text-ink">{SURFACE.title}</h1>
        <p className="max-w-(--content-reading) type-body text-ink-secondary">{SURFACE.intro}</p>
      </header>
      <ReadingBoundary reading={sel.reading} shape="table" isEmpty={(set) => set.lanes.every((l) => l.markets.length === 0)} empty={{ why: SURFACE.noLive }}>
        {() => (
          <>
            <div role="radiogroup" aria-label={SURFACE.assets} className="flex gap-2 overflow-x-auto pb-1">
              {sel.assets.map((a) => (
                <button key={a} type="button" role="radio" aria-checked={sel.asset === a} onClick={() => { sel.setAsset(a); setOpen(null); }} className={cn("min-h-touch shrink-0 rounded-full border px-4 type-body-strong", sel.asset === a ? "border-border-strong bg-surface-2 text-ink" : "border-hairline text-ink-secondary")}>
                  {a}
                </button>
              ))}
            </div>
            <Table label={`${SURFACE.table} · ${sel.asset ?? ""}`} density="compact">
              <TableHeader>
                <TableRow>
                  <th scope="col" className="w-12"><span className="sr-only">{SURFACE.detail.depth}</span></th>
                  <TableHead>{C.window}</TableHead>
                  <TableHead align="end" {...head("closes")}>{C.closes}</TableHead>
                  <TableHead>{C.path}</TableHead>
                  <TableHead align="end" className="max-md:hidden">{C.open}</TableHead>
                  <TableHead align="end" {...head("up")}>{C.up}</TableHead>
                  <TableHead align="end" className="max-md:hidden">{C.bid}</TableHead>
                  <TableHead align="end" {...head("model")}>{C.model}</TableHead>
                  <TableHead align="end" className="max-md:hidden" {...head("gap")}>{C.gap}</TableHead>
                  <TableHead align="end" className="max-md:hidden" {...head("spread")}>{`${C.spread} · ${C.depth}`}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody animatedSort>
                {rows.map((w) => (
                  <SurfaceRow key={w.market.marketId} w={w} modelled={isModelled(sel.models?.get(w.market.seriesId.toLowerCase()))} nowMs={nowMs} expanded={open === w.market.marketId} onToggle={() => setOpen((o) => (o === w.market.marketId ? null : w.market.marketId))} onFigures={onFigures} />
                ))}
              </TableBody>
            </Table>
            <p className="max-w-(--content-reading) type-caption text-ink-secondary">{SURFACE.foot}</p>
          </>
        )}
      </ReadingBoundary>
    </div>
  );
}
