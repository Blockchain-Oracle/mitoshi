"use client";
// `/agents/[id]` (S9.8; L-54, AG-1, AG-16): an agent's page — its ERC-8004 identity card (21st 31599, revamped), what it
// does and its record with the sample size, its runner in its own words, each decision with what paid for it (an MPP
// receipt, or "unpaid" on testnet, D-218.4), its copy trades and its ERC-8004 feedback; Copy opens the desk's drawer;
// Report and Block (S13 hand-off: `/api/social/report` takes `agent`).
import { formatBaseUnits, txUrl, USD_DECIMALS } from "@cwf/core";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { LoadingState } from "@/components/states/LoadingState";
import { EmptyState } from "@/components/states/EmptyState";
import { webEnv } from "@/lib/env";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ReportDialog } from "../social/report-dialog-lazy";
import { useSocialSession } from "../social/session";
import { CopyDrawer } from "../strategies/CopyDrawer";
import { MemorySection } from "../strategies/MemorySection";
import type { StrategyDetailPayload } from "../strategies/protocol";
import { useCopyWrites } from "../strategies/useCopyWrites";
import { useStrategies } from "../strategies/useStrategies";
import { AgentIdCard } from "./AgentIdCard";
import { AGENTS } from "./copy";

const P = AGENTS.profile;
const usd = (base: bigint) => `$${formatBaseUnits(base < 0n ? -base : base, USD_DECIMALS, { minDp: 2, maxDp: 2 })}`;
const ago = (ms: number) => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`;
};

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-title text-ink">{title}</h2>
      {children}
    </section>
  );
}

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
  const [copying, setCopying] = useState(false);
  const [reporting, setReporting] = useState(false);
  const network = webEnv.markets.network;

  if (detail.isPending) return <div className="mx-auto w-full max-w-(--content-wide)"><LoadingState shape="page" label={AGENTS.loading} /></div>;
  if (!detail.data) return <div className="mx-auto w-full max-w-(--content-wide) px-gutter py-8"><EmptyState why={detail.isError ? AGENTS.error : P.notFound} /></div>;
  const { strategy: s, heartbeats, decisions, fills, feedback } = detail.data;
  const net = BigInt(s.record.netBase);
  const registry = s.agentId ? `eip155:${network === "mainnet" ? 4217 : 42431}` : null;
  const block = async () => {
    const session = await social.ensure();
    if (!session.ok) return;
    const res = await fetch("/api/social/block", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: s.creator }) }).catch(() => null);
    if (res?.ok) notify.item({ id: "agent-block", title: P.blocked });
  };

  return (
    <div className="mx-auto flex w-full max-w-(--content-wide) flex-col gap-8 px-gutter py-8 lg:px-gutter-desktop">
      <Link href="/agents" className="type-caption text-ink-secondary hover:text-ink">← {P.back}</Link>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="flex flex-col gap-4">
          {s.agentId && registry ? (
            <AgentIdCard name={s.name} agentId={s.agentId} registry={registry} runner={s.runner} model={s.agent?.model ?? null} kind={P.identity} hint={P.dragHint} />
          ) : null}
          <button type="button" disabled={!s.active} onClick={() => setCopying(true)} className="min-h-touch rounded-full bg-accent-fill px-5 type-body-strong text-on-accent hover:bg-accent-fill-pressed disabled:opacity-50">{P.copy}</button>
          <div className="flex gap-2">
            <button type="button" onClick={() => setReporting(true)} className="min-h-touch flex-1 rounded-full border border-hairline px-4 type-body-strong text-ink hover:bg-surface-2">{P.report}</button>
            <button type="button" onClick={() => void block()} className="min-h-touch flex-1 rounded-full border border-hairline px-4 type-body-strong text-ink hover:bg-surface-2">{P.block}</button>
          </div>
        </div>
        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-2">
            <span className="type-label-micro text-ink-secondary">{s.envelope.seriesLabel ?? "Any Window"}</span>
            <h1 className="type-display text-ink">{s.name}</h1>
            {s.description && <p className="type-body text-ink">{s.description}</p>}
            {s.specText && <p className="max-w-(--content-reading) type-body text-ink-secondary">{s.specText}</p>}
          </header>
          <Block title={P.record}>
            {s.record.settled > 0 ? (
              <p className="flex flex-col gap-0.5">
                <span className={cn("type-display tabular-nums", net > 0n ? "text-profit" : net < 0n ? "text-loss" : "text-ink")}>{`${net > 0n ? "+" : net < 0n ? "−" : ""}${usd(net)}`}</span>
                <span className="type-caption text-ink-secondary">{P.recordLine(s.record.settled, s.record.wins, s.record.losses, s.record.open)}</span>
              </p>
            ) : (
              <p className="type-body-strong text-ink-secondary">{P.noRecord(s.record.open)}</p>
            )}
          </Block>
          <Block title={P.memory}>
            <MemorySection card={s} wallet={writes.wallet} copying={writes.mine.some((m) => m.strategyId === s.strategyId && m.active)} titled={false} />
          </Block>
          <Block title={P.voice}>
            <ul className="flex flex-col gap-1">
              {heartbeats.slice(0, 6).map((h) => (
                <li key={h.atMs} className="flex gap-3 type-caption"><span className="w-16 shrink-0 text-ink-muted tabular-nums">{ago(h.atMs)}</span><span className="text-ink-secondary">{h.why}</span></li>
              ))}
            </ul>
          </Block>
          {s.agent && (
            <Block title={P.decisions}>
              <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-surface-1">
                {decisions.map((d) => (
                  <li key={d.marketId} className="flex flex-col gap-1 px-4 py-3">
                    <span className="type-body-strong text-ink">{d.label ?? d.marketId.slice(0, 10)} · {d.side ? P.decisionLine(d.side.toUpperCase(), d.filled, d.outcome) : P.held}</span>
                    <span className="type-caption text-ink-secondary">{d.why}</span>
                    <span className="type-caption text-ink-muted">{d.model} · {d.receipts ? d.receipts.map((r) => P.paid(usd(BigInt(r.amountBase)), r.host)).join(", ") : P.unpaid}</span>
                  </li>
                ))}
              </ul>
            </Block>
          )}
          <Block title={P.fills}>
            {fills.length === 0 ? <p className="type-body text-ink-secondary">{P.noFills}</p> : (
              <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline bg-surface-1">
                {fills.slice(0, 10).map((f) => (
                  <li key={f.txHash} className="flex items-center justify-between gap-3 px-4 py-3 type-caption">
                    <span className="text-ink">{f.label ?? f.marketId.slice(0, 10)} · {f.side.toUpperCase()}{f.mode === "fade" ? " (fade)" : ""} · {usd(BigInt(f.cashDeltaBase))}</span>
                    <a href={txUrl(f.txHash as `0x${string}`, network)} target="_blank" rel="noreferrer" className="text-ink-secondary hover:text-ink">{f.pnlBase === null ? "open" : `${BigInt(f.pnlBase) >= 0n ? "+" : "−"}${usd(BigInt(f.pnlBase))}`}</a>
                  </li>
                ))}
              </ul>
            )}
          </Block>
          {s.agentId && (
            <Block title={P.feedback}>
              {feedback.length === 0 ? <p className="type-body text-ink-secondary">{P.noFeedback}</p> : (
                <ul className="flex flex-col gap-1">
                  {feedback.map((f) => (
                    <li key={f.txHash} className={cn("type-caption", f.revoked ? "text-ink-muted line-through" : "text-ink-secondary")}>
                      <a href={txUrl(f.txHash as `0x${string}`, network)} target="_blank" rel="noreferrer">{P.feedbackLine(f.value, f.valueDecimals, f.tag2)} · {f.client.slice(0, 6)}…{f.client.slice(-4)}</a>
                    </li>
                  ))}
                </ul>
              )}
            </Block>
          )}
        </div>
      </div>
      <CopyDrawer card={copying ? (catalogue.data?.strategies.find((x) => x.strategyId === s.strategyId) ?? s) : null} strategies={catalogue.data?.strategies ?? [s]} writes={writes} open={copying} onOpenChange={setCopying} />
      {reporting && <ReportDialog open={reporting} onOpenChange={setReporting} target={{ kind: "agent", id: s.strategyId }} urlKey="report" />}
    </div>
  );
}
