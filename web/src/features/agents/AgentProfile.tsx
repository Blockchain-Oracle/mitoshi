"use client";
// `/agents/[id]` (S9.8; L-54, AG-1, AG-16) as Owarine 90a91d71's desk cockpit (features/desk/DeskPage.tsx; R4-6, D-227):
// the head with its toolbar (Copy, More: Report · Block · Share), the record as the plate beside the next decision (a
// real countdown, the runner's pass in words, the last decision — R6 #9, D-230), then tabs — Overview (the latest
// decision, its limits, your copy's), Decisions · N (every decision it made, an agent's reads and a rule's calls; each
// opens in full, an agent's with what paid for it, an MPP receipt or "unpaid", D-218.4), Copies · N (every copy
// trade, the latest listed) and
// Identity (the ERC-8004 card, its registry, ratings, sealed memory). Copy opens the desk's drawer. The stage is the one
// inset.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { TabsPanel, UnderlineTabs } from "@/components/kit/desk-kit";
import { EmptyState } from "@/components/states/EmptyState";
import { notify } from "@/lib/toast";
import { ReportDialog } from "../social/report-dialog-lazy";
import { useSocialSession } from "../social/session";
import { CopyDrawer } from "../strategies/CopyDrawer";
import type { StrategyDetailPayload } from "../strategies/protocol";
import { strategyIdentity } from "../strategies/identity";
import { useCopyWrites } from "../strategies/useCopyWrites";
import { useStrategies } from "../strategies/useStrategies";
import { CockpitHeader } from "./CockpitHeader";
import { AGENTS } from "./copy";
import { DecisionTimeline } from "./DecisionTimeline";
import { IdentityTab } from "./IdentityTab";
import { NextDecision } from "./NextDecision";
import { OverviewTab } from "./OverviewTab";
import { RecordHero } from "./RecordHero";
import { FillRows } from "./FillRows";
import "./cockpit.css";
import "../strategies/strategies.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { cockpit as cockpitShape } from "@/components/states/shapes/automate";

const C = AGENTS.cockpit;
type Tab = "overview" | "decisions" | "copies" | "identity";

export function AgentProfile({ strategyId }: { strategyId: string }) {
  const detail = useQuery({
    queryKey: ["cwf", "strategies", "detail", strategyId],
    queryFn: async (): Promise<StrategyDetailPayload | null> => {
      const res = await fetch(`/api/strategies/${strategyId}`, { cache: "no-store" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`detail ${res.status}`);
      return (await res.json()) as StrategyDetailPayload;
    },
    refetchInterval: 30_000,
  });
  const catalogue = useStrategies();
  const writes = useCopyWrites();
  const social = useSocialSession();
  const [copyOpen, setCopyOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  if (detail.isPending) return <LoadingFrame shape="cockpit" label={AGENTS.loading}>{cockpitShape()}</LoadingFrame>;
  if (!detail.data) return detail.isError
    ? <EmptyState why={AGENTS.error} nextAction={{ label: AGENTS.retry, onClick: () => void detail.refetch() }} />
    : <EmptyState why={C.notFound} nextAction={{ label: C.back, href: "/agents" }} />;
  const d = detail.data;
  const s = d.strategy;
  // A theme (D-231) is a basket strategy with its own page: its calls, its mix and its follow.
  if (s.spec?.preset === "basket") return <EmptyState why={C.theme} nextAction={{ label: C.openTheme, href: `/themes/${s.strategyId}` }} />;
  const { name } = strategyIdentity(s);
  const copying = writes.mine.some((m) => m.strategyId === s.strategyId && m.active);
  const card = catalogue.data?.strategies.find((x) => x.strategyId === s.strategyId) ?? s;
  const block = async () => {
    const session = await social.ensure();
    if (!session.ok) return;
    const res = await fetch("/api/social/block", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: s.creator }) }).catch(() => null);
    if (res?.ok) notify.item({ id: "agent-block", title: C.blocked });
  };
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: name, url });
      else {
        await navigator.clipboard.writeText(url);
        notify.item({ id: "agent-share", title: C.shared });
      }
    } catch {
      // the share sheet was dismissed
    }
  };
  const items = [
    { value: "overview" as const, label: C.tabs.overview },
    { value: "decisions" as const, label: C.tabs.decisions, count: s.decisions.total },
    { value: "copies" as const, label: C.tabs.copies, count: s.record.copyTrades },
    { value: "identity" as const, label: C.tabs.identity },
  ];

  return (
    <div className="cp-page">
      <Link href="/agents" className="strat-meta text-ink-muted hover:text-ink">← {C.back}</Link>
      <CockpitHeader s={s} copying={copying} onCopy={() => setCopyOpen(true)} onReport={() => setReporting(true)} onBlock={() => void block()} onShare={() => void share()} />
      <div className="cp-top">
        <RecordHero record={s.record} />
        <NextDecision s={s} decisions={d.decisions} onOpenDecisions={() => setTab("decisions")} />
      </div>
      <UnderlineTabs value={tab} onChange={setTab} items={items} label={C.tabsLabel}>
        <TabsPanel value="overview" className="pt-4"><OverviewTab detail={d} writes={writes} onOpenDecisions={() => setTab("decisions")} /></TabsPanel>
        <TabsPanel value="decisions" className="pt-4"><DecisionTimeline decisions={d.decisions} counts={s.decisions} fills={d.fills} agentName={name} /></TabsPanel>
        <TabsPanel value="copies" className="pt-4"><FillRows fills={d.fills} total={s.record.copyTrades} /></TabsPanel>
        <TabsPanel value="identity" className="pt-4"><IdentityTab detail={d} wallet={writes.wallet} copying={copying} onCopy={() => setCopyOpen(true)} /></TabsPanel>
      </UnderlineTabs>
      <p className="strat-advice">{AGENTS.advice}</p>
      <CopyDrawer card={copyOpen ? card : null} strategies={catalogue.data?.strategies ?? [s]} writes={writes} fills={d.fills} open={copyOpen} onOpenChange={setCopyOpen} />
      {reporting && <ReportDialog open={reporting} onOpenChange={setReporting} target={{ kind: "agent", id: s.strategyId }} urlKey="report" />}
    </div>
  );
}
