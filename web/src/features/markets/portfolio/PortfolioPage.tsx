"use client";
// The /portfolio island: the screen once the late data layer exists (§3.1); feature sheets load with the route. Signed
// out it is the connect card alone; the signed-in ledger is its own island (D-183), one hop from here as before.
import dynamic from "next/dynamic";
import { LoadingState } from "@/components/states";
import { useWalletSession } from "@/lib/wallet-session";
import { useDataReady } from "@/providers/data/context";
const Loading = () => <LoadingState shape="page" className="mx-auto w-full max-w-(--content-reading)" />;
const PortfolioScreen = dynamic(() => import("./PortfolioScreen").then((m) => m.PortfolioScreen), { ssr: false, loading: Loading });
const SignedInPortfolio = dynamic(() => import("./SignedInPortfolio").then((m) => m.SignedInPortfolio), { ssr: false, loading: Loading });
import "@/styles/ledger-plate.css";
import "@/styles/history.css";
import "@/styles/claim-winnings.css";
import "../markets.css";

export function PortfolioPage() {
  const ready = useDataReady();
  const wallet = useWalletSession().address;
  if (!ready) return <Loading />;
  return wallet ? <SignedInPortfolio wallet={wallet} /> : <PortfolioScreen />;
}
