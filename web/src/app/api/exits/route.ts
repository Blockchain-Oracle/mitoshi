// Exits with the app closed (S24.3, D-193): a Trading Balance position's Trail / take-profit / stop-loss, run by the ops
// exit keeper. POST stores a trigger the owner's session key signed (`verifyExitTrigger`: the current vault, the live
// SESSION grant's actor); a write with nothing set cancels. GET lists the caller's own (their server session). Exits
// stay open everywhere (C.3.5): no region gate.
import { connection } from "next/server";
import { NETWORKS } from "@cwf/core";
import { exitTriggerFromWire, exitTriggerRequestSchema } from "@cwf/core/exits";
import { getPublicClient, readVaultGrant } from "@cwf/markets";
import { exitSignatureCheck, verifyExitTrigger } from "@cwf/markets/server";
import type { Hex, PublicClient } from "viem";
import { ceremonyLimiter } from "@/server/auth";
import { MissingConfigError, serverEnv, unavailable } from "@/server/env";
import { exitTriggers, publicExitRow } from "@/server/exits";
import { ipHash } from "@/server/request";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };
const CONFLICT = { "stale-nonce": "a newer exit is already set for this position", firing: "the keeper is selling this position now" } as const;

export async function POST(req: Request): Promise<Response> {
  try {
    if (!(await ceremonyLimiter().allow(`exits:${ipHash(req)}`, 60, 60))) return Response.json({ error: "too many exit writes; try again in a minute" }, { status: 429, headers: noStore });
    const parsed = exitTriggerRequestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "malformed exit trigger" }, { status: 400, headers: noStore });
    const trigger = exitTriggerFromWire(parsed.data.trigger);
    const client = (await getPublicClient()) as unknown as PublicClient;
    const verdict = await verifyExitTrigger(trigger, parsed.data.signature as Hex, { chainId: NETWORKS[serverEnv().network], nowMs: Date.now(), readGrant: readVaultGrant, verify: exitSignatureCheck(client) });
    if (!verdict.ok) return Response.json({ error: verdict.error }, { status: verdict.status, headers: noStore });
    const written = await exitTriggers().write({ trigger, signer: verdict.signer, signature: parsed.data.signature, nowMs: Date.now() });
    if ("conflict" in written) return Response.json({ error: CONFLICT[written.conflict], conflict: written.conflict }, { status: 409, headers: noStore });
    return Response.json({ exit: publicExitRow(written.row) }, { headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) }, { status: 502, headers: noStore });
  }
}

export async function GET(req: Request): Promise<Response> {
  await connection();
  try {
    const session = await callerSession(req);
    if (!session) return Response.json({ error: "sign in to read your exits" }, { status: 401, headers: noStore });
    const rows = await exitTriggers().listByOwner(session.address);
    return Response.json({ exits: rows.map(publicExitRow) }, { headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) }, { status: 502, headers: noStore });
  }
}
