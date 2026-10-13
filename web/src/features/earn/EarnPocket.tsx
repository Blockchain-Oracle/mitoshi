"use client";
/**
 * Portfolio's Earn pocket (R4-7, D-227; earn spec step 9) — Ported from Owarine 90a91d71:web/src/features/markets/
 * portfolio/plate/Pockets.tsx's tile (Mitoshi's `.pocket`, styles/ledger-plate.css): money supplied to the maker vault
 * and the three reserves, at today's worth, with Open to the reserve holding most of it (`/earn?r=`). Self-contained so
 * Portfolio mounts it in its pockets grid; `useEarnWorth` names the same figure beside the money card (FR-5: yours, not
 * in the figure). "—" until all four reads answer.
 */
import type { Address } from "@cwf/core";
import { formatBaseUnits } from "@cwf/core/units";
import { Coins } from "lucide-react";
import Link from "next/link";
import { EARN } from "./copy";
import { useEarnWorth } from "./shares";
import { DECIMALS } from "./format";

export { useEarnWorth };

export function EarnPocket({ wallet }: { wallet: Address }) {
  const worth = useEarnWorth(wallet);
  const { pocket } = EARN;
  const href = worth && worth.largest !== "maker" ? `/earn?r=${worth.largest}` : "/earn";
  return (
    <article className="pocket">
      <header className="flex items-center gap-3">
        <span className="pocket-icon"><Coins aria-hidden className="size-4" /></span>
        <h3 className="min-w-0 flex-1 truncate type-body-strong text-ink">{pocket.label}</h3>
      </header>
      <p className="numbers pocket-amount">{worth === null ? "—" : `$${formatBaseUnits(worth.totalBase, DECIMALS, { maxDp: 2, minDp: 2 })}`}</p>
      <p className="flex-1 type-caption text-ink-secondary">{pocket.note}</p>
      <Link href={href} className="pocket-manage">{pocket.open}</Link>
    </article>
  );
}
