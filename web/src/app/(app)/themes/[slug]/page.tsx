// `/themes/<id>` (S16; R6, D-230; D-231): one theme — a basket strategy, by its StrategyRegistry id — server-rendered
// from the shared reads (the theme with its calls and ops' session clock in parallel, then its mix streaming in after
// it); `?follow=1` opens the follow sheet (the catalogue's Follow). An id that isn't a number, names nothing, or names a
// strategy that isn't a basket says so with a way on; a read that failed says so with a retry.
import { CHAIN } from "@cwf/clients";
import { BASKET_AGENT_PATH, basketAgentOf } from "@cwf/markets/strategies";
import { Layers } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { EmptyState } from "@/components/states/EmptyState";
import { themeDetail } from "@/components/states/shapes/themes";
import { THEMES } from "@/features/themes/copy";
import { RetryPanel } from "@/features/themes/RetryPanel";
import { ThemeScreen } from "@/features/themes/ThemeScreen";
import { themeStatus } from "@/features/themes/status";
import { marketClock, themeById, themeMix } from "@/features/themes/themes.server";
import { webEnv } from "@/lib/env";
import "@/styles/themes.css";

type Params = Promise<{ slug: string }>;
type Search = Promise<{ follow?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return { title: /^\d+$/.test(slug) ? `Theme #${slug}` : "Theme" };
}

function Missing({ id, strategy = false }: { id: string; strategy?: boolean }) {
  return (
    <section className="th-page">
      <EmptyState
        size="page"
        icon={<Layers aria-hidden />}
        why={strategy ? THEMES.theme.strategy(id) : THEMES.theme.missing(id)}
        detail={strategy ? THEMES.theme.strategyLine : THEMES.theme.missingLine}
        nextAction={strategy ? { label: THEMES.theme.openStrategy, href: `/agents/${id}` } : { label: THEMES.theme.all, href: "/themes" }}
        secondaryAction={strategy ? { label: THEMES.theme.all, href: "/themes" } : undefined}
      />
    </section>
  );
}

async function Theme({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ slug }, { follow }] = await Promise.all([params, searchParams]);
  if (!/^\d{1,18}$/.test(slug) || BigInt(slug) < 1n) return <Missing id={slug.slice(0, 24)} />;
  await connection();
  const nowMs = Date.now();
  const [read, clock] = await Promise.all([themeById(slug), marketClock()]);
  if (read === null) return <section className="th-page"><RetryPanel line={THEMES.theme.failed} /></section>;
  if (read.kind !== "theme") return <Missing id={slug} strategy={read.kind === "strategy"} />;
  const { theme, calls } = read;
  const agent = basketAgentOf(webEnv.markets.network === "mainnet" ? CHAIN.tempo : CHAIN.moderato);
  const agentHref = agent && theme.card.agentId === agent.agentId.toString() ? BASKET_AGENT_PATH : null;
  return (
    <ThemeScreen
      theme={theme}
      calls={calls}
      status={themeStatus(theme.spec.lanes, clock)}
      nowSec={Math.floor(nowMs / 1000)}
      mix={themeMix(theme.spec, nowMs)}
      openFollow={follow === "1"}
      agentHref={agentHref}
    />
  );
}

export default function ThemePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<LoadingFrame shape="theme" label="Reading the theme" delayMs={120}>{themeDetail()}</LoadingFrame>}>
      <Theme params={params} searchParams={searchParams} />
    </Suspense>
  );
}
