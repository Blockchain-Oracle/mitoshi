// One bridge transfer by a leg's LayerZero guid or its source transaction hash (S14 14o; D-227 R4-12): how the tracker
// comes back after a killed tab. Public chain data; 404 until the transfer was recorded.
import { connection } from "next/server";
import { bridgeStore, publicTransfer } from "@/server/bridge";
import { MissingConfigError, unavailable } from "@/server/env";

const noStore = { "cache-control": "no-store" };

export async function GET(_req: Request, ctx: { params: Promise<{ guid: string }> }): Promise<Response> {
  await connection();
  const { guid } = await ctx.params;
  if (!/^0x[0-9a-fA-F]{64}$/.test(guid)) return Response.json({ error: "a guid or transaction hash" }, { status: 400, headers: noStore });
  try {
    const row = await bridgeStore().find(guid);
    return row ? Response.json({ transfer: publicTransfer(row) }, { headers: noStore }) : Response.json({ error: "not recorded" }, { status: 404, headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) }, { status: 502, headers: noStore });
  }
}
