/**
 * An exit trigger (S24.3, D-193): the owner's Trail / take-profit / stop-loss for one Trading Balance position, which
 * the exit keeper runs with the app closed. It is signed (EIP-712) by the Trading Balance's session key — the actor of
 * the owner's live SESSION grant on the vault named in the domain — so the keeper sells only on a condition the owner's
 * own key set. The sale itself goes through the owner's EXIT grant, at no less than the vault's fair-value floor.
 *
 * One trigger per position (vault, owner, Window, side): each write replaces the last and carries a larger `nonce`
 * (milliseconds); a write with no TP, no SL and no trail cancels. Money in collateral base units, spots × 10⁸.
 */
import { z } from "zod";
import { addressSchema, bytes32Schema } from "../schemas/primitives";
import type { Side } from "../types/market";
import type { Address, Bytes32 } from "../types/primitives";

export interface ExitTrigger {
  owner: Address;
  /** The Trading Balance (v2) whose EXIT grant sells; also the signature domain's `verifyingContract`. */
  vault: Address;
  chainId: number;
  market: Bytes32;
  side: Side;
  /** The owner's SESSION grant whose actor signed. */
  grantId: bigint;
  /** Sell once Close pays at least this. */
  takeProfitBase: bigint | null;
  /** Sell once Close pays at most this. */
  stopLossBase: bigint | null;
  /** The trail's distance behind the spot, in bps; set together with `trailStopE8`. */
  trailBps: number | null;
  /** The trail's stop when signed; the keeper moves it only in the position's favour. */
  trailStopE8: bigint | null;
  nonce: bigint;
  /** No later than the Window's lock. */
  expiresAtSec: number;
}

/** How far ahead a trigger may expire: the longest Window (the week-long Gap) and a day. */
export const MAX_EXIT_TRIGGER_SEC = 8 * 86_400;
/** A nonce may run ahead of the server's clock by at most this (a client clock), so it can't lock later writes out. */
export const EXIT_NONCE_SKEW_MS = 60_000;
export const MIN_TRAIL_BPS = 10;
export const MAX_TRAIL_BPS = 5_000;

export const EXIT_TRIGGER_TYPES = {
  ExitTrigger: [
    { name: "owner", type: "address" },
    { name: "market", type: "bytes32" },
    { name: "side", type: "uint8" },
    { name: "grantId", type: "uint256" },
    { name: "takeProfitBase", type: "uint256" },
    { name: "stopLossBase", type: "uint256" },
    { name: "trailBps", type: "uint16" },
    { name: "trailStopE8", type: "uint256" },
    { name: "nonce", type: "uint64" },
    { name: "expiresAtSec", type: "uint64" },
  ],
} as const;

export const exitTriggerDomain = (t: Pick<ExitTrigger, "chainId" | "vault">) => ({ name: "Mitoshi exits", version: "1", chainId: t.chainId, verifyingContract: t.vault });

/** The signed message: an unset target is 0 (the contract-style "none"). */
export function exitTriggerMessage(t: ExitTrigger) {
  return {
    owner: t.owner,
    market: t.market,
    side: t.side === "up" ? 0 : 1,
    grantId: t.grantId,
    takeProfitBase: t.takeProfitBase ?? 0n,
    stopLossBase: t.stopLossBase ?? 0n,
    trailBps: t.trailBps ?? 0,
    trailStopE8: t.trailStopE8 ?? 0n,
    nonce: t.nonce,
    expiresAtSec: BigInt(t.expiresAtSec),
  };
}

/** The full typed-data argument for `signTypedData` / `recoverTypedDataAddress`. */
export const exitTriggerTypedData = (t: ExitTrigger) => ({ domain: exitTriggerDomain(t), types: EXIT_TRIGGER_TYPES, primaryType: "ExitTrigger" as const, message: exitTriggerMessage(t) });

export const isExitCancel = (t: Pick<ExitTrigger, "takeProfitBase" | "stopLossBase" | "trailBps">): boolean => t.takeProfitBase === null && t.stopLossBase === null && t.trailBps === null;

