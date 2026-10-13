"use client";
/**
 * The signed-in Portfolio (split from `PortfolioScreen`, D-183), in Owarine 90a91d71's order (P2, D-223; R4-4, D-227):
 * the money card, the pockets (Trading Balance, Private where it exists, R4-7's Earn tile) with their controls in a
 * sheet, 01 your bets (every home: the wallet, the Trading Balance, Boosts), then what waits to collect (only when
 * there is any), then the record and the Trader Edge link. One money reading (`useMoney`) feeds the card, the tiles, the sheets and the rows,
 * so they can't disagree; positions are valued and closed as the terminal values and closes them. Its own island,
 * loaded once a wallet is there. One inset: the stage pads; this page adds none.
 */
import type { Address, Reading } from "@cwf/core";
import { isOk } from "@cwf/core";
import { keys, useAccountHistory, useLiveMarketData } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useCallback } from "react";
import { SectionHeader } from "@/components/shell/SectionHeader";
import { MotionScope } from "@/components/motion-scope";
import { ErrorState, LoadingState } from "@/components/states";
import { useBoostWrites } from "@/features/boost/useBoostWrites";
import { useTerminalClose } from "@/features/terminal/useTerminalClose";
import { BOOST_KEYS } from "@/features/terminal/terminal-positions";
import { EarnPocket } from "@/features/earn/EarnPocket";
import { TradingBalancePanel } from "@/features/vault/TradingBalancePanel";
import { openFunds } from "@/lib/funds-event";
import { CLAIM, HERO_MONEY } from "../copy";
import { CollectPlate } from "../claims/CollectPlate";
import { collectableRows, useCollect } from "../claims/useCollect";
import { RecordSection } from "../history/RecordSection";
import { TraderEdgeLink } from "../history/TraderEdgeLink";
import { BetsPanel } from "./BetsPanel";
import { MoneyHero } from "./MoneyHero";
import { Pockets } from "./Pockets";
import { useMoney } from "./useMoney";
import { PositionValuers } from "./usePortfolioPositions";
import "@/components/kit/kit.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { portfolio as portfolioShape } from "@/components/states/shapes/money";

// The private balance (S10d): its moves, tiles and the account's private bets — its own island.
const PrivateBalancePanel = dynamic(() => import("@/features/private/PrivateBalancePanel").then((m) => m.PrivateBalancePanel), { ssr: false, loading: () => <LoadingState shape="row" /> });

const CONNECTION = new Set(["rpc-down", "indexer-down", "send-unknown", "unknown"]);

function outageOf(readings: readonly (Reading<unknown> | null)[]) {
  if (readings.some((r) => r === null)) return null;
  const failed = readings.filter((r) => r && !r.ok);
  if (failed.length !== readings.length) return null;
  const first = failed[0];
  return first && !first.ok && CONNECTION.has(first.error.kind) ? first.error : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function SignedInPortfolio({ wallet }: { wallet: Address }) {
  return (
    <MotionScope>
      <Ledger wallet={wallet} />
    </MotionScope>
  );
}

function Ledger({ wallet }: { wallet: Address }) {
  const queryClient = useQueryClient();
  const { money, book, sheet, positions, vaultBets, claimables, boosts } = useMoney(wallet);
  const closer = useTerminalClose();
  const boostWrites = useBoostWrites(wallet);
  const collector = useCollect(wallet);
  const history = useAccountHistory(wallet, sheet !== null);
  useLiveMarketData({ wallet });
  const retryOpen = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: keys.positions(wallet) });
    void queryClient.invalidateQueries({ queryKey: [...BOOST_KEYS] });
    void queryClient.invalidateQueries({ queryKey: keys.vault(wallet) });
  }, [queryClient, wallet]);
  const retryHistory = useCallback(() => void queryClient.invalidateQueries({ queryKey: keys.history(wallet) }), [queryClient, wallet]);

  const outage = outageOf([sheet, positions, claimables]);
  if (outage) return <ErrorState diagnosis={outage} retry={() => void queryClient.invalidateQueries()} />;
  // Nothing read yet: the page's outline, not a card of dashes.
  if (sheet === null) return <LoadingFrame shape="portfolio">{portfolioShape()}</LoadingFrame>;

  const rows = claimables && isOk(claimables) ? claimables.value : [];
  const live = collectableRows(rows);
  const settled = history?.ok ? history.value.rounds.length : null;
  const failedHome = [positions, vaultBets, boosts].find((r) => r !== null && !r.ok);
  const showCollect = rows.length > 0 || money.boostOwedBase > 0n;
  // Sections number at runtime: 01 bets, then collect (only when there is any), then the record.
  const collectIndex = pad(2);
  const recordIndex = pad(2 + (showCollect ? 1 : 0));
  const runCollect = () => {
    if (live.length > 0) void collector.collect(live);
    else if (money.boostOwedBase > 0n) void boostWrites.claimOwed();
  };
  const collectBusy = collector.tx.kind === "signing" || collector.tx.kind === "submitted" || boostWrites.busy === "owed";

  return (
    <div className="flex flex-col gap-6 lg:gap-10">
      <PositionValuers positions={book.positions} onValue={book.onValue} />
      <MoneyHero money={money} settled={settled} onAdd={openFunds} collect={live.length > 0 || money.boostOwedBase > 0n ? { busy: collectBusy, run: runCollect } : null} />
      <Pockets
        decimals={money.decimals}
        pockets={money.pockets}
        panels={{ vault: <TradingBalancePanel />, private: <PrivateBalancePanel wallet={wallet} /> }}
      >
        <EarnPocket wallet={wallet} />
      </Pockets>
      <BetsPanel
        index="01"
        open={{ groups: book.groups, values: book.values, closer, boosts: boostWrites, count: money.openCount, failed: failedHome && !failedHome.ok ? { diagnosis: failedHome.error, retry: retryOpen } : null }}
        history={history}
        retryHistory={retryHistory}
      />
      {showCollect ? (
        <section className="flex flex-col gap-3" aria-labelledby="collect-title">
          <SectionHeader id="collect-title" className="section-head-fit" index={collectIndex} title={HERO_MONEY.collectTitle} aside={rows.length > 0 ? <span className="type-caption text-ink-secondary">{CLAIM.waiting(rows.length)}</span> : null} />
          <CollectPlate wallet={wallet} rows={rows} bare collector={collector} boostOwed={{ amountBase: money.boostOwedBase, busy: boostWrites.busy === "owed", collect: () => void boostWrites.claimOwed() }} />
        </section>
      ) : null}
      <RecordSection history={history} openCount={money.openCount} address={wallet} index={recordIndex} retry={retryHistory} />
      <TraderEdgeLink />
    </div>
  );
}
