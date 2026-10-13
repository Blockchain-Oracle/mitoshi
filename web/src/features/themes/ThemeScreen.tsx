"use client";
// `/themes/[slug]` (S16; R4-11, D-227) — ported from Owarine 90a91d71's desk cockpit (features/desk/cockpit: the header
// with a status dot and the members' LogoStack, TextTabs Overview · Holdings · Activity · Rules, the allocation as a
// Donut with a PartitionBar, the activity as a Timeline) onto a theme read from the chain: targets and bands from the
// registry, member prices from StockReference, followers and rebalances from the router's events. Follow is a sticky
// pill above the dock that opens the follow sheet (the arm grammar of CopyDrawer).
import { useTheme, useThemeActivity, useThemeFollow } from "@cwf/markets/react";
import type { ThemeView } from "@cwf/markets/themes";
import { txUrl } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import { ArrowLeftRight } from "lucide-react";
import { useState } from "react";
import { PillButton, TextTabs, TextTabPanel } from "@/components/kit";
import { Donut, LogoStack, PartitionBar, StatusDot, Timeline, TimelineNode } from "@/components/kit/desk-kit";
import { webEnv } from "@/lib/env";
import { useWalletSession } from "@/lib/wallet-session";
import { THEMES } from "./copy";
import { FollowSheet } from "./FollowSheet";
import { everyText, pct, sessionsText, sliceColor, usd18, usd6, weightedPrice } from "./format";
import "@/styles/themes.css";

const T = THEMES.theme;
type Tab = "overview" | "holdings" | "activity" | "rules";

function slices(t: ThemeView) {
  return [...t.members.map((m, i) => ({ id: m.symbol, label: `${m.symbol} ${pct(m.band.targetBps)}`, value: m.band.targetBps, color: sliceColor(i) })), { id: "cash", label: `${T.cash} ${pct(t.cash.targetBps)}`, value: t.cash.targetBps, color: "var(--color-surface-3)" }];
}

function Overview({ t }: { t: ThemeView }) {
  const index = weightedPrice(t.members);
  return (
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
  if (activity === null) return <p className="th-note">{T.activityEmpty}</p>;
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
  return <dl className="th-rules">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="numbers">{v}</dd></div>)}</dl>;
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
  if (!theme.ok || !theme.value) return <section className="th-page"><p className="th-note">{T.missing}</p></section>;
  return <View t={theme.value} openFollow={openFollow} />;
}
