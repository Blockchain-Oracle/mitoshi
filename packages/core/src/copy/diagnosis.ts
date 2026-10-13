// Ported from Masayume 68f7a09:packages/core/src/copy/diagnosis.ts. R6 (D-230, T20): two voices. A write failure says
// whether money moved; a read failure (a page load, a poll) never says "sent" or "taken" — nothing was. Every body is
// ≤ 10 words (Owarine's count); the copy test holds both rules.
import type { DiagnosisKind } from "../types/diagnosis";
import type { BlockerFix } from "./blockers";

export interface DiagnosisCopy {
  headline: string;
  body: string;
}

/** The write voice: what failed and whether anything moved. */
const COPY: Record<DiagnosisKind, DiagnosisCopy> = {
  "signer-required": { headline: "Sign in first", body: "Reading works signed out. Placing needs you." },
  "wrong-chain": { headline: "Wrong network", body: "Switch to Tempo, then try again." },
  "user-rejected": { headline: "You cancelled", body: "Nothing was sent." },
  "fee-token": { headline: "Fee not covered", body: "Add money for the network fee." },
  "insufficient-collateral": { headline: "Not enough money", body: "Add money or lower the stake." },
  "insufficient-allowance": { headline: "Approval needed", body: "It rides along with your next call." },
  "market-not-trading": { headline: "The Window closed under you", body: "Nothing was taken. The next one is ready." },
  "order-expired": { headline: "Expired before it filled", body: "The book moved. Nothing was taken." },
  "post-only-would-cross": { headline: "Would fill immediately", body: "A resting order can't take. Adjust the level." },
  "no-liquidity": { headline: "No sellers at this size", body: "Try a smaller stake or the next Window." },
  "thin-book": { headline: "The book is too thin", body: "Not enough resting for this size. Nothing taken." },
  "reserve-cap": { headline: "Over the reserve's cap", body: "A smaller stake fits." },
  "below-min-quantity": { headline: "Below the minimum", body: "This size rounds to nothing." },
  "outside-band": { headline: "Outside the 2–97¢ band", body: "Refused, not filled at a lottery price." },
  "daily-stop": { headline: "Daily Stop hit", body: "Calls reopen at midnight your time." },
  "invalid-price": { headline: "Off the price grid", body: "Requote and try again." },
  requote: { headline: "The price moved", body: "Nothing was taken. Check the new price." },
  "not-settled": { headline: "Not settled yet", body: "Payout opens once the close lands." },
  "already-claimed": { headline: "Already paid out", body: "It's in your wallet." },
  "faucet-refused": { headline: "Faucet refused", body: "Once a day per account. Try tomorrow." },
  "indexer-down": { headline: "History is catching up", body: "Nothing was sent. Try again shortly." },
  "rpc-down": { headline: "The chain endpoint is down", body: "Nothing was sent. Try again shortly." },
  "rate-limited": { headline: "The network is busy", body: "Nothing was sent. Try again in a moment." },
  "contract-revert": { headline: "The contract refused", body: "Nothing moved. Details below." },
  "grant-refused": { headline: "Outside the grant", body: "Adjust the grant or the size." },
  "not-deployed": { headline: "Not live here yet", body: "Nothing was sent." },
  "spending-limit": { headline: "Over your tap limit", body: "Confirm with your passkey or raise it." },
  "call-not-allowed": { headline: "Outside your trading key", body: "Confirm with your passkey instead." },
  "key-revoked": { headline: "That key was revoked", body: "Sign again with your passkey." },
  "sponsor-refused": { headline: "Fee sponsor declined", body: "Nothing was sent. Try again shortly." },
  "receive-policy": { headline: "Held by the recipient's policy", body: "Nothing moved." },
  "region-restricted": { headline: "Browse-only in your region", body: "Exits, withdrawals and claims stay open." },
  "send-unknown": { headline: "Waiting for the chain", body: "It's either in or never left. We'll say." },
  unknown: { headline: "Something went sideways", body: "Nothing changes without your signature." },
};

/** The read voice (a page load, a poll): what the screen shows meanwhile, never "sent" or "taken". */
export const READ_DIAGNOSIS: Readonly<Partial<Record<DiagnosisKind, DiagnosisCopy>>> = {
  "rate-limited": { headline: "Prices are busy", body: "Retrying." },
  "rpc-down": { headline: "Reconnecting", body: "Showing the last good prices." },
  "indexer-down": { headline: "History is catching up", body: "Showing the last good numbers." },
  "not-deployed": { headline: "Not live here yet", body: "This part isn't on this network." },
  "contract-revert": { headline: "Couldn't read this", body: "The contract refused the read." },
  "wrong-chain": { headline: "Wrong network", body: "Switch to Tempo to see this." },
  "signer-required": { headline: "Sign in to see this", body: "It's yours, so it needs you." },
  "region-restricted": { headline: "Browse-only in your region", body: "Exits and claims stay open." },
};

const READ_FALLBACK: DiagnosisCopy = { headline: "Couldn't read this", body: "Retrying shortly." };

/** The read variant for the shell's connection strip, its boot notice and every ErrorState (falls back, never to write words). */
export function readDiagnosisCopy(kind: DiagnosisKind): DiagnosisCopy {
  return READ_DIAGNOSIS[kind] ?? READ_FALLBACK;
}

/** Unchanged signature for writes; `mode: "read"` gives the read voice. */
export function diagnosisCopy(kind: DiagnosisKind, mode: "write" | "read" = "write"): DiagnosisCopy {
  return mode === "read" ? readDiagnosisCopy(kind) : COPY[kind];
}

const RETRY_FIXES: ReadonlySet<DiagnosisKind> = new Set<DiagnosisKind>(["rate-limited", "rpc-down", "indexer-down", "sponsor-refused", "requote", "order-expired", "unknown"]);

/**
 * The one tap a failure offers (D-230: the fix comes from the diagnosis, never a hard-coded string): money → Add money,
 * network → Switch, signed out → Sign in, a transient → Retry (only when the diagnosis says it is retryable).
 */
export function fixForDiagnosis(kind: DiagnosisKind, retryable = true): BlockerFix | null {
  switch (kind) {
    case "fee-token":
    case "insufficient-collateral":
      return { kind: "add-money" };
    case "wrong-chain":
      return { kind: "switch-chain" };
    case "signer-required":
      return { kind: "sign-in" };
    default:
      return retryable && RETRY_FIXES.has(kind) ? { kind: "retry" } : null;
  }
}
