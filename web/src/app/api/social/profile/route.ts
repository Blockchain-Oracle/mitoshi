// `/api/social/profile` (S13 step 5): GET ?address= — the public name, bio, follower counts and, with a session, whether
// the viewer follows; PUT {displayName, bio} — your own (Tradash's 3–20 letters, digits or underscores; 160 characters
// of bio; a name is one person's, without regard to case). The bio is starred on read like every social text.
import { isAddress } from "viem";
import { BIO_MAX, DISPLAY_NAME } from "@cwf/db";
import { callerSession } from "@/server/session";
import { people } from "@/server/social";
import { clean, flagged } from "@/server/word-filter";

const noStore = { "cache-control": "no-store" };

export async function GET(req: Request): Promise<Response> {
  const address = new URL(req.url).searchParams.get("address");
  if (!address || !isAddress(address)) return Response.json({ error: "bad_address" }, { status: 400, headers: noStore });
  const a = address.toLowerCase();
  try {
    const session = await callerSession(req);
    const viewer = session?.address.toLowerCase() ?? null;
    const [profiles, counts, follows] = await Promise.all([people().profiles([a]), people().followCounts(a), viewer && viewer !== a ? people().isFollowing(viewer, a) : Promise.resolve(null)]);
    const p = profiles.get(a);
    return Response.json({ address: a, displayName: p?.displayName ?? null, bio: p?.bio ? clean(p.bio) : null, ...counts, viewerFollows: follows, self: viewer === a }, { headers: noStore });
  } catch {
    return Response.json({ error: "unreadable" }, { status: 503, headers: noStore });
  }
}

export async function PUT(req: Request): Promise<Response> {
  const session = await callerSession(req);
  if (!session) return Response.json({ error: "no_session", message: "Sign in to edit your profile." }, { status: 401, headers: noStore });
  const b = (await req.json().catch(() => ({}))) as { displayName?: unknown; bio?: unknown };
  const displayName = typeof b.displayName === "string" && b.displayName.trim() ? b.displayName.trim() : null;
  const bio = typeof b.bio === "string" && b.bio.trim() ? b.bio.trim() : null;
  if (displayName && !DISPLAY_NAME.test(displayName)) return Response.json({ error: "bad_name", message: "A name is 3 to 20 letters, digits or underscores." }, { status: 400, headers: noStore });
  // A public name is shown everywhere a post is: one the filter would star isn't taken (a bio is starred instead).
  if (displayName && flagged(displayName)) return Response.json({ error: "bad_name", message: "Pick another name." }, { status: 400, headers: noStore });
  if (bio && bio.length > BIO_MAX) return Response.json({ error: "bad_bio", message: `A bio is at most ${BIO_MAX} characters.` }, { status: 400, headers: noStore });
  const r = await people().setProfile(session.address, { displayName, bio });
  if (!r.ok) return Response.json({ error: r.reason, message: r.reason === "name_taken" ? "That name is taken." : "That didn't save." }, { status: r.reason === "name_taken" ? 409 : 400, headers: noStore });
  return Response.json({ address: r.profile.address, displayName: r.profile.displayName, bio: r.profile.bio }, { headers: noStore });
}
