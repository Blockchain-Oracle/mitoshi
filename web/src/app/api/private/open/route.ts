// Open a private bet (S10d, D-171; Masayume 68f7a09:web/src/app/api/private/open). POST the signed open; or, from the
// owner's own session, `{ resume: slotId }` to finish a pending one without signing again. A markets entry (C.3.5).
import { MissingConfigError, unavailable } from "@/server/env";
import { resumePrivate, openPrivate } from "@/server/private";
import { regionRestricted, regionRestrictedResponse } from "@/server/region";
import { callerSession } from "@/server/session";

export const maxDuration = 120;

const noStore = { "cache-control": "no-store" };

export async function POST(req: Request): Promise<Response> {
  if (regionRestricted(req, "markets")) return regionRestrictedResponse("markets");
  const body = (await req.json().catch(() => null)) as { resume?: unknown } | null;
  try {
    if (body && typeof body.resume === "string") {
      const session = await callerSession(req);
      if (!session) return Response.json({ error: "sign in to resume a private bet" }, { status: 401, headers: noStore });
      const a = await resumePrivate(session.address, body.resume);
      return Response.json(a.body, { status: a.status, headers: noStore });
    }
    const a = await openPrivate(body);
    return Response.json(a.body, { status: a.status, headers: noStore });
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    return Response.json({ error: (error instanceof Error ? error.message : String(error)).split("\n")[0]!.slice(0, 200) }, { status: 502, headers: noStore });
  }
}
