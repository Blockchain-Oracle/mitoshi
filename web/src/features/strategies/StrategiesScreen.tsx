"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/StrategiesScreen.tsx — Copy · Yours · Create over the
// registry (the index), the copy drawer, the latest copy trades; `?strategy=<id>` opens one, `?view=` picks the tab.
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { LoadingState } from "@/components/states/LoadingState";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { CopyDrawer } from "./CopyDrawer";
import { STRATEGIES as S } from "./copy";
import { stopIntent } from "./copy-plan";
import { CreatorStudio } from "./CreatorStudio";
import type { StrategyWire } from "./protocol";
import { RecentCopyTrades } from "./RecentCopyTrades";
import { StrategyCard } from "./StrategyCard";
import { useCopyWrites } from "./useCopyWrites";
import { useStrategies } from "./useStrategies";

type View = (typeof S.views)[number]["value"];

export function StrategiesScreen() {
  const reading = useStrategies();
  const writes = useCopyWrites();
  const [view, setView] = useState<View>("copy");
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("view");
    if (v === "copy" || v === "yours" || v === "create") setView(v);
    const id = q.get("strategy");
    if (id && /^\d+$/.test(id)) setOpenId(id);
  }, []);
  const payload = reading.data;
  const strategies = payload?.strategies ?? [];
  const copyingOf = (id: string): "none" | "follow" | "fade" => writes.mine.find((m) => m.strategyId === id && m.active)?.mode ?? "none";
  const wallet = writes.wallet?.toLowerCase() ?? null;
  const visible = useMemo(() => {
    if (view === "yours") return strategies.filter((s) => s.creator === wallet || copyingOf(s.strategyId) !== "none");
    return strategies.filter((s) => s.active || copyingOf(s.strategyId) !== "none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategies, view, wallet, writes.mine]);
  const card: StrategyWire | null = strategies.find((s) => s.strategyId === openId) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-(--content-wide) flex-col gap-6 px-gutter py-8 lg:px-gutter-desktop">
      <header className="flex flex-col gap-2">
        <span className="type-label-micro text-ink-secondary">{S.eyebrow}</span>
        <h1 className="type-display text-ink">{S.title}</h1>
        <p className="max-w-(--content-reading) type-body text-ink-secondary">{S.lead}</p>
      </header>
      <SegmentedControl label={S.viewsLabel} options={S.views} value={view} onValueChange={setView} />

      {view === "create" ? (
        <CreatorStudio writes={writes} onPublished={(id) => {
          setView("yours");
          setOpenId(id);
        }} />
      ) : reading.isPending ? (
        <LoadingState shape="tiles" label={S.loading} />
      ) : reading.isError && !payload ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg border border-hairline bg-surface-1 px-6 py-8 text-center">
          <p className="type-body-strong text-ink">{S.error}</p>
          <button type="button" onClick={() => void reading.refetch()} className="inline-flex min-h-touch items-center rounded-full border border-hairline px-5 type-body-strong text-ink hover:bg-surface-2">{S.retry}</button>
        </div>
      ) : !payload?.deployed ? (
        <EmptyState why={S.notDeployed} />
      ) : view === "yours" && !writes.signedIn ? (
        <EmptyState why={S.yoursSignedOut} />
      ) : visible.length === 0 ? (
        <EmptyState why={view === "yours" ? S.yoursEmpty : S.empty} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => (
            <StrategyCard
              key={s.strategyId}
              card={s}
              copying={copyingOf(s.strategyId)}
              onOpen={() => setOpenId(s.strategyId)}
              onCopy={() => setOpenId(s.strategyId)}
              onStop={() => void writes.run(stopIntent(s.strategyId, writes.mine, writes.grant))}
            />
          ))}
        </div>
      )}

      {view !== "create" && payload?.deployed && (
        <RecentCopyTrades fills={view === "yours" ? writes.myFills : payload.fills} strategies={strategies} />
      )}
      <p className="max-w-(--content-reading) type-caption text-ink-muted">{S.disclosure}</p>
      <CopyDrawer card={card} strategies={strategies} writes={writes} open={card !== null} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}
