import { createReviewerSession, deleteReviewerSession, reviewerSession } from "@/server/reviewer";

export async function GET(req: Request): Promise<Response> {
  const address = await reviewerSession(req);
  return Response.json({ address, shared: address !== null, network: "testnet" }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  return createReviewerSession(req, body?.code);
}

export const DELETE = deleteReviewerSession;
