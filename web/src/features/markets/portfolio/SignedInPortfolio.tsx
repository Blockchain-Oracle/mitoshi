"use client";
/**
 * The signed-in Portfolio (split from `PortfolioScreen`, D-183), in Owarine 90a91d71's order (P2, D-223): the money card,
 * the pockets (Trading Balance, Private) with their controls in a sheet, 01 your bets, 02 what waits to collect, then
 * the record and the Trader Edge link. Its own island, loaded once a wallet is
 * there, so a signed-out visitor (the connect card) never evaluates the ledger, the ticket-grade tx components or the
 * Trading Balance controls. The motion scope rides inside it (§3.1). D-227: positions are valued as the terminal values
 * them (`usePortfolioPositions`: what Close pays now, the rest at cost), so the money card and the rows match /trade.
 */
import type { Address, Reading } from "@cwf/core";
import { isOk } from "@cwf/core";
import { keys, useAccountHistory, useBalanceSheet, useClaimables, useLiveMarketData, usePositions, useVaultBets } from "@cwf/markets/react";
import { useOwed } from "@/features/terminal/useOwed";
import { useTerminalClose } from "@/features/terminal/useTerminalClose";
import { usePrivateBudget } from "@/features/private/usePrivate";
import { openFunds } from "@/lib/funds-event";
import { MoneyHero, type HeroMoney } from "./MoneyHero";
import { Pockets } from "./Pockets";
import SectionHead from "@/components/shell/SectionHead";
import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback } from "react";
import { MotionScope } from "@/components/motion-scope";
import { ErrorState } from "@/components/states";
import { TradingBalancePanel } from "@/features/vault/TradingBalancePanel";
import { EARN } from "@/features/earn/copy";
import { EarnPocket, useEarnWorth } from "@/features/earn/EarnPocket";
import { HERO_MONEY, PLATE, PORTFOLIO } from "../copy";
import { CollectPlate } from "../claims/CollectPlate";
import { BetsPanel } from "./BetsPanel";
import { BridgeInFlight } from "@/features/bridge/BridgeInFlight";
import { RecordChart } from "./RecordChart";
import { PositionValuers, usePortfolioPositions } from "./usePortfolioPositions";

// Boosts (S10c) load as their own island: the leverage reads and lane stay out of the Portfolio's first load.
const BoostPositions = dynamic(() => import("@/features/boost/BoostPositions").then((m) => m.BoostPositions), { ssr: false });
// The private desk (S10d): its balance moves, the desk's cells and the account's private bets — its own island too.
const PrivateDesk = dynamic(() => import("@/features/private/PrivateDesk").then((m) => m.PrivateDesk), { ssr: false });

const CONNECTION = new Set(["rpc-down", "indexer-down", "send-unknown", "unknown"]);

function outageOf(readings: readonly (Reading<unknown> | null)[]) {
  if (readings.some((r) => r === null)) return null;
  const failed = readings.filter((r) => r && !r.ok);
  if (failed.length !== readings.length) return null;
  const first = failed[0];
  return first && !first.ok && CONNECTION.has(first.error.kind) ? first.error : null;
}

export function SignedInPortfolio({ wallet }: { wallet: Address }) {
  return (
    <MotionScope>
      <Ledger wallet={wallet} />
    </MotionScope>
  );
}

function Ledger({ wallet }: { wallet: Address }) {
  const queryClient = useQueryClient();
  const sheet = useBalanceSheet(wallet);
  const positions = usePositions(wallet);
  const vaultBets = useVaultBets(wallet);
  const claimables = useClaimables(wallet);
  const book = usePortfolioPositions(wallet);
  const owed = useOwed(wallet, book.positions);
  const closer = useTerminalClose();
  const critical = [sheet, positions, claimables];
  const criticalSettled = critical.every((r) => r !== null);
  const history = useAccountHistory(wallet, criticalSettled);
  const privateBudget = usePrivateBudget(wallet);
  const earn = useEarnWorth(wallet);
  useLiveMarketData({ wallet });
  const retry = useCallback(() => void queryClient.invalidateQueries({ queryKey: keys.positions(wallet) }), [queryClient, wallet]);

  const outage = outageOf(critical);
  if (outage) {
    return (
      <div className="mx-auto flex w-full max-w-(--content-reading) flex-col gap-4 px-gutter py-8">
        <ErrorState diagnosis={outage} retry={() => void queryClient.invalidateQueries()} />
      </div>
    );
  }
  const rows = claimables && isOk(claimables) ? claimables.value : [];
  const value = sheet?.ok ? sheet.value : null;
  const money: HeroMoney = {
    decimals: value?.decimals ?? 6,
    dollarsBase: value ? value.spendableBase + (value.vaultBase ?? 0n) : 0n,
    readyBase: value?.spendableBase ?? 0n,
    // Every position at what it counts for (D-227): the part the book takes at what Close pays, the rest at cost; a
    // Trading Balance Window that has its answer at its payout until the settler cranks it into the balance.
    positionsBase: book.totals.equityBase + owed.vaultBase,
    // Read with the wallet's balance (D-227), so a payout the settler just made is never in both legs at once.
    collectBase: value ? owed.collectBase : rows.reduce((sum, r) => sum + r.netPayoutBase, 0n),
    // Engine credit is already inside the collect leg (a redeem pays it); only resting-order escrow is named apart.
    pools: [
      ...(value?.orderEscrowBase ? [{ id: "escrow", label: PLATE.pools.escrow.label, amountBase: value.orderEscrowBase }] : []),
      // R4-7: money supplied to the vault and the reserves is yours but not in the figure (FR-5).
      ...(earn && earn.totalBase > 0n ? [{ id: "earn", label: EARN.pocket.label, amountBase: earn.totalBase }] : []),
    ],
    // Every leg read (the balance sheet, both homes' positions, claimables), so the figure never sums a leg still at 0 (R4-0).
    ready: value !== null && criticalSettled && vaultBets !== null,
  };
  return (
    <div className="container flex flex-col gap-10 px-gutter py-8 lg:px-gutter-desktop">
      <PositionValuers positions={book.positions} onValue={book.onValue} />
      <MoneyHero money={money} openBets={book.groups.length} settled={history?.ok ? history.value.rounds.length : 0} onAdd={openFunds} />
      <Pockets
        decimals={money.decimals}
        pockets={[
          { id: "vault", amountBase: value?.vaultBase ?? null, panel: <TradingBalancePanel /> },
          { id: "private", amountBase: privateBudget?.ok ? privateBudget.value.balanceBase : null, panel: <PrivateDesk wallet={wallet} index="" /> },
        ]}
      >
        <EarnPocket wallet={wallet} />
      </Pockets>
      <BetsPanel wallet={wallet} positions={positions} open={{ groups: book.groups, values: book.values, closer }} history={history} index="01" retry={retry} />
      <BoostPositions wallet={wallet} index="" values={book.values} />
      <BridgeInFlight wallet={wallet} />
      {rows.length > 0 ? (
        <section className="flex flex-col gap-4" aria-label={HERO_MONEY.collectTitle}>
          <SectionHead number="02" title={HERO_MONEY.collectTitle} />
          <CollectPlate wallet={wallet} rows={rows} />
        </section>
      ) : null}
      <RecordChart history={history} onRetry={() => void queryClient.invalidateQueries({ queryKey: keys.history(wallet) })} />
      <Link href="/portfolio/edge" className="min-h-touch self-start py-2 type-caption text-accent">{PORTFOLIO.traderEdge}</Link>
    </div>
  );
}
