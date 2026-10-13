"use client";
// R6 (D-230, owner point 2: "a user must be able to trade"): a blocker that names its fix IS the action. The pill wears
// the fix ("Add money", "Use $1", "Buy $3.40 — what fills", "Try AAPL 15m →") and does it; the reason sits under it as
// one caption line; the stated, readable blocked face (never a 40 % grey ghost) appears only where no fix exists or the
// host can't run it — never a fake action. Faces swap in one grid cell (From 21st.dev 23536 ddoemonn/loading-button)
// on the kit PillButton. References: Phantom's "Buy ETH" and World App's "Deposit USDC.e" in the blocked slot (Refero).
import type { BlockerCopy, BlockerFix } from "@cwf/core/copy";
import { fixLabel } from "@cwf/core/copy";
import { useId, type ReactNode } from "react";
import { PillButton } from "@/components/kit/PillButton";
import { openFunds } from "@/lib/funds-event";
import { useWalletSession } from "@/lib/wallet-session";
import { cn } from "@/lib/utils";
import { Faces } from "./Faces";
import { WaitingText } from "./WaitingText";

export type BlockedTone = "accent" | "up" | "down";

/** A host-made one-tap fix (the liveness ticket's "size that fills"): it overrides the blocker's own. */
export interface HostFix {
  label: string;
  run: () => void;
}

/**
 * Resolves a fix to a handler: the kit runs Add money, Sign in and Switch itself; every other fix needs the host's
 * `onFix`, and without one there is no handler (the CTA then states the block instead of pretending).
 */
export function useFixRunner(onFix?: (fix: BlockerFix) => void, intent?: string): (fix: BlockerFix) => (() => void) | null {
  const session = useWalletSession();
  return (fix) => {
    switch (fix.kind) {
      case "add-money":
        return openFunds;
      case "sign-in":
        return () => session.connectFor(intent ?? fixLabel(fix));
      case "switch-chain":
        return () => void session.switchToTempo();
      default:
        return onFix ? () => onFix(fix) : null;
    }
  };
}

/** A fix that completes the same order keeps the side's colour; a detour (money, sign-in, network) is the accent. */
const SIDE_FIXES: ReadonlySet<BlockerFix["kind"]> = new Set(["set-stake", "other-window", "use-1x"]);

export interface BlockedCtaProps {
  blocker: BlockerCopy;
  tone?: BlockedTone;
  /** The host's handler for the fixes only it can run: set-stake, other-window, use-public, use-1x, retry. */
  onFix?: (fix: BlockerFix) => void;
  /** A host-made fix; overrides `blocker.fix`. */
  fix?: HostFix;
  /** The sign-in sheet's intent ("to place UP · $25.00"). */
  intent?: string;
  /** `lg` = the ticket CTA (52 px); `md` elsewhere. */
  size?: "lg" | "md";
  /** The caption slot's content when the blocker gives no reason (TxCta's "No fees to pay"). */
  caption?: ReactNode;
  className?: string;
}

export function BlockedCta({ blocker, tone = "accent", onFix, fix, intent, size = "lg", caption, className }: BlockedCtaProps) {
  const captionId = useId();
  const resolve = useFixRunner(onFix, intent);
  const own = blocker.fix ? resolve(blocker.fix) : null;
  const live = fix ? { label: fix.label, run: fix.run, side: true } : blocker.fix && own ? { label: fixLabel(blocker.fix), run: own, side: SIDE_FIXES.has(blocker.fix.kind) } : null;
  const reason = blocker.reason ?? caption ?? null;
  const busy = !live && blocker.busy === true;
  // Keyed by what the face IS, not its figures: a countdown or an amount updates in place; a new fix or block swaps.
  const faceKey = live ? `fix:${fix ? "host" : (blocker.fix?.kind ?? "")}` : `block:${blocker.kind ?? blocker.label}`;
  return (
    <div className={cn("bcta", className)} data-state={live ? "fix" : busy ? "busy" : "blocked"}>
      {live ? (
        <PillButton
          type="button"
          data-primary-action=""
          tone={live.side ? tone : "accent"}
          size={size}
          block
          aria-describedby={reason ? captionId : undefined}
          onClick={live.run}
        >
          <Faces faceKey={faceKey}><span className="truncate">{live.label}</span></Faces>
        </PillButton>
      ) : (
        <PillButton
          type="button"
          data-primary-action=""
          data-blocked=""
          tone="ghost"
          size={size}
          block
          aria-disabled="true"
          aria-busy={busy || undefined}
          aria-label={blocker.reason ? `${blocker.label}. ${blocker.reason}` : blocker.label}
          title={blocker.reason ?? blocker.label}
        >
          <Faces faceKey={faceKey}>
            {busy ? <WaitingText timeoutMs={null} size="inherit">{blocker.label}</WaitingText> : <span className="truncate">{blocker.label}</span>}
          </Faces>
        </PillButton>
      )}
      <p id={captionId} className="bcta-caption type-caption" aria-hidden={live ? undefined : true}>{reason}</p>
    </div>
  );
}
