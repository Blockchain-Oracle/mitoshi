"use client";
/**
 * The wrong-network banner for an injected wallet on another chain (Masayume 68f7a09 components/chrome/
 * WrongNetworkBanner.tsx, L-10); passkeys are chain-bound and never see it. The signed-out "You're browsing" strip is
 * gone (P0, D-223): DEMO mode is the signed-out state.
 */
import { BANNER } from "@/lib/copy";
import { useWalletSession } from "@/lib/wallet-session";

export function SessionBanners() {
  const session = useWalletSession();
  if (!session.isConnected || session.isRightChain) return null;
  return (
    <div className="shell-banner" role="status">
      <span>{BANNER.wrongNetwork("Tempo")}</span>
      <button type="button" onClick={() => void session.switchToTempo()}>{BANNER.switchTo("Tempo")}</button>
    </div>
  );
}
