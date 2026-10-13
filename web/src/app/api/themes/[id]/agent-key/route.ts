// `/api/themes/<id>/agent-key` (S16a; R4-11, D-227): the follower's theme key, by its address only. POST files the
// request for the signed-in account (one row per follower and theme); ops' theme-agent issues the key on its next pass
// and keeps it sealed — this process never sees a key. GET reads the address back (null until issued). The follow
// transaction then authorises that address, scoped, with the follower's own signature.
import { createPgThemeKeys } from "@cwf/db";
import { db } from "@/server/db";
import { callerSession } from "@/server/session";

type Ctx = { params: Promise<{ id: string }> };
const answer = (status: number, body: unknown) => Response.json(body, { status, headers: { "cache-control": "no-store" } });

async function caller(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id) || id === "0") return { error: answer(400, { message: "No theme with this number." }) };
  const session = await callerSession(req).catch(() => null);
  if (!session) return { error: answer(401, { message: "Sign in to follow." }) };
  return { themeId: BigInt(id), address: session.address };
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const c = await caller(req, ctx);
  if ("error" in c) return c.error!;
  try {
    const row = await createPgThemeKeys(db()).request(c.address, c.themeId);
    return answer(200, { keyId: row.keyId });
  } catch {
    return answer(503, { message: "The theme agent can't take requests right now." });
  }
}

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const c = await caller(req, ctx);
  if ("error" in c) return c.error!;
  const row = await createPgThemeKeys(db()).get(c.address, c.themeId).catch(() => null);
  return answer(200, { keyId: row?.keyId ?? null, note: row?.lastNote ?? null });
}
