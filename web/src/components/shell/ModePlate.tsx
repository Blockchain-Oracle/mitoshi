"use client";
// Ported from Owarine 90a91d71:web/src/components/shell/app/ModeChip.tsx (`NetworkPlate`, `NetworkStamp`; R4-8,
// D-227) — which world you are in, at the rail's head. Not a picker: the connection decides. Signed out is DEMO (paper
// dollars on live prices; the pass asks you to sign in), signed in is TESTNET (Tempo Moderato test dollars; the pass
// opens /status, with a live dot). Each world has a hanko, as Owarine's: 練 (practice) for the demo, 試 (trial) for the
// testnet, pressed again whenever the world changes. The full rail carries the plate (a ticket torn from the rail: the
// stamp on a stub, a perforation, the name and the money); the icon rail carries the stamp alone. Replaces the static
// TESTNET pill.
import { ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { SHELL } from "@/lib/copy";
import { webEnv } from "@/lib/env";
import { hasStoredConnection } from "@/lib/stored-session";
import { cn } from "@/lib/utils";
import { useWalletSession } from "@/lib/wallet-session";
import type { EnvironmentMode } from "./environment";

/** The world the shell is in: the session decides. A session still restoring reads as the testnet it most likely is (a
 *  returning account never flashes DEMO); `EnvironmentMode` holds the canvas until it settles. */
const noSubscribe = () => () => undefined;
// The plate's figure and eye load after first paint (the demo store stays out of every route's first load).
const DemoPlateFigure = dynamic(() => import("./DemoPlateMoney").then((m) => m.DemoPlateFigure), { ssr: false, loading: () => <span className="mode-plate-money" /> });
const DemoPlateEye = dynamic(() => import("./DemoPlateMoney").then((m) => m.DemoPlateEye), { ssr: false, loading: () => <span className="mode-plate-eye" /> });

export function useShellMode(): EnvironmentMode {
  const session = useWalletSession();
  // A connect the visitor started keeps DEMO until it lands; only a returning account's restore reads as testnet (T14).
  const stored = useSyncExternalStore(noSubscribe, () => hasStoredConnection(document.cookie), () => false);
  return session.isConnected || (session.isConnecting && stored) ? "testnet" : "demo";
}

export function modeWords(mode: EnvironmentMode) {
  const words = SHELL.mode[mode];
  return mode === "testnet" && webEnv.markets.network !== "testnet" ? { ...words, label: SHELL.modeMainnet } : words;
}

/** The hanko: the world's kanji in a rounded square, pressed again whenever the world changes. */
export function ModeStampMark({ mode, className }: { mode: EnvironmentMode; className?: string }) {
  return (
    <span key={mode} aria-hidden className={cn("mode-stamp", className)}>
      {SHELL.mode[mode].kanji}
    </span>
  );
}

/** The demo's pass asks you to sign in; the testnet's opens the network's status. */
function Pass({ mode, className, children }: { mode: EnvironmentMode; className: string; children: ReactNode }) {
  const session = useWalletSession();
  const words = modeWords(mode);
  if (mode === "demo") {
    return (
      <button type="button" onClick={session.connect} title={words.hint} aria-label={words.hint} className={className} data-mode={mode}>
        {children}
      </button>
    );
  }
  return (
    <Link href="/status" title={words.hint} aria-label={words.hint} className={className} data-mode={mode}>
      {children}
    </Link>
  );
}

/**
 * Signed out (R6 shell S23; Mercury's demo selector, Owarine's DEMO plate): the plate carries the paper balance — DEMO
 * over $10,000.00 with the privacy eye — and is no button: Sign in lives once, at the rail's foot.
 */
function DemoPlate({ className }: { className?: string }) {
  const words = modeWords("demo");
  return (
    <div className={cn("mode-plate is-demo", className)} data-mode="demo" title={words.line}>
      <span className="mode-plate-stub">
        <ModeStampMark mode="demo" />
      </span>
      <span aria-hidden className="mode-plate-perf" />
      <span className="mode-plate-copy">
        <span className="mode-plate-label is-small">{words.label}</span>
        <DemoPlateFigure />
      </span>
      <DemoPlateEye />
    </div>
  );
}

/** The full rail's pass (≥ 1280 px). The notches are cut in the rail's own colour, so it reads as torn from the rail. */
export function ModePlate({ className }: { className?: string }) {
  const mode = useShellMode();
  const words = modeWords(mode);
  if (mode === "demo") return <DemoPlate className={className} />;
  return (
    <Pass mode={mode} className={cn("mode-plate", className)}>
      <span className="mode-plate-stub">
        <ModeStampMark mode={mode} />
      </span>
      <span aria-hidden className="mode-plate-perf" />
      <span className="mode-plate-copy">
        <span className="mode-plate-label">{words.label}</span>
        <span className="mode-plate-line">
          {mode === "testnet" ? <span aria-hidden className="mode-ping" /> : null}
          {words.line}
        </span>
      </span>
      <ArrowUpRight aria-hidden className="mode-plate-arrow" strokeWidth={2.5} />
    </Pass>
  );
}

/** The icon rail's pass (768–1279 px): the stamp alone, on the plate's colour. */
export function ModeStamp({ className }: { className?: string }) {
  const mode = useShellMode();
  return (
    <Pass mode={mode} className={cn("mode-stamp-tile", className)}>
      <ModeStampMark mode={mode} />
    </Pass>
  );
}
