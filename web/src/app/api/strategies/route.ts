// `/api/strategies` (S9.7; Agari 03b30ab `app/api/strategies/route.ts`): the desk's catalogue from the index and the
// runner's store, shared by every reader for a minute. Public, like the registry it reads.
import { connection } from "next/server";
import { readStrategies } from "@/features/strategies/strategies.server";

export async function GET(): Promise<Response> {
  await connection();
  try {
    return Response.json(await readStrategies(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("strategies:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
