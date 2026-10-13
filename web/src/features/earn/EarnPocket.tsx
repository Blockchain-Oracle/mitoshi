"use client";
/**
 * Portfolio's Earn pocket (R4-7, D-227; earn spec step 9) — Ported from Owarine 90a91d71:web/src/features/markets/
 * portfolio/plate/Pockets.tsx's tile (Mitoshi's `.pocket`, styles/ledger-plate.css): money supplied to the maker vault
 * and the three reserves, at today's worth, with Open to the reserve holding most of it (`/earn?r=`). Self-contained so
 * Portfolio mounts it in its pockets grid; `useEarnWorth` names the same figure beside the money card (FR-5: yours, not
 * in the figure). "—" until all four reads answer. In the pockets' own grammar (R4-4): the kit pill, the figure under
 * the balance eye, and the tappable chip under 400 px.
 */
import type { Address } from "@cwf/core";
import { ChevronRight, Coins } from "lucide-react";
import Link from "next/link";
import { Masked, PillButton } from "@/components/kit";
import { money } from "@/features/terminal/format";
import { EARN } from "./copy";
import { useEarnWorth } from "./shares";
import { DECIMALS } from "./format";

export { useEarnWorth };

export function EarnPocket({ wallet }: { wallet: Address }) {
  const worth = useEarnWorth(wallet);
  const { pocket } = EARN;
  const href = worth && worth.largest !== "maker" ? `/earn?r=${worth.largest}` : "/earn";
  const amount = worth === null ? "—" : <Masked>{money(worth.totalBase, false, DECIMALS)}</Masked>;
  return (
    <div className="contents">
      <article className="pocket">
        <header className="flex items-center gap-3">
          <span className="pocket-icon"><Coins aria-hidden className="size-4" /></span>
          <h3 className="min-w-0 flex-1 truncate type-body-strong text-ink">{pocket.label}</h3>
        </header>
        <p className="numbers pocket-amount">{amount}</p>
        <p className="pocket-note">{pocket.note}</p>
        <PillButton tone="ink" size="sm" className="self-start" nativeButton={false} render={<Link href={href} />}>{pocket.open}</PillButton>
      </article>
      <Link href={href} className="pocket-chip" aria-label={`${pocket.label} · ${pocket.open}`}>
        <span className="pocket-icon"><Coins aria-hidden className="size-3.5" /></span>
        <span className="pocket-chip-body">
          <span className="pocket-chip-label">{pocket.label}</span>
          <span className="numbers pocket-chip-amount">{amount}</span>
        </span>
        <ChevronRight aria-hidden className="pocket-chip-chev size-4 shrink-0 text-ink-secondary" />
      </Link>
    </div>
  );
}
