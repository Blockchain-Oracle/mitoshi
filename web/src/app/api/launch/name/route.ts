// `GET /api/launch/name?q=` (S17; R4-11, D-227): whether the word filter (`server/word-filter.ts`, the social filter)
// would star anything in a launch's name or ticker, so the create form can ask for another before a signature. A name
// is on chain forever; the filter is a heuristic, so the form refuses rather than stars.
import { flagged } from "@/server/word-filter";

export function GET(req: Request): Response {
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 120);
  return Response.json({ flagged: q.trim() !== "" && flagged(q) }, { headers: { "cache-control": "no-store" } });
}
