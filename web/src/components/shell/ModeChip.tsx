"use client";
// Owarine 90a91d71 `components/shell/app/ModeChip.tsx` (P6, D-224): on phones, which world you are in, beside the
// mark — DEMO (paper dollars, signed out; it opens sign-in) or TESTNET (test dollars; it opens /status). Not a picker:
// the connection decides. The label is its own span: at ≤ 360 px TESTNET keeps its dot and the word goes to screen
// readers only (R4-0, D-227).
import Link from "next/link";
import { SHELL } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { cn } from "@/lib/utils";
import { useWalletSession } from "@/lib/wallet-session";

export function ModeChip({ className }: { className?: string }) {
  const session = useWalletSession();
  const demo = !session.isConnected && !session.isConnecting;
  const cls = cn("mode-chip", className);
  if (demo) {
    return (
      <button type="button" className={cls} data-mode="demo" title={SHELL.demoLabel} onClick={() => session.connect()}>
        {SHELL.modeDemo}
      </button>
    );
  }
  return (
    <Link href="/status" className={cls} data-mode="live" title={SHELL.testnetTitle}>
      <span aria-hidden className="mode-chip-dot" />
      <span className="mode-chip-label">{webEnv.markets.network === "testnet" ? SHELL.modeTestnet : SHELL.modeMainnet}</span>
    </Link>
  );
}
