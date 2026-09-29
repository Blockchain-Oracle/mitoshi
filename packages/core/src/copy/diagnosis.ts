// Ported from Masayume 68f7a09:packages/core/src/copy/diagnosis.ts
import type { DiagnosisKind } from "../types/diagnosis";
import { FEE_TOKEN_SHORT } from "./strings";

export interface DiagnosisCopy {
  headline: string;
  body: string;
}

const COPY: Record<DiagnosisKind, DiagnosisCopy> = {
  "signer-required": { headline: "Connect a wallet first", body: "Reading works without one; writing needs your signature." },
  "wrong-chain": { headline: "Wrong network", body: "This wallet is on another network. Switch to Tempo and try again." },
  "user-rejected": { headline: "You cancelled", body: "Nothing was sent. Try again when you're ready." },
  "fee-token": { headline: "Fee not covered", body: FEE_TOKEN_SHORT },
  "insufficient-collateral": { headline: "Not enough funds", body: "Your stake exceeds what your account holds. Add funds or lower the stake." },
  "insufficient-allowance": { headline: "Approval needed", body: "The venue needs permission to take your stake. It's absorbed into your next bet." },
  "market-not-trading": { headline: "The Window closed under you", body: "Your stake was never taken. The next Window is pre-armed." },
  "order-expired": { headline: "Order expired before it filled", body: "The book moved past your quote. Nothing was taken." },
  "post-only-would-cross": { headline: "Your price would fill immediately", body: "A backing order rests, it doesn't take. Adjust the level." },
  "no-liquidity": { headline: "No liquidity at this size", body: "Nobody is on the other side of this book right now. The next Window may have one." },
  "thin-book": { headline: "The book is too thin for this size", body: "Fewer contracts are resting than this order needs, or the spread is too wide to price. Nothing was taken." },
  "reserve-cap": { headline: "Above the reserve's cap for this Window", body: "The reserve limits what it fronts per position and per Window. A smaller stake fits; the cap is not a shortage." },
  "below-min-quantity": { headline: "Below the venue's minimum", body: "This size rounds to nothing on the venue's lot grid." },
  "outside-band": { headline: "Too close to certain or impossible", body: "This book is quoting outside the 2–97¢ band, so the order is refused rather than filled at a lottery price." },
  "daily-stop": { headline: "Daily Stop hit", body: "Betting reopens at midnight your time. Nothing was sent." },
  "invalid-price": { headline: "Off the price grid", body: "The venue rejected the price step. Requote and try again." },
  requote: { headline: "The book moved", body: "The odds changed before your ticket landed. Nothing was taken — check the new price and confirm again." },
  "not-settled": { headline: "Not settled yet", body: "The closing price hasn't been recorded yet. Payout opens the moment it is." },
  "already-claimed": { headline: "Already paid out", body: "The auto-payout got here first. Your wallet already has it." },
  "faucet-refused": { headline: "Faucet refused", body: "Test funds are limited to once a day per account. Nothing was sent; try again later." },
  "indexer-down": { headline: "The indexer isn't answering", body: "Numbers stay at their last-good values until it's back." },
  "rpc-down": { headline: "The chain endpoint isn't answering", body: "We're rotating to the backup RPC. Last-good values stay on screen." },
  "contract-revert": { headline: "The contract refused", body: "Nothing moved. The technical details name the reason." },
  "grant-refused": { headline: "Outside the grant", body: "This order sits outside what the grant allows — its caps, expiry or actor. Adjust the grant or the size." },
  "not-deployed": { headline: "Not on this network yet", body: "This part of the app is not deployed on this network yet. Nothing was sent." },
  "spending-limit": { headline: "Over your tap-trading limit", body: "This order is above what your trading key may spend today. Nothing was taken — confirm it with your passkey or raise the limit." },
  "call-not-allowed": { headline: "Outside your trading key", body: "Your trading key isn't allowed to do this. Nothing was taken — confirm with your passkey instead." },
  "key-revoked": { headline: "That key was revoked", body: "The key that signed this no longer works. Nothing was taken — sign again with your passkey." },
  "sponsor-refused": { headline: "Fee sponsorship declined", body: "We couldn't cover the network fee for this one. Nothing was sent; try again shortly." },
  "receive-policy": { headline: "Held by the recipient's policy", body: "The token's receive policy refused this transfer, so nothing moved." },
  "region-restricted": { headline: "Browse-only in your region", body: "New positions aren't available where you are. Exits, withdrawals and claims stay open. Nothing was sent." },
  "send-unknown": { headline: "Waiting for the chain to answer", body: "Your order is either in or it never left; we'll show you which." },
  unknown: { headline: "Something went sideways", body: "Nothing on-chain changed without a signature. Details below." },
};

export function diagnosisCopy(kind: DiagnosisKind): DiagnosisCopy {
  return COPY[kind];
}
