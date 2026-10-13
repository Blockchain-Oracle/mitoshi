// `GET /api/launch/logo/<sha256>` (S17; R4-11, D-227): a stored launch logo, by the sha256 of its bytes — immutable, so
// it caches for a year. 404 for anything not stored.
import { createPgLaunchLogos } from "@cwf/db";
import { db } from "@/server/db";

export async function GET(_req: Request, ctx: { params: Promise<{ sha: string }> }): Promise<Response> {
  const { sha } = await ctx.params;
  if (!/^[0-9a-f]{64}$/.test(sha)) return new Response(null, { status: 404 });
  const logo = await createPgLaunchLogos(db()).get(sha).catch(() => null);
  if (!logo) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  return new Response(new Blob([logo.bytes as BlobPart], { type: logo.contentType }), {
    headers: { "content-type": logo.contentType, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" },
  });
}
