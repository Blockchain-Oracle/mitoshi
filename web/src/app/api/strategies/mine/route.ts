// `/api/strategies/mine?wallet=` (S9.7): one wallet's consents and its copy fills, uncached — a copy shows at once.
// Public: consents and fills are on chain already.
import { isAddress } from "viem";
import { connection } from "next/server";
import { readMine } from "@/features/strategies/strategies.server";

export async function GET(req: Request): Promise<Response> {
  await connection();
  const wallet = new URL(req.url).searchParams.get("wallet") ?? "";
  if (!isAddress(wallet)) return Response.json({ error: "bad_wallet" }, { status: 400 });
  try {
    return Response.json(await readMine(wallet), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("strategies:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
