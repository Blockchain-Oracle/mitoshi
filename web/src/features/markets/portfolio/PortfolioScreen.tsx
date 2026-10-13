"use client";
/**
 * Portfolio signed out (Owarine 90a91d71 `PortfolioScreen` signed-out grid; P2, D-223; R4-4, D-227): two cards — the way
 * in first (its button in the first screen at 320 px), then the DEMO paper balance this browser trades with, its open
 * count and what it has made or lost on paper. No headline, no paragraph, no inset of its own (the stage pads). The
 * signed-in body is its own island (`SignedInPortfolio`, D-183).
 */
import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { Masked, PillButton } from "@/components/kit";
import { useDemoState } from "@/features/terminal/demo";
import { money } from "@/features/terminal/format";
import { useWalletSession } from "@/lib/wallet-session";
import { HERO_MONEY, PLATE } from "../copy";

function ConnectCard({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="connect-card">
      <span aria-hidden className="connect-card-icon"><Wallet className="size-5" /></span>
      <h2 className="connect-card-title">{PLATE.connect.title}</h2>
      <div className="flex flex-col items-center gap-3">
        <PillButton tone="accent" size="lg" onClick={onSignIn}>{PLATE.connect.action}</PillButton>
        <Link href="/how-it-works" className="connect-card-link min-h-touch py-2">{PLATE.connect.newHere}</Link>
      </div>
    </div>
  );
}

function DemoCard() {
  const demo = useDemoState();
  const paper = demo.history.reduce((sum, t) => sum + BigInt(t.pnlBase), 0n);
  return (
    <div className="pocket">
      <header className="flex items-center gap-3">
        <span className="tm-demo-tag">DEMO</span>
        <h3 className="min-w-0 flex-1 truncate type-body-strong text-ink">{HERO_MONEY.demo.title}</h3>
      </header>
      <p className="numbers pocket-amount"><Masked>{money(BigInt(demo.balanceBase))}</Masked></p>
      <p className="type-caption text-ink-secondary numbers"><Masked>{HERO_MONEY.demo.line(demo.positions.length, money(paper, true))}</Masked></p>
      <PillButton tone="ink" size="sm" className="self-start" nativeButton={false} render={<Link href="/trade/BTC" />}>
        {HERO_MONEY.demo.cta} <ArrowRight aria-hidden />
      </PillButton>
    </div>
  );
}

export function PortfolioScreen() {
  const session = useWalletSession();
  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <ConnectCard onSignIn={session.connect} />
      <DemoCard />
    </div>
  );
}
