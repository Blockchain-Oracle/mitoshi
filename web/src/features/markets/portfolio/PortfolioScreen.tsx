"use client";
/**
 * Portfolio signed out (Owarine 90a91d71 `PortfolioScreen` signed-out grid; P2, D-223): two cards across the page — the
 * way in, and the DEMO paper balance this browser trades with. No headline, no paragraph. The signed-in body is its own
 * island (`SignedInPortfolio`, D-183).
 */
import { formatBaseUnits } from "@cwf/core/units";
import { ArrowRight, Wallet } from "lucide-react";
import Link from "next/link";
import { useDemoState } from "@/features/terminal/demo";
import { useWalletSession } from "@/lib/wallet-session";
import { HERO_MONEY, PLATE } from "../copy";

function ConnectCard({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="connect-card">
      <span aria-hidden className="connect-card-icon"><Wallet className="size-5" /></span>
      <h2 className="connect-card-title">{PLATE.connect.title}</h2>
      <div className="flex flex-col items-center gap-3">
        <button type="button" onClick={onSignIn} className="btn btn-primary min-h-touch">{PLATE.connect.title}</button>
        <Link href="/how-it-works" className="connect-card-link min-h-touch py-2">{PLATE.connect.newHere}</Link>
      </div>
    </div>
  );
}

function DemoCard() {
  const demo = useDemoState();
  return (
    <div className="pocket">
      <header className="flex items-center gap-3">
        <span className="tm-demo-tag">DEMO</span>
        <h3 className="min-w-0 flex-1 truncate type-body-strong text-ink">{HERO_MONEY.demo.title}</h3>
      </header>
      <p className="numbers pocket-amount">${formatBaseUnits(BigInt(demo.balanceBase), 6, { maxDp: 2, minDp: 2 })}</p>
      <p className="type-caption text-ink-secondary">{HERO_MONEY.demo.note} {demo.positions.length > 0 ? `${demo.positions.length} ${HERO_MONEY.open}.` : ""}</p>
      <Link href="/trade/BTC" className="pocket-manage inline-flex items-center gap-1.5">{HERO_MONEY.demo.cta} <ArrowRight aria-hidden className="size-4" /></Link>
    </div>
  );
}

export function PortfolioScreen() {
  const session = useWalletSession();
  return (
    <div className="container grid gap-4 px-gutter py-8 lg:grid-cols-2 lg:items-start lg:px-gutter-desktop">
      <ConnectCard onSignIn={session.connect} />
      <DemoCard />
    </div>
  );
}
