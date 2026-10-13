"use client";
// `/themes/[slug]` (S16; R4-11, D-227) — ported from Owarine 90a91d71's desk cockpit (features/desk/cockpit: the header
// with a status dot and the members' LogoStack, TextTabs Overview · Holdings · Activity · Rules, the allocation as a
// Donut with a PartitionBar, the activity as a Timeline) onto a theme read from the chain: targets and bands from the
// registry, member prices from StockReference, followers and rebalances from the router's events. Follow is a sticky
// pill above the dock that opens the follow sheet (the arm grammar of CopyDrawer). Rules name the theme's ERC-8004
// agent (its registration file); a creator whose theme names none sets the theme agent there (`theme-set-agent`).
import { useTheme, useThemeActivity, useThemeFollow } from "@cwf/markets/react";
import { invalidateThemes } from "@cwf/markets/react";
import { THEME_AGENT_PATH, themeAgentOf, type ThemeView } from "@cwf/markets/themes";
import { NETWORKS, txUrl } from "@cwf/core";
import { useQueryClient } from "@tanstack/react-query";
import { shortHex } from "@cwf/core/units";
import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { PillButton, TextTabs, TextTabPanel } from "@/components/kit";
import { Donut, LogoStack, PartitionBar, Sparkline, StatusDot, Timeline, TimelineNode } from "@/components/kit/desk-kit";
import { webEnv } from "@/lib/env";
import { signerOfKind as signerOf, TxCta, useTxLifecycle } from "@/components/tx";
import { useWalletSession } from "@/lib/wallet-session";
import { THEMES } from "./copy";
import { FollowSheet } from "./FollowSheet";
import { ThemeYou } from "./ThemeYou";
import { useThemeWeek } from "./useThemeWeek";
import { everyText, pct, sessionsText, sliceColor, usd18, usd6, weightedPrice } from "./format";
import "@/styles/themes.css";

const T = THEMES.theme;
type Tab = "overview" | "holdings" | "activity" | "rules";

function slices(t: ThemeView) {
  return [...t.members.map((m, i) => ({ id: m.symbol, label: `${m.symbol} ${pct(m.band.targetBps)}`, value: m.band.targetBps, color: sliceColor(i) })), { id: "cash", label: `${T.cash} ${pct(t.cash.targetBps)}`, value: t.cash.targetBps, color: "var(--color-surface-3)" }];
}

function Overview({ t }: { t: ThemeView }) {
  const index = weightedPrice(t.members);
  const week = useThemeWeek(t.members);
  const session = useWalletSession();
  return (
    <>
    <div className="th-hero">
      <div className="th-index-figures">
        <span className="th-index-label">{THEMES.card.index}</span>
        <span className="th-index-value numbers">{index.e18 === null ? "—" : usd18(index.e18)}</span>
        <span className="th-week-label" data-tone={week.moveBps === null ? undefined : week.moveBps > 0 ? "up" : week.moveBps < 0 ? "down" : undefined}>{week.moveBps === null ? THEMES.card.weekNone : THEMES.card.week(`${week.moveBps > 0 ? "+" : week.moveBps < 0 ? "−" : ""}${pct(Math.abs(week.moveBps))}`)}</span>
      </div>
      <Sparkline values={week.values} width={640} height={140} className="th-hero-line" stretch />
    </div>
    <div className="th-overview">
      <Donut slices={slices(t)} label={T.target} size={168} thickness={18}>
        <span className="th-donut-figure numbers">{index.e18 === null ? "—" : usd18(index.e18)}</span>
        <span className="th-donut-label">{THEMES.card.index}</span>
      </Donut>
      <div className="th-overview-side">
        <PartitionBar slices={slices(t)} label={T.target} />
        <ul className="th-legend">
          {slices(t).map((s) => <li key={s.id}><span aria-hidden style={{ background: s.color }} />{s.label}</li>)}
        </ul>
      </div>
    </div>
    {session.address ? <ThemeYou t={t} who={session.address} /> : null}
    </>
  );
}

function Holdings({ t }: { t: ThemeView }) {
  return (
    <div className="th-holdings">
      {t.members.map((m) => (
        <div key={m.token} className="th-holding">
          <span className="th-holding-sym">{m.symbol}</span>
          <span className="numbers">{pct(m.band.targetBps)}</span>
          <span className="numbers text-ink-secondary">{T.band(pct(m.band.minBps), pct(m.band.maxBps))}</span>
          <span className="numbers">{m.refPriceE18 === null ? "—" : usd18(m.refPriceE18)}</span>
        </div>
      ))}
      <div className="th-holding">
        <span className="th-holding-sym">{T.cash}</span>
        <span className="numbers">{pct(t.cash.targetBps)}</span>
        <span className="numbers text-ink-secondary">{T.band(pct(t.cash.minBps), pct(t.cash.maxBps))}</span>
        <span />
      </div>
      <p className="th-note">{T.holdingsLine}</p>
    </div>
  );
}

