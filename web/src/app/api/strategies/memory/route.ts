// `POST /api/strategies/memory` (S9.9, L-56; Agari 03b30ab): a creator seals what their agent has learned. Checked here,
// not in the browser: the signature is the creator's over this exact title and body, fresh, and the signer is the
// strategy's creator on chain. The body is stored and never listed; only `memory/read` serves it.
import { isAddress } from "viem";
import { connection } from "next/server";
import { MEMORY_SIGNATURE_TTL_MS, SEALED_BODY_MAX, SEALED_TITLE_MAX, sealMemoryMessage, verifySignedMessage } from "@cwf/core";
import { createPgSealedMemory } from "@cwf/db";
import { messageVerifier } from "@cwf/markets/server";
import { memoryFacts } from "@/features/strategies/memory.server";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { chainClient } from "@/server/faucet";

type Body = { strategyId?: unknown; creator?: unknown; issuedAtMs?: unknown; title?: unknown; body?: unknown; signature?: unknown };

export async function POST(req: Request): Promise<Response> {
  await connection();
  const b = (await req.json().catch(() => null)) as Body | null;
  const strategyId = typeof b?.strategyId === "string" && /^\d{1,18}$/.test(b.strategyId) ? b.strategyId : null;
  const creator = typeof b?.creator === "string" && isAddress(b.creator) ? b.creator : null;
  const issuedAtMs = typeof b?.issuedAtMs === "number" && Number.isInteger(b.issuedAtMs) ? b.issuedAtMs : null;
  const title = typeof b?.title === "string" ? b.title.trim() : "";
  const body = typeof b?.body === "string" ? b.body : "";
  const signature = typeof b?.signature === "string" && b.signature.startsWith("0x") ? (b.signature as `0x${string}`) : null;
  if (!strategyId || !creator || issuedAtMs === null || !signature || title.length < 1 || title.length > SEALED_TITLE_MAX || body.length < 1 || body.length > SEALED_BODY_MAX) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (Math.abs(Date.now() - issuedAtMs) > MEMORY_SIGNATURE_TTL_MS) return Response.json({ error: "stale_signature" }, { status: 400 });
  const text = sealMemoryMessage({ network: serverEnv().network, strategyId, creator, issuedAtMs, title, body });
  const ok = await verifySignedMessage({ text, signature, signer: creator }, messageVerifier(chainClient(), { allowAccessKey: true })).catch(() => false);
  if (!ok) return Response.json({ error: "bad_signature" }, { status: 401 });
  try {
    const facts = await memoryFacts(BigInt(strategyId), creator);
    if (!facts) return Response.json({ error: "no_such_strategy" }, { status: 404 });
    if (facts.creator.toLowerCase() !== creator.toLowerCase()) return Response.json({ error: "not_the_creator" }, { status: 403 });
    await createPgSealedMemory(db()).upsert(strategyId, creator, title, body);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("memory seal:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
