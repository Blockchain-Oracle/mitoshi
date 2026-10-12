"use client";
/**
 * The global account notices (ux-audit fix 13): the session banner for a signed-out visitor (Masayume's was never
 * mounted) and the wrong-network banner for an injected wallet on another chain (Masayume 68f7a09
 * components/chrome/WrongNetworkBanner.tsx, L-10; passkeys are chain-bound and never see it).
 */
import { useEffect, useState } from "react";
import { BANNER, SESSION_BANNER } from "@/lib/copy";
import { useWalletSession } from "@/lib/wallet-session";

const DISMISS_KEY = "cwf.session-banner.dismissed";

export function SessionBanners() {
  const session = useWalletSession();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* storage blocked: show it */
    }
  }, []);
  // While a remembered connection restores (≤ 3 s), the signed-out banner keeps its space but is hidden, so the page
  // does not jump twice (CLS, §3.1): first visits end signed out and it simply appears; a restored session removes it.
  const restoring = session.isConnecting;
  if (session.isConnected && !session.isRightChain) {
    return (
      <div className="shell-banner" role="status">
        <span>{BANNER.wrongNetwork("Tempo")}</span>
        <button type="button" onClick={() => void session.switchToTempo()}>{BANNER.switchTo("Tempo")}</button>
      </div>
    );
  }
  return null;
}
