// `GET /api/strategies/[id]/memory` (S9.9b, L-56's optional MPP read): one read of a sealed memory, bought over MPP by a
// wallet that doesn't copy the strategy — a person from the drawer, or any agent with an MPP client (`mppx <url>`).
// The price is the one the creator signed into the seal, paid in pathUSD to the creator the chain names, so the app
// never holds the money. Without a payment: 402 and the challenge. A memory with paid reads off, or stored under
// another creator than the chain's, is never offered. Copiers read free through `memory/read`.
import { createPgSealedMemory } from "@cwf/db";
import { connection } from "next/server";
import { zeroAddress } from "viem";
import { memoryFacts } from "@/features/strategies/memory.server";
import { db } from "@/server/db";
import { MissingConfigError, unavailable } from "@/server/env";
import { memoryReadServer } from "@/server/mpp";

const NO_STORE = { "cache-control": "no-store" };

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  await connection();
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "bad_id" }, { status: 400 });
  try {
    const memory = await createPgSealedMemory(db()).read(id);
    if (!memory || memory.readPriceBase === 0n) return Response.json({ error: "no_paid_reads" }, { status: 404, headers: NO_STORE });
    // The creator from the chain, head-fresh (no reader: the subscription half of the read is unused here).
    const facts = await memoryFacts(BigInt(id), zeroAddress);
    if (!facts || facts.creator.toLowerCase() !== memory.creator) return Response.json({ error: "no_paid_reads" }, { status: 404, headers: NO_STORE });
    const result = await memoryReadServer().charge(req, { strategyId: id, title: memory.title, priceBase: memory.readPriceBase, creator: facts.creator });
    if (result.status === 402) return result.challenge;
    return result.withReceipt(Response.json({ title: memory.title, body: memory.body, updatedAtMs: memory.updatedAtMs }, { headers: NO_STORE }));
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    console.error("memory paid read:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
