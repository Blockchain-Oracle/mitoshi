"use client";
/**
 * Portfolio's Earn pocket (R4-7, D-227; earn spec step 9) — Ported from Owarine 90a91d71:web/src/features/markets/
 * portfolio/plate/Pockets.tsx's tile (Mitoshi's `.pocket`, styles/ledger-plate.css): money supplied to the maker vault
 * and the three reserves, at today's worth, with Open to the reserve holding most of it (`/earn?r=`). Self-contained so
 * Portfolio mounts it in its pockets grid; `useEarnWorth` names the same figure beside the money card (FR-5: yours, not
 * in the figure). "—" until all four reads answer. In the pockets' own grammar (R4-4): the kit pill, the figure under
 * the balance eye, and the grouped row on a phone. R6 money (S07, D-230): signed out the tile reads what suppliers
 * made — the maker vault's live return since launch (`returns.ts`), in its tone — and opens /earn.
 */
import type { Address } from "@cwf/core";
import { makerSheet, oneUnit } from "@cwf/core";
import { MARKETS_POLL_MS } from "@cwf/core/constants";
import { getMakerVaultState } from "@cwf/markets/maker";
import { useReadingQuery } from "@cwf/markets/react";
import { ChevronRight, Coins } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Masked } from "@/components/kit/Masked";
import { PillLink } from "@/components/kit/Pill";
import { money } from "@/features/terminal/format";
import { cn } from "@/lib/utils";
import { EARN } from "./copy";
import { sinceLaunch } from "./returns";
import { earnKeys, useEarnWorth } from "./shares";
import { DECIMALS } from "./format";
import "@/components/kit/kit.css";

export { useEarnWorth };

/** The maker vault's return since launch, from the same read and key /earn uses; null until it answers. */
function useMakerReturn() {
  const vault = useReadingQuery(earnKeys.vault(), getMakerVaultState, { pollMs: MARKETS_POLL_MS });
  if (!vault?.ok || !vault.value) return null;
  const sheet = makerSheet(vault.value);
  return sinceLaunch(sheet.sharePriceRaw, oneUnit(sheet.decimals));
}

function Tile({ href, amount, note }: { href: string; amount: ReactNode; note: string }) {
  const { pocket } = EARN;
  return (
    <div className="contents">
      <article className="pocket">
        <header className="flex items-center gap-3">
          <span className="pocket-icon"><Coins aria-hidden className="size-4" /></span>
          <h3 className="min-w-0 flex-1 truncate type-body-strong text-ink">{pocket.label}</h3>
        </header>
        <p className="numbers pocket-amount">{amount}</p>
        <p className="pocket-note">{note}</p>
        <PillLink tone="ink" size="sm" className="self-start" href={href}>{pocket.open}</PillLink>
      </article>
      <Link href={href} className="pocket-chip" aria-label={`${pocket.label} · ${pocket.open}`}>
        <span className="pocket-icon"><Coins aria-hidden className="size-4" /></span>
        <span className="pocket-chip-body">
          <span className="pocket-chip-label">{pocket.label}</span>
          <span className="numbers pocket-chip-amount">{amount}</span>
          <span className="pocket-chip-why">{note}</span>
        </span>
        <ChevronRight aria-hidden className="pocket-chip-chev size-4 shrink-0 text-ink-secondary" />
      </Link>
    </div>
  );
}

export function EarnPocket({ wallet }: { wallet: Address }) {
  const worth = useEarnWorth(wallet);
  const href = worth && worth.largest !== "maker" ? `/earn?r=${worth.largest}` : "/earn";
  const amount = worth === null ? "—" : <Masked>{money(worth.totalBase, false, DECIMALS)}</Masked>;
  return <Tile href={href} amount={amount} note={EARN.pocket.note} />;
}

/** Signed out: what suppliers made, in words and tone ("Suppliers −1.09%"), never a projected yield. */
export function EarnPocketPreview() {
  const ret = useMakerReturn();
  const amount = ret ? <span className={cn(ret.tone === "up" ? "text-up" : ret.tone === "down" ? "text-down" : "text-ink")}>{EARN.pocket.suppliers(ret.text)}</span> : "—";
  return <Tile href="/earn" amount={amount} note={EARN.pocket.sinceLaunch} />;
}
