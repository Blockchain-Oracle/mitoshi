"use client";
/**
 * Portfolio signed out (R6 money, S07 + T02; D-230) — no wall: the signed-in page, drawn on DEMO's paper account (this
 * browser's 10,000 paper dollars on live Windows, D-223). Owarine 90a91d71's signed-in order on paper data, as Coinbase
 * draws a $0 portfolio (Refero 241f05e4, eab224ac): the money card with DEMO's figure — the balance plus what Close pays
 * on the open rows (`demo-money.ts`, the terminal's valuation) — and the one sign-in in its primary slot; the pockets
 * (the Trading Balance after sign-in, Earn reading what suppliers made); `01 Open on paper` as the terminal's rows (Close
 * works on paper); `02 Settled on paper` when there is any; then Trader Edge. A paper position whose Window closes while
 * this is open settles here on the real result, as in the terminal.
 */
import { formatCadence } from "@cwf/core/copy";
import { Pill } from "@/components/kit/Pill";
import { Masked } from "@/components/kit/Masked";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { EmptyState } from "@/components/states/EmptyState";
import { EarnPocketPreview } from "@/features/earn/EarnPocket";
import { useDemoState } from "@/features/terminal/demo";
import { money } from "@/features/terminal/format";
import { paperRows } from "@/features/terminal/history-rows";
import { useDemoSettle } from "@/features/terminal/useDemoSettle";
import { useTerminalClose } from "@/features/terminal/useTerminalClose";
import { useNowMs } from "@/lib/clock";
import { openFunds } from "@/lib/funds-event";
import { cn } from "@/lib/utils";
import { HERO_MONEY, HISTORY, PORTFOLIO } from "../copy";
import { timeAgo } from "../history/time-ago";
import { TraderEdgeLink } from "../history/TraderEdgeLink";
import { SIDE_WORD } from "../side-styles";
import { BetRow } from "./BetRow";
import { demoMoney } from "./demo-money";
import { MoneyHero } from "./MoneyHero";
import { Pockets } from "./Pockets";
import { PositionValuers, usePortfolioPositions } from "./usePortfolioPositions";
import "@/components/kit/kit.css";

const SETTLED_SHOWN = 5;
const NO_PANELS = { vault: null, private: null } as const;

export function PortfolioScreen() {
  const demo = useDemoState();
  const book = usePortfolioPositions(null);
  const closer = useTerminalClose();
  const nowMs = useNowMs();
  useDemoSettle(true);
  const d = demoMoney({ balanceBase: BigInt(demo.balanceBase), history: demo.history }, book.positions, book.values);
  const w = HERO_MONEY.paper;
  const settled = paperRows(demo.history.slice(0, SETTLED_SHOWN));
  const line = (
    <>
      <span className={cn("numbers money-hero-strong", d.realisedBase > 0n ? "text-up" : d.realisedBase < 0n ? "text-down" : null)}>
        <Masked>{money(d.realisedBase, true)}</Masked>
      </span>{" "}
      {w.onPaper} · <span className="numbers money-hero-strong">{book.positions.length}</span> {HERO_MONEY.open} · <span className="numbers money-hero-strong">{d.settledCount}</span> {HERO_MONEY.settled}
    </>
  );
  return (
    <div className="flex flex-col gap-6 lg:gap-10" aria-label={w.eyebrow}>
      <PositionValuers positions={book.positions} onValue={book.onValue} />
      <MoneyHero
        money={d.money}
        settled={d.settledCount}
        onAdd={openFunds}
        collect={null}
        eyebrow={w.eyebrow}
        tag={<span className="tm-demo-tag">{w.tag}</span>}
        legs={[
          { key: "dollars", label: w.dollars, amountBase: d.freeBase },
          { key: "positions", label: HERO_MONEY.legs.positions, amountBase: d.openBase },
        ]}
        line={line}
        primary={<Pill tone="accent" size="lg" data-primary-action="" onClick={openFunds}>{w.signIn}</Pill>}
      />
      <Pockets decimals={d.money.decimals} pockets={[{ id: "vault", amountBase: null, blockedReason: w.afterSignIn }]} panels={NO_PANELS}>
        <EarnPocketPreview />
      </Pockets>
      <section className="flex flex-col gap-3" aria-labelledby="paper-open-title">
        <SectionHeader id="paper-open-title" className="section-head-fit" index="01" title={w.openTitle} />
        <div className="bets-plate">
          {book.groups.length === 0 ? (
            <EmptyState size="inline" why={PORTFOLIO.firstCall} nextAction={{ label: HERO_MONEY.trade, href: "/trade" }} />
          ) : (
            <ul className="bets-list">
              {book.groups.map((g) => (
                <BetRow key={g.key} legs={g.legs} values={book.values} closer={closer} />
              ))}
            </ul>
          )}
        </div>
      </section>
      {settled.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="paper-settled-title">
          <SectionHeader id="paper-settled-title" className="section-head-fit" index="02" title={w.settledTitle} />
          <ul className="bets-plate bets-list">
            {settled.map((r) => (
              <li key={r.key} className="bets-row history-row">
                <span className={cn("type-label-micro shrink-0", r.outcome === "win" ? "text-ink" : "text-ink-secondary")}>{HISTORY.outcome[r.outcome] ?? r.outcome}</span>
                <span className="type-body-strong text-ink">{r.asset} {SIDE_WORD[r.up ? "up" : "down"]}</span>
                {r.intervalSec > 0 ? <span className="type-label-micro text-ink-muted">{formatCadence(r.intervalSec)}</span> : null}
                <span className="bets-break" aria-hidden />
                <span className="flex-1" />
                {nowMs > 0 && r.settledAtMs !== null ? <span className="type-caption text-ink-muted numbers">{timeAgo(r.settledAtMs, nowMs)}</span> : null}
                <span className={cn("type-data shrink-0 numbers", r.pnlBase > 0n ? "text-up" : r.pnlBase < 0n ? "text-down" : "text-ink")}>
                  <Masked>{money(r.pnlBase, true)}</Masked>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <TraderEdgeLink />
    </div>
  );
}
