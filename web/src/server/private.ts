import "server-only";
/**
 * The private desk behind `/api/private/*` (S10d, D-171; Masayume 68f7a09:web/src/features/private/desk.server.ts and
 * web/src/app/api/private/open/route.ts): the `desk` key (`DESK_PRIVATE_KEY`), the claims per account in Postgres, and
 * the open's proof that the caller IS the owner — the route rebuilds the exact text the passkey signed from the chain's
 * own Window, checks the secret against the commitment in it, and verifies the signature (P-256, WebAuthn, keychain or
 * secp256k1). The signed request is stored before the desk sends anything, so a lost reply is resumed, never re-signed.
 */
import { verifySignedMessage, type Address, type MarketId } from "@cwf/core";
import { privateOpenRequestSchema, privateOpenText, type PrivateOpenRequest, type PrivateOpenResult, type PrivateTicket } from "@cwf/core/private";
import { createPgPrivateClaimsStore, type PrivateClaimRow, type PrivateClaimsStore } from "@cwf/db";
import { deriveSlotKeys, secretCommitment } from "@cwf/markets/private";
import { createDesk, messageVerifier, openPrivateBet, windowFacts, type Desk, type WindowFacts } from "@cwf/markets/server";
import type { Hex } from "viem";
import { db } from "./db";
import { MissingConfigError, serverEnv } from "./env";
import { chainClient } from "./faucet";

let desk: Desk | null | undefined;
let store: PrivateClaimsStore | null = null;

/** Null when this deployment has no desk key (the status route says so by name). */
export function privateDesk(): Desk | null {
  if (desk === undefined) {
    const env = serverEnv();
    desk = env.deskKey ? createDesk({ network: env.network, privateKey: env.deskKey, rpcUrl: env.rpcHttpUrl }) : null;
  }
  return desk;
}

export function requireDesk(): Desk {
  const d = privateDesk();
  if (!d) throw new MissingConfigError("DESK_PRIVATE_KEY");
  return d;
}

export function privateClaims(): PrivateClaimsStore {
  store ??= createPgPrivateClaimsStore(db());
  return store;
}

export type Answer = { status: number; body: unknown };
const refuse = (status: number, error: string): Answer => ({ status, body: { error } });

async function run(d: Desk, req: PrivateOpenRequest, facts: WindowFacts, slotId: string): Promise<Answer> {
  const result: PrivateOpenResult = await openPrivateBet(d, {
    owner: req.owner as Address,
    marketId: facts.marketId,
    side: req.side,
    stakeBase: BigInt(req.stakeBase),
    minQuantityRaw: BigInt(req.minQuantityRaw),
    secret: req.secret as Hex,
    issuedAtMs: req.issuedAtMs,
    asset: facts.asset,
    intervalSec: facts.intervalSec,
    expirySec: facts.expirySec,
  });
  const nowMs = Date.now();
  if (result.status === "opened") await privateClaims().markOpened(slotId, result.ticket, nowMs);
  else if (result.status === "refused") await privateClaims().markRefused(slotId, result as unknown as Record<string, unknown>, nowMs);
  else await privateClaims().markUnknown(slotId, result as unknown as Record<string, unknown>, nowMs);
  return { status: 200, body: result };
}

/** A fresh open: the owner's proof first, then the pending row, then the desk. */
export async function openPrivate(body: unknown): Promise<Answer> {
  const parsed = privateOpenRequestSchema.safeParse(body);
  if (!parsed.success) return refuse(400, "malformed private open request");
  const req = parsed.data;
  const d = requireDesk();
  const facts = await windowFacts(d, req.marketId as MarketId);
  if (!facts) return refuse(404, "no such Window");
  const text = privateOpenText({ owner: req.owner, contract: d.contract, chainId: d.chainId, marketId: facts.marketId, asset: facts.asset, intervalSec: facts.intervalSec, expirySec: facts.expirySec, side: req.side, stakeBase: BigInt(req.stakeBase), issuedAtMs: req.issuedAtMs, commitment: secretCommitment(req.secret as Hex) });
  const signed = await verifySignedMessage({ text, signature: req.signature as Hex, signer: req.owner as Address }, messageVerifier(chainClient()));
  if (!signed) return refuse(401, "this authorisation was not signed by the owner for this bet");
  const { slotId } = deriveSlotKeys(req.secret as Hex);
  await privateClaims().savePending({ slotId, owner: req.owner, chainId: d.chainId, request: req as unknown as Record<string, unknown>, nowMs: Date.now() });
  return run(d, req, facts, slotId);
}

/** Re-sends a pending open the owner's own session asks about: the same secret, the same slot, nothing charged twice. */
export async function resumePrivate(owner: Address, slotId: string): Promise<Answer> {
  const row = await privateClaims().get(slotId);
  if (!row || row.owner !== owner.toLowerCase()) return refuse(404, "no such private bet for this account");
  if (row.status !== "pending" || !row.request) return { status: 200, body: row.ticket ? { status: "opened", ticket: row.ticket } : row.result };
  const parsed = privateOpenRequestSchema.safeParse(row.request);
  if (!parsed.success) return refuse(500, "the stored request could not be read");
  const d = requireDesk();
  const facts = await windowFacts(d, parsed.data.marketId as MarketId);
  if (!facts) return refuse(404, "no such Window");
  return run(d, parsed.data, facts, slotId);
}

/** What the owner's claims list shows: never the stored secret. */
export function publicRow(r: PrivateClaimRow): { slotId: string; status: PrivateClaimRow["status"]; ticket: PrivateTicket | null; result: Record<string, unknown> | null; pending: { marketId: string; side: string; stakeBase: string } | null; createdAtMs: number; updatedAtMs: number } {
  const q = r.request as { marketId?: string; side?: string; stakeBase?: string } | null;
  return { slotId: r.slotId, status: r.status, ticket: r.ticket, result: r.result, pending: q && r.status === "pending" ? { marketId: q.marketId ?? "", side: q.side ?? "", stakeBase: q.stakeBase ?? "0" } : null, createdAtMs: r.createdAtMs, updatedAtMs: r.updatedAtMs };
}
