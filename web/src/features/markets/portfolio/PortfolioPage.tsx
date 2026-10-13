"use client";
// The /portfolio island: the screen once the late data layer exists (§3.1); feature sheets load with the route. Signed
// out it is the connect card alone; the signed-in ledger is its own island (D-183), one hop from here as before.
import dynamic from "next/dynamic";
import { useWalletSession } from "@/lib/wallet-session";
import { useDataReady } from "@/providers/data/context";
// The page's own outline, full width (R4-4, D-227: a reading-width head skeleton snapped into a full-width page).
const Loading = () => <LoadingFrame shape="portfolio">{portfolioShape()}</LoadingFrame>;
const PortfolioScreen = dynamic(() => import("./PortfolioScreen").then((m) => m.PortfolioScreen), { ssr: false, loading: Loading });
const SignedInPortfolio = dynamic(() => import("./SignedInPortfolio").then((m) => m.SignedInPortfolio), { ssr: false, loading: Loading });
import "@/styles/ledger-plate.css";
import "@/styles/history.css";
import "@/styles/claim-winnings.css";
import "../markets.css";
import "@/styles/vault.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { portfolio as portfolioShape } from "@/components/states/shapes/money";

export function PortfolioPage() {
  const ready = useDataReady();
  const wallet = useWalletSession().address;
  if (!ready) return <Loading />;
  return wallet ? <SignedInPortfolio wallet={wallet} /> : <PortfolioScreen />;
}

/** The route's loading boundary draws this same placeholder, so a navigation swaps it once, in place (R4-13a, D-227). */
export { Loading as PortfolioLoading };