function Activity({ t }: { t: ThemeView }) {
  const activity = useThemeActivity(t.themeId);
  const rows = activity?.ok ? [...activity.value.rebalances].reverse() : [];
  if (activity === null) return <p role="status" className="th-note">{THEMES.reading}</p>;
  if (!activity.ok) return <p role="alert" className="th-note">{THEMES.failed}</p>;
  if (rows.length === 0) return <p className="th-note">{T.activityEmpty}</p>;
  return (
    <Timeline label={T.tabs.activity}>
      {rows.map((r, i) => (
        <TimelineNode key={r.txHash} icon={<ArrowLeftRight className="size-3.5" />} tone="acted" index={i}>
          <span className="type-body-strong text-ink numbers">{T.rebalance(usd6(r.notionalUsd))}</span>
          <a className="th-link numbers" href={txUrl(r.txHash, webEnv.markets.network)} target="_blank" rel="noreferrer">{shortHex(r.follower)} · {shortHex(r.decisionId)}</a>
        </TimelineNode>
      ))}
    </Timeline>
  );
}

function Rules({ t }: { t: ThemeView }) {
  const R = T.rules;
  const rows: [string, string][] = [
    [R.fee, pct(t.creatorFeeBps)], [R.slippage, pct(t.maxSlippageBps)], [R.interval, everyText(t.minIntervalSec)], [R.refAge, `${Math.round(t.maxRefAgeSec / 3_600)} h`],
    [R.sessions, sessionsText(t.sessionsMask)], [R.version, `v${t.version}`], [R.creator, shortHex(t.creator)], [R.spec, shortHex(t.specHash)],
  ];
  return (
    <>
      <dl className="th-rules">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="numbers">{v}</dd></div>)}
        <div><dt>{R.agent}</dt><dd className="numbers">{t.agentId > 0n ? <a className="th-link" href={THEME_AGENT_PATH} target="_blank" rel="noreferrer">#{t.agentId.toString()}</a> : R.noAgent}</dd></div>
      </dl>
      <NameAgent t={t} />
    </>
  );
}

/** The creator names the theme agent on a theme that names none (self-paid `ThemeRegistry.setAgent`). */
function NameAgent({ t }: { t: ThemeView }) {
  const session = useWalletSession();
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  const agent = themeAgentOf(NETWORKS[webEnv.markets.network]);
  if (!agent || t.agentId > 0n || !session.address || session.address.toLowerCase() !== t.creator.toLowerCase()) return null;
  const run = async () => {
    const o = await tx.run({ kind: "theme-set-agent", themeId: t.themeId, agentId: agent.agentId });
    if (o?.status === "confirmed") await invalidateThemes(queryClient);
  };
  return <div className="th-rules-action"><TxCta state={tx.state} action={T.rules.nameAgent(agent.agentId.toString())} signer={signerOf(session.kind)} onConfirm={() => void run()} /></div>;
}

function View({ t, openFollow }: { t: ThemeView; openFollow: boolean }) {
  const session = useWalletSession();
  const follow = useThemeFollow(session.address, t.themeId);
  const activity = useThemeActivity(t.themeId);
  const [tab, setTab] = useState<Tab>("overview");
  const [sheet, setSheet] = useState(openFollow);
  const following = follow?.ok && follow.value ? follow.value.active : false;
  const name = t.spec?.name ?? `Theme #${t.themeId}`;
  return (
    <section className="th-page th-cockpit">
      <header className="th-cockpit-head">
        <span className="th-mark" aria-hidden>{name.slice(0, 1)}</span>
        <div className="th-title">
          <span className="th-name">{name}</span>
          <StatusDot tone={t.delisted ? "stopped" : following ? "live" : "quiet"}>{following ? THEMES.follow.following : activity?.ok ? THEMES.card.followers(activity.value.followers.length) : "…"}</StatusDot>
        </div>
        <LogoStack symbols={t.members.map((m) => m.symbol)} max={5} size="sm" />
      </header>
      {t.spec?.blurb ? <p className="th-blurb">{t.spec.blurb}</p> : null}
      <div className="th-cta page-action">
        <PillButton tone={following ? "ghost" : "accent"} size="lg" block onClick={() => setSheet(true)}>{following ? THEMES.follow.following : THEMES.card.follow}</PillButton>
      </div>
      {t.openNow === false || t.haltedNow ? <p className="th-row" data-paused="">{t.openNow === false ? THEMES.card.paused(sessionsText(t.sessionsMask)) : THEMES.card.halted}</p> : null}
      <TextTabs value={tab} onChange={setTab} label={name} tabs={(Object.keys(T.tabs) as Tab[]).map((value) => ({ value, label: T.tabs[value] }))}>
        <TextTabPanel value="overview"><Overview t={t} /></TextTabPanel>
        <TextTabPanel value="holdings"><Holdings t={t} /></TextTabPanel>
        <TextTabPanel value="activity"><Activity t={t} /></TextTabPanel>
        <TextTabPanel value="rules"><Rules t={t} /></TextTabPanel>
      </TextTabs>
      {sheet ? <FollowSheet theme={t} following={following} open onOpenChange={setSheet} /> : null}
    </section>
  );
}

export function ThemeScreen({ themeId, openFollow }: { themeId: bigint; openFollow: boolean }) {
  const theme = useTheme(themeId);
  if (theme === null) return <section className="th-page"><p role="status" className="th-note">{T.reading}</p></section>;
  if (!theme.ok) return <section className="th-page"><p role="alert" className="th-note">{THEMES.failed}</p></section>;
  if (!theme.value) return <section className="th-page"><p className="th-note">{T.missing}</p></section>;
  return <View t={theme.value} openFollow={openFollow} />;
}
