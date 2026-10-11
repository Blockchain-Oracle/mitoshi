// `POST /api/strategies/memory/read` (S9.9, L-56; Agari 03b30ab): the gate. A sealed memory is served to two wallets
// only: the strategy's creator, and a wallet holding a live subscription to it on chain (subscribing is what pays the
// creator's fee, so the registry is the record of who has paid; this route keeps no list). Every failure to establish
// one of those facts is a refusal: an unreadable chain never opens a memory.
import { isAddress } from "viem";
import { connection } from "next/server";
import { MEMORY_SIGNATURE_TTL_MS, readMemoryMessage, verifySignedMessage } from "@cwf/core";
import { createPgSealedMemory } from "@cwf/db";
import { messageVerifier } from "@cwf/markets/server";
import { memoryFacts } from "@/features/strategies/memory.server";
import { db } from "@/server/db";
import { serverEnv } from "@/server/env";
import { chainClient } from "@/server/faucet";

export async function POST(req: Request): Promise<Response> {
  await connection();
  const b = (await req.json().catch(() => null)) as { strategyId?: unknown; reader?: unknown; issuedAtMs?: unknown; signature?: unknown } | null;
  const strategyId = typeof b?.strategyId === "string" && /^\d{1,18}$/.test(b.strategyId) ? b.strategyId : null;
  const reader = typeof b?.reader === "string" && isAddress(b.reader) ? b.reader : null;
  const issuedAtMs = typeof b?.issuedAtMs === "number" && Number.isInteger(b.issuedAtMs) ? b.issuedAtMs : null;
  const signature = typeof b?.signature === "string" && b.signature.startsWith("0x") ? (b.signature as `0x${string}`) : null;
  if (!strategyId || !reader || issuedAtMs === null || !signature) return Response.json({ error: "bad_request" }, { status: 400 });
  if (Math.abs(Date.now() - issuedAtMs) > MEMORY_SIGNATURE_TTL_MS) return Response.json({ error: "stale_signature" }, { status: 400 });
  const ok = await verifySignedMessage({ text: readMemoryMessage({ network: serverEnv().network, strategyId, reader, issuedAtMs }), signature, signer: reader }, messageVerifier(chainClient(), { allowAccessKey: true })).catch(() => false);
  if (!ok) return Response.json({ error: "bad_signature" }, { status: 401 });
  try {
    const facts = await memoryFacts(BigInt(strategyId), reader);
    if (!facts) return Response.json({ error: "no_such_strategy" }, { status: 404 });
    const isCreator = facts.creator.toLowerCase() === reader.toLowerCase();
    if (!isCreator && !facts.subscribed) return Response.json({ error: "subscribe_to_read", feeBase: facts.feeBase.toString() }, { status: 402 });
    const memory = await createPgSealedMemory(db()).read(strategyId);
    // Stored under another creator than the chain's: never served, whoever asks.
    if (!memory || memory.creator !== facts.creator.toLowerCase()) return Response.json({ error: "no_sealed_memory" }, { status: 404 });
    return Response.json({ title: memory.title, body: memory.body, updatedAtMs: memory.updatedAtMs }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("memory read:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
