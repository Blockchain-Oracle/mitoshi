"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/StrategiesScreen.tsx (R4-6, D-227) — the body under the
// nameplate and the workspace pills (StrategiesHead, which StrategiesPage draws from the first paint and which owns the
// view): the creator studio (kept mounted, so a draft and its published state survive a switch), or the archive grid with
// Yours' picker and live desk above it and the recent copy trades. `?strategy=<id>` (that card's drawer) and
// `?copy=<address>` (the mirror preset, that trader in it) are read once after mount. The stage is the inset.
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { LoadingState } from "@/components/states/LoadingState";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { CopyDrawer, type DrawerTab } from "./CopyDrawer";
import { STRATEGIES as S } from "./copy";
import { CreatorStudio } from "./CreatorStudio";
import { LiveDesk } from "./LiveDesk";
import { RecentCopyTrades } from "./RecentCopyTrades";
import type { StrategiesView as View } from "./StrategiesHead";
import { StrategyGrid } from "./StrategyGrid";
import { StrategyPicker } from "./StrategyPicker";
import { useCopyWrites } from "./useCopyWrites";
import { useStrategies } from "./useStrategies";
import "./strategies.css";
import "./builder.css";

export function StrategiesScreen({ view, onView: setView }: { view: View; onView: (v: View) => void }) {
  const reading = useStrategies();
  const writes = useCopyWrites();
  const shell = useWalletShell();
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<DrawerTab | undefined>(undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const [trader, setTrader] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("strategy");
    const copy = q.get("copy");
    if (copy) setTrader(copy);
    if (id && /^\d+$/.test(id)) {
      setOpenId(id);
      setSelected(id);
    }
  }, []);
  const payload = reading.data;
  const strategies = useMemo(() => payload?.strategies ?? [], [payload]);
  const subOf = (id: string) => writes.mine.find((m) => m.strategyId === id) ?? null;
  const copyingOf = (id: string): "none" | "follow" | "fade" => writes.mine.find((m) => m.strategyId === id && m.active)?.mode ?? "none";
  const wallet = writes.wallet?.toLowerCase() ?? null;
  const own = useMemo(() => strategies.filter((s) => s.creator.toLowerCase() === wallet || writes.mine.some((m) => m.strategyId === s.strategyId)), [strategies, wallet, writes.mine]);
  const visible = view === "yours" ? own : strategies.filter((s) => s.active || copyingOf(s.strategyId) !== "none");
  const featured = own.find((s) => s.strategyId === selected) ?? own[0] ?? null;
  const card = strategies.find((s) => s.strategyId === openId) ?? null;
  const open = (id: string, tab?: DrawerTab) => {
    setDrawerTab(tab);
    setOpenId(id);
  };

  return (
    <>
      <div hidden={view !== "create"}>
        <CreatorStudio writes={writes} trader={trader} onYours={(id) => { setSelected(id); setView("yours"); }} />
      </div>

      {view !== "create" && (
        reading.isPending ? (
          <LoadingState shape="strategy-grid" label={S.loading} />
        ) : reading.isError && !payload ? (
          <div role="alert" className="strat-empty flex flex-col items-center gap-3">
            <p className="strat-h2">{S.error}</p>
            <button type="button" onClick={() => void reading.refetch()} className="strat-sensei">{S.retry}</button>
          </div>
        ) : !payload?.deployed ? (
          <EmptyState why={S.notDeployed} />
        ) : view === "yours" && writes.signedIn && !writes.mineReady ? (
          <LoadingState shape="strategy-grid" label={S.loading} />
        ) : view === "yours" && writes.mineFailed ? (
          <div role="alert" className="strat-empty flex flex-col items-center gap-3">
            <p className="strat-h2">{S.yours.unreadable}</p>
            <button type="button" onClick={writes.refetchMine} className="strat-sensei">{S.retry}</button>
          </div>
        ) : view === "yours" && !writes.signedIn ? (
          <div className="strat-empty flex flex-col items-center gap-4">
            <h2 className="strat-h2">{S.yours.signedOutTitle}</h2>
            <button type="button" className="desk-btn-primary" onClick={() => shell.openPicker(S.views[2].label)}>{S.yours.signIn}</button>
          </div>
        ) : (
          <>
            {view === "yours" && own.length === 0 && (
              <div className="strat-empty flex flex-col items-center gap-4">
                <h2 className="strat-h2">{S.yours.emptyTitle}</h2>
                <button type="button" className="desk-btn-primary" onClick={() => setView("create")}>{S.yours.create}</button>
              </div>
            )}
            {view === "yours" && featured && (
              <div className="flex flex-col gap-4">
                <StrategyPicker strategies={own} selected={featured.strategyId} onSelect={setSelected} subOf={subOf} wallet={writes.wallet} />
                <LiveDesk card={featured} writes={writes} onManage={() => open(featured.strategyId, "copy")} />
              </div>
            )}
            {(view === "copy" || own.length > 0) && <StrategyGrid strategies={visible} copyingOf={copyingOf} onOpen={(c) => open(c.strategyId)} />}
            <RecentCopyTrades fills={view === "yours" ? writes.myFills : payload.fills} strategies={strategies} />
          </>
        )
      )}
      <CopyDrawer card={card} strategies={strategies} writes={writes} fills={payload?.fills ?? []} tab={drawerTab} open={card !== null} onOpenChange={(o) => !o && setOpenId(null)} />
    </>
  );
}
