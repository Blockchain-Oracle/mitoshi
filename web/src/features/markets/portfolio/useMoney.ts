"use client";
// Ported from Owarine 90a91d71:web/src/features/markets/portfolio/plate/useMoney.ts (R4-4, D-227) — every pool read
// once, so the money card, the pockets, their sheets and the rows cannot disagree. On Mitoshi's reads: the wallet's
// pathUSD and resting-order escrow (`useBalanceSheet`), the Trading Balance as the vault holds it — free plus every live
// grant's budget (the vault invariant: wallet + engine credit = Σ available + private + Σ grant budgets) — the private
// balance (named on its tile, never summed), what waits to be collected (the sheet's, read in the same block as the
// balance, plus a Boost payout the receive policy held), and every open position at what Close pays (the terminal's
// value engine, `usePortfolioPositions`). Earn (R4-7) is named under the figure, never in it. `ready` once every leg has
// answered, so the figure never sums a leg still at 0.
import type { Address } from "@cwf/core";
import { listLeveragePositionsOf, readBoostOwed } from "@cwf/markets/leverage";
import { useBalanceSheet, useClaimables, usePositions, useReadingQuery, useVaultBets, useVaultSnapshot } from "@cwf/markets/react";
import { EARN } from "@/features/earn/copy";
import { useEarnWorth } from "@/features/earn/EarnPocket";
import { useSessionView } from "@/features/session/context";
import { BOOST_KEYS } from "@/features/terminal/terminal-positions";
import { useOwed } from "@/features/terminal/useOwed";
import { usePrivateBudget, usePrivateStatus } from "@/features/private/usePrivate";
import { tradingBalanceOf } from "@/features/vault/trading-balance";
import { HERO_MONEY, PLATE } from "../copy";
import { sumMoney } from "./money-sum";
import { usePortfolioPositions } from "./usePortfolioPositions";

export type PocketId = "vault" | "private";

export interface PocketMoney {
  id: PocketId;
  /** Null while it reads. */
  amountBase: bigint | null;
  /** Why it can't be managed here (the tile says so and offers no Manage). */
  blockedReason: string | null;
}

export interface Money {
  decimals: number;
  walletBase: bigint;
  tradingBase: bigint;
  positionsBase: bigint;
  collectBase: bigint;
  /** Wallet + Trading Balance + positions + collect: the one figure. */
  totalBase: bigint;
  /** What a bet can spend now: the wallet's pathUSD. */
  readyBase: bigint;
  /** Yours, named under the figure, never in it. */
  pools: { id: string; label: string; amountBase: bigint }[];
  pockets: PocketMoney[];
  /** Open rows across the wallet, the Trading Balance and Boosts; null until all three have answered. */
  openCount: number | null;
  /** A Boost payout the owner's receive policy refused, held by the reserve (collected in To collect). */
  boostOwedBase: bigint;
  ready: boolean;
}

export function useMoney(wallet: Address) {
  const sheet = useBalanceSheet(wallet);
  const positions = usePositions(wallet);
  const vaultBets = useVaultBets(wallet);
  const claimables = useClaimables(wallet);
  const snapshot = useVaultSnapshot(wallet);
  const view = useSessionView();
  const privateBudget = usePrivateBudget(wallet);
  const privateStatus = usePrivateStatus();
  const boosts = useReadingQuery([...BOOST_KEYS, "positions", wallet], () => listLeveragePositionsOf(wallet), { pollMs: 10_000 });
  const boostOwed = useReadingQuery([...BOOST_KEYS, "owed", wallet], () => readBoostOwed(wallet), { pollMs: 30_000 });
  const earn = useEarnWorth(wallet);
  const book = usePortfolioPositions(wallet);
  const owed = useOwed(wallet, book.positions);

  const value = sheet?.ok ? sheet.value : null;
  const snap = snapshot?.ok ? snapshot.value : null;
  const decimals = value?.decimals ?? 6;
  const walletBase = value?.spendableBase ?? 0n;
  const tradingBase = snap ? tradingBalanceOf(snap) : (value?.vaultBase ?? 0n);
  const boostOwedBase = boostOwed?.ok ? boostOwed.value : 0n;
  // Every position at what it counts for (D-227): the part the book takes at what Close pays, the rest at cost; a
  // Trading Balance Window that has its answer at its payout until the settler cranks it into the balance.
  const positionsBase = book.totals.equityBase + owed.vaultBase;
  const collectBase = owed.collectBase + boostOwedBase;
  const sourcesRead = positions !== null && vaultBets !== null && boosts !== null;
  const ready = value !== null && sourcesRead && claimables !== null && snapshot !== null;

  const privateBalance = privateBudget?.ok ? privateBudget.value.balanceBase : null;
  const vaultPrivate = snap?.account.privateAvailableBase ?? 0n;
  const privateDeployed = Boolean(privateStatus.data?.contract);
  const privateHeld = (privateBalance ?? 0n) + vaultPrivate;
  const pockets: PocketMoney[] = [
    {
      id: "vault",
      amountBase: snapshot === null ? null : tradingBase,
      blockedReason: snapshot?.ok && snapshot.value === null ? HERO_MONEY.blocked.network : view.status === "not-passkey" ? HERO_MONEY.blocked.passkey : null,
    },
  ];
  // Private only where it exists: the desk is deployed, or money sits there (Owarine useMoney: never a dead "—" tile).
  // Its sheet reaches all of it: the desk's moves once deployed, the vault's private bucket by its own withdraw.
  if (privateDeployed || privateHeld > 0n) pockets.push({ id: "private", amountBase: privateBalance === null && vaultPrivate === 0n ? null : privateHeld, blockedReason: null });

  const money: Money = {
    decimals,
    walletBase,
    tradingBase,
    positionsBase,
    collectBase,
    totalBase: sumMoney({ walletBase, tradingBase, positionsBase, collectBase }),
    readyBase: walletBase,
    pools: [
      ...(value?.orderEscrowBase ? [{ id: "escrow", label: PLATE.pools.escrow.label, amountBase: value.orderEscrowBase }] : []),
      // R4-7: money supplied to the vault and the reserves is yours but not in the figure (FR-5).
      ...(earn && earn.totalBase > 0n ? [{ id: "earn", label: EARN.pocket.label, amountBase: earn.totalBase }] : []),
    ],
    pockets,
    openCount: sourcesRead ? book.groups.length : null,
    boostOwedBase,
    ready,
  };
  return { money, book, sheet, positions, vaultBets, claimables, boosts };
}