/** Why a trigger can't be stored, in words; null when it is well formed. */
export function exitTriggerProblem(t: ExitTrigger, nowMs: number): string | null {
  const nowSec = Math.floor(nowMs / 1000);
  if (t.expiresAtSec <= nowSec) return "the trigger has already expired";
  if (t.expiresAtSec > nowSec + MAX_EXIT_TRIGGER_SEC) return "the trigger expires too far ahead";
  if (t.nonce <= 0n || t.nonce > BigInt(nowMs + EXIT_NONCE_SKEW_MS)) return "the nonce is not a current time";
  if (t.takeProfitBase !== null && t.takeProfitBase <= 0n) return "a take-profit must be above $0";
  if (t.stopLossBase !== null && t.stopLossBase <= 0n) return "a stop-loss must be above $0";
  if (t.takeProfitBase !== null && t.stopLossBase !== null && t.takeProfitBase <= t.stopLossBase) return "the take-profit must be above the stop-loss";
  if ((t.trailBps === null) !== (t.trailStopE8 === null)) return "a trail needs both its distance and its stop";
  if (t.trailBps !== null && (t.trailBps < MIN_TRAIL_BPS || t.trailBps > MAX_TRAIL_BPS)) return `a trail is ${MIN_TRAIL_BPS / 100}%–${MAX_TRAIL_BPS / 100}% behind the spot`;
  if (t.trailStopE8 !== null && t.trailStopE8 <= 0n) return "a trail stop must be above 0";
  return null;
}

// The wire shape: bigints as decimal strings (JSON has none).
const uintText = z.string().regex(/^\d{1,78}$/);
const optUintText = uintText.nullable();

export const exitTriggerWireSchema = z.object({
  owner: addressSchema,
  vault: addressSchema,
  chainId: z.number().int().positive(),
  market: bytes32Schema,
  side: z.enum(["up", "down"]),
  grantId: uintText,
  takeProfitBase: optUintText,
  stopLossBase: optUintText,
  trailBps: z.number().int().nullable(),
  trailStopE8: optUintText,
  nonce: uintText,
  expiresAtSec: z.number().int().positive(),
});
export type ExitTriggerWire = z.infer<typeof exitTriggerWireSchema>;

export const exitTriggerRequestSchema = z.object({ trigger: exitTriggerWireSchema, signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(2_000) });

const big = (s: string | null) => (s === null ? null : BigInt(s));

export function exitTriggerFromWire(w: ExitTriggerWire): ExitTrigger {
  return {
    owner: w.owner, vault: w.vault, chainId: w.chainId, market: w.market, side: w.side, grantId: BigInt(w.grantId),
    takeProfitBase: big(w.takeProfitBase), stopLossBase: big(w.stopLossBase), trailBps: w.trailBps, trailStopE8: big(w.trailStopE8),
    nonce: BigInt(w.nonce), expiresAtSec: w.expiresAtSec,
  };
}

export function exitTriggerToWire(t: ExitTrigger): ExitTriggerWire {
  const text = (v: bigint | null) => (v === null ? null : v.toString());
  return {
    owner: t.owner, vault: t.vault, chainId: t.chainId, market: t.market, side: t.side, grantId: t.grantId.toString(),
    takeProfitBase: text(t.takeProfitBase), stopLossBase: text(t.stopLossBase), trailBps: t.trailBps, trailStopE8: text(t.trailStopE8),
    nonce: t.nonce.toString(), expiresAtSec: t.expiresAtSec,
  };
}

/** Why the keeper sold: the position's trail, its take-profit or its stop-loss. */
export type ExitReason = "trail" | "tp" | "sl";

/** What the keeper publishes on the owner's `user:` topic when it sells (`exit`) or moves a trail (`exit-trail`). */
export interface ExitFiredEvent {
  vault: Address;
  marketId: Bytes32;
  side: Side;
  symbol: string;
  reason: ExitReason;
  proceedsBase: string;
  contractsRaw: string;
  txHash: string;
}

export interface ExitTrailEvent {
  vault: Address;
  marketId: Bytes32;
  side: Side;
  trailStopE8: string;
}
