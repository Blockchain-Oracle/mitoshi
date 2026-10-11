// `/api/strategies/[id]` (S9.8): one strategy's page — its card, its runner's last words, its decisions with their MPP
// receipts, its copy fills and its ERC-8004 feedback. Uncached (a runner's words are live); public like the registry.
import { connection } from "next/server";
import { readStrategyDetail } from "@/features/strategies/strategies.server";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  await connection();
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return Response.json({ error: "bad_id" }, { status: 400 });
  try {
    const detail = await readStrategyDetail(id);
    return detail ? Response.json(detail, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "not_found" }, { status: 404 });
  } catch (error) {
    console.error("strategy detail:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
