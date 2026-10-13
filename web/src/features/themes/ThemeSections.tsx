// `/themes/[slug]`'s sections (R6, D-230; D-231), rendered on the server: the calls (the Windows the theme took a side
// on, from the runner's own record — 21st.dev 27124 ssychui/trade-journal-table revamped to a phone's width: a card with
// its title and count, one quiet column head, rows of the Window, the call and its result as a pill with a check, a
// cross or a dot; its range control and P&L columns dropped — a call's money is each copier's), the key facts beside
// the action, and the rules — the facts as a grid of bordered cells (21st.dev 29195 shadcnui-blocks/stats-grid: label
// over figure, hairline cells, on Mitoshi's tokens). Refero: Acorns' fund detail (8a77acec-6fbe-42ff-b07c-857a06bd32c8)
// — plain label-and-figure pairs. None of it needs the browser, so none of it is in the page's first-load JS.
import { addressUrl, basketStakeBase, type Address, type BasketSpec } from "@cwf/core";
import { shortHex } from "@cwf/core/units";
import { Check, X } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import type { DecisionWire, StrategyWire } from "@/features/strategies/protocol";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { webEnv } from "@/lib/env";
import { THEMES } from "./copy";
import { etStamp, lanesText, ruleText, usd6 } from "./format";
import type { ThemeCalls } from "./wire";

const T = THEMES.theme;

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="th-section" aria-label={title}>
      <header className="th-section-head">
        <h2 className="th-section-title">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Result({ outcome }: { outcome: DecisionWire["outcome"] }) {
  const o = outcome ?? "open";
  return (
    <span className="th-result" data-outcome={o}>
      {o === "won" ? <Check aria-hidden strokeWidth={3} /> : o === "lost" ? <X aria-hidden strokeWidth={3} /> : o === "open" ? <i aria-hidden /> : null}
      {T.outcome[o]}
    </span>
  );
}

/** The latest calls, newest first; none yet says what will make one. */
export function Calls({ calls }: { calls: ThemeCalls }) {
  if (calls.calls.length === 0) return <EmptyState size="inline" why={T.callsEmpty} detail={T.callsEmptyLine} />;
  return (
    <div className="th-calls">
      <div className="th-calls-head" aria-hidden>
        <span>{T.callCols.window}</span>
        <span>{T.callCols.side}</span>
        <span>{T.callCols.result}</span>
      </div>
      <ol aria-label={T.calls}>
        {calls.calls.map((c) => {
          const symbol = c.label?.split(" ")[0] ?? "";
          return (
            <li key={c.marketId} className="th-call">
              <span className="th-call-what">
                <AssetDisc asset={symbol || "?"} className="th-call-disc" />
                <span className="th-call-text">
                  <span className="th-call-label">{c.label ?? shortHex(c.marketId)}</span>
                  <span className="th-call-when numbers">{`${etStamp(c.decidedAtMs)}${c.filled > 0 ? ` · ${T.copies(c.filled)}` : ""}`}</span>
                </span>
              </span>
              <span className="th-side-chip" data-side={c.side ?? undefined}>{c.side === "up" ? "UP" : "DOWN"}</span>
              <Result outcome={c.outcome} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Cell({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="th-cell">
      <dt>{k}</dt>
      <dd className="numbers">{children}</dd>
    </div>
  );
}

const maxWeight = (spec: BasketSpec) => Math.max(...spec.members.map((m) => m.weightBps));

/** Beside the action: who follows, what it costs, the biggest call it places, its copies' record. */
export function KeyStats({ card, spec }: { card: StrategyWire; spec: BasketSpec }) {
  const S = T.stats;
  const fee = BigInt(card.feeBase);
  const r = card.record;
  return (
    <dl className="th-cells th-cells--key">
      <Cell k={S.followers}>{card.subscribers}</Cell>
      <Cell k={S.fee}>{fee > 0n ? usd6(fee) : THEMES.card.free}</Cell>
      <Cell k={S.perCall}>{T.perCall(usd6(basketStakeBase(BigInt(card.envelope.maxStakePerTradeBase), maxWeight(spec))))}</Cell>
      <Cell k={S.record}>{r.settled > 0 ? T.record(r.wins, r.losses) : "—"}</Cell>
    </dl>
  );
}

const link = (href: string, text: string) => <a className="th-link" href={href} target="_blank" rel="noreferrer">{text}</a>;

/** The rest of the theme's on-chain terms (the key facts sit beside the action). */
export function Rules({ card, spec, agentHref }: { card: StrategyWire; spec: BasketSpec; agentHref: string | null }) {
  const R = T.rules;
  const network = webEnv.markets.network;
  const e = card.envelope;
  const cents = Number(BigInt(e.maxPriceRaw) / 10_000n);
  return (
    <dl className="th-cells">
      <Cell k={R.lanes}>{lanesText(spec)}</Cell>
      <Cell k={R.rule}>{ruleText(spec.rule)}</Cell>
      <Cell k={R.dailyCap}>{usd6(e.maxDailySpendBase)}</Cell>
      <Cell k={R.open}>{e.maxOpenPositions}</Cell>
      <Cell k={R.priceCap}>{cents > 0 ? `${cents}¢` : R.noCap}</Cell>
      <Cell k={R.agent}>{card.agentId === null ? R.noAgent : agentHref ? link(agentHref, `#${card.agentId}`) : `#${card.agentId}`}</Cell>
      <Cell k={R.creator}>{link(addressUrl(card.creator as Address, network), shortHex(card.creator))}</Cell>
      <Cell k={R.runner}>{link(addressUrl(card.runner as Address, network), shortHex(card.runner))}</Cell>
    </dl>
  );
}
