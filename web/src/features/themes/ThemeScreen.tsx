// `/themes/[slug]` (S16; R6, D-230; D-231) — one theme, rendered on the server from the shared reads: the head with its
// stocks' marks and its live / 24/7 / closed pill, where it trades and how it calls (or when a closed market trades,
// `StatusPlate`), the weighted mix's performance (`Performance` → `MixChart`, 21st 30538, streamed in), the mix as a
// ring whose legend is its stocks with the biggest call each takes (`Allocation`, 21st 20086 + 8704), and the calls it
// has made (`Calls`, 21st 27124) — a theme holds calls, not shares, so there is no Holdings tab. From 1024 px the action
// sits in a sticky side card with the key facts (21st 29195's cells) and the rules; on a phone it is a strip above the
// dock, on the first screen. Only the visitor's part runs in the browser (`ThemeIslands`: the follow state, the action,
// the sheet) with the chart's scrub and the ring's hover. Refero: Wealthsimple's account page
// (e9ca8829-aed2-421a-af46-a741addfb15e — the chart in a wide main column, the figures and the action in a narrow right
// one) for the 1024+ grid; UGLYCASH's trader profile (c4c2bc7d-01a8-4e47-a349-0f667472460b — name and pill, the move
// and its chart, then the positions) for the order.
import { Suspense } from "react";
import { themeChartBones, themeMixBones } from "@/components/states/shapes/themes";
import { Allocation } from "./Allocation";
import { THEMES } from "./copy";
import { lanesText } from "./format";
import { Performance } from "./MixChart";
import { statusWords, type ThemeStatus } from "./status";
import { MemberStack, StatusPill, StatusPlate, themeName } from "./ThemeBits";
import { FollowCta, FollowRoot } from "./ThemeIslands";
import { Calls, KeyStats, Rules, Section } from "./ThemeSections";
import type { ThemeMix } from "./themes.server";
import type { ThemeCalls, ThemeWire } from "./wire";
import "@/styles/themes.css";
import "@/styles/themes-detail.css";

const T = THEMES.theme;

export interface ThemeScreenProps {
  theme: ThemeWire;
  calls: ThemeCalls;
  status: ThemeStatus;
  nowSec: number;
  mix: Promise<ThemeMix>;
  openFollow: boolean;
  agentHref: string | null;
}

export function ThemeScreen({ theme, calls, status, nowSec, mix, openFollow, agentHref }: ThemeScreenProps) {
  const { card, spec } = theme;
  const name = themeName(card);
  const symbols = spec.members.map((m) => m.symbol);
  return (
    <FollowRoot card={card} name={name} symbols={symbols} opensIn={statusWords(status, nowSec).opensIn} openFollow={openFollow}>
      <section className="th-page th-detail">
        <header className="th-detail-head">
          <MemberStack spec={spec} size="lg" />
          <div className="th-detail-title">
            <h1 className="th-detail-name">{name}</h1>
            <p className="th-detail-tag numbers">{`#${card.strategyId} · ${THEMES.card.count(symbols.length)} · ${lanesText(spec)}`}</p>
          </div>
          <StatusPill status={status} nowSec={nowSec} />
        </header>
        {card.description ? <p className="th-detail-blurb">{card.description}</p> : null}
        <StatusPlate spec={spec} status={status} nowSec={nowSec} />
        <div className="th-detail-grid">
          <div className="th-detail-main">
            <section className="th-section" aria-label={T.perf}>
              <Suspense fallback={themeChartBones()}>
                <Performance mix={mix} />
              </Suspense>
            </section>
            <Section title={T.mix}>
              <Suspense fallback={themeMixBones()}>
                <Allocation spec={spec} perTradeBase={BigInt(card.envelope.maxStakePerTradeBase)} mix={mix} />
              </Suspense>
            </Section>
            <Section title={T.calls} aside={calls.total > 0 ? <span className="th-section-count numbers">{calls.total}</span> : null}>
              <Calls calls={calls} />
            </Section>
          </div>
          <aside className="th-detail-side">
            <div className="th-section th-follow-card">
              <div className="th-follow-cta"><FollowCta /></div>
              <p className="th-follow-line">{T.followLine}</p>
              <KeyStats card={card} spec={spec} />
            </div>
            <Section title={T.rules.title}>
              <Rules card={card} spec={spec} agentHref={agentHref} />
            </Section>
          </aside>
        </div>
        <div className="th-dock page-action"><FollowCta /></div>
      </section>
    </FollowRoot>
  );
}
