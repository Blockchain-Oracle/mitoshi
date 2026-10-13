// Ported from Owarine 90a91d71:web/src/features/strategies/{activity.ts,lifecycle.ts} (R4-6, D-227) — a copy's state
// from the wallet's own consent and grant (never from the strategy's aggregate counts), and the runner's last report
// read by narrow recognizers for what Mitoshi's strategy-runner writes (services/ops strategy-runner/index.ts). Unknown
// wording stays unknown: the label says "Runner report" and the report itself is shown, folded.
import { utcDayOf, type VaultGrant } from "@cwf/core";
import type { MinePayload, StrategyWire } from "./protocol";

export type CopyState = "not-copying" | "inactive" | "paused" | "expired" | "replaced" | "runner-changed" | "unfunded" | "copying" | "fading";

/** Registry consent alone is not permission to spend: the wallet's live grant must agree. */
export function copyStateOf(card: Pick<StrategyWire, "active" | "runner">, sub: MinePayload["subscriptions"][number] | null, grant: VaultGrant | null, nowSec: number): CopyState {
  if (!sub) return card.active ? "not-copying" : "inactive";
  if (!sub.active || grant?.revoked) return "paused";
  if (!grant || grant.grantId.toString() !== sub.grantId) return "replaced";
  if (grant.expiresAtSec <= nowSec) return "expired";
  if (grant.actor.toLowerCase() !== card.runner.toLowerCase()) return "runner-changed";
  if (grant.budgetBase <= 0n) return "unfunded";
  return sub.mode === "fade" ? "fading" : "copying";
}

export const COPY_STATE_LABEL: Record<CopyState, string> = {
  "not-copying": "Not copying", inactive: "Closed", paused: "Paused", expired: "Budget expired", replaced: "Budget replaced", "runner-changed": "Runner changed", unfunded: "Budget used up", copying: "Copying", fading: "Fading",
};

/** Today's spend on a grant (0 once the UTC day has turned). */
export const spentTodayOf = (grant: VaultGrant, nowSec: number) => (grant.spentDay === utcDayOf(nowSec) ? grant.spentTodayBase : 0n);

/** The runner's last report as one label. */
export function runnerLabelOf(why: string | null): string {
  if (!why) return "No report yet";
  if (/^confirmation unknown\b/.test(why)) return "Held · unconfirmed";
  if (/\(dry run\)$|· DRY RUN$/.test(why)) return "Dry run";
  if (/^closed to new copiers/.test(why)) return "Closed";
  if (/^metadata carries no readable spec|^agent brain not configured|^no DATABASE_URL|is not deployed/.test(why)) return "Unavailable";
  if (/^published; waiting for a live subscriber/.test(why)) return "Waiting for a copier";
  if (/none with a live grant$/.test(why)) return "No live budget";
  if (/^no trading Window/.test(why)) return "Resting";
  const filled = why.match(/; (\d+) filled\b/);
  if (filled && Number(filled[1]) > 0) return `Filled ${filled[1]}`;
  if (filled) return "Held in last scan";
  if (/live subscribers?$/.test(why)) return "Watching";
  return "Runner report";
}
