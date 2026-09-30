"use client";
/**
 * Portfolio (Ported from Masayume 68f7a09:web/src/features/markets/portfolio/PortfolioScreen.tsx): no headline — the
 * nav says where you are, and the number is what the page is opened for. S4 order (ux-audit fix 4): what is waiting to
 * collect FIRST when there is any (it sat below the fold as section 02/03 in the references), then the money plate, the
 * Trader Edge link, and your bets. Critical reads first; the settled-history scan waits for them. One outage is said
 * once, not once per panel. This island is the signed-out page, the connect card; the signed-in body is its own
 * island (`SignedInPortfolio`, D-183).
 */
import Link from "next/link";
import { useWalletSession } from "@/lib/wallet-session";
import { PLATE } from "../copy";

function ConnectCard({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className="connect-card">
      <h2 className="connect-card-title">{PLATE.connect.title}</h2>
      <p className="mb-6 type-body text-ink-secondary">{PLATE.connect.body}</p>
      <div className="flex flex-col items-center gap-3">
        <button type="button" onClick={onSignIn} className="btn btn-primary min-h-touch">{PLATE.connect.title}</button>
        <Link href="/how-it-works" className="connect-card-link min-h-touch py-2">{PLATE.connect.newHere}</Link>
      </div>
    </div>
  );
}

/** Signed out: the connect card (the signed-in ledger is `SignedInPortfolio`, chosen by `PortfolioPage`). */
export function PortfolioScreen() {
  const session = useWalletSession();
  return (
    <div className="mx-auto flex w-full max-w-(--content-reading) flex-col gap-4 px-gutter py-8">
      <ConnectCard onSignIn={session.connect} />
    </div>
  );
}
