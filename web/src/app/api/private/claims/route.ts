// The owner's private claims (S10d, D-171): served only to the owner's own session — the chain names no owner on any
// slot, and this list is the one place the two meet. Never the stored secret.
import { connection } from "next/server";
import { MissingConfigError, unavailable } from "@/server/env";
import { privateClaims, publicRow } from "@/server/private";
import { callerSession } from "@/server/session";

const noStore = { "cache-control": "no-store" };

export async function GET(req: Request): Promise<Response> {
  await connection();
  const session = await callerSession(req);
  if (!session) return Response.json({ error: "sign in to see your private bets" }, { status: 401, headers: noStore });
  try {
    const rows = await privateClaims().listByOwner(session.address);
    return Response.json({ owner: session.address, claims: rows.map(publicRow) }, { headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
}
