// The browser's same-origin RPC (round 7; server/rpc-proxy.ts): allowlisted JSON-RPC to the server's private RPC.
import { serverEnv } from "@/server/env";
import { ipHash } from "@/server/request";
import { admit, refusal } from "@/server/rpc-proxy";

const TIMEOUT_MS = 10_000;

function rpcError(status: number, message: string): Response {
  return Response.json({ jsonrpc: "2.0", id: null, error: { code: status === 429 ? -32005 : -32600, message } }, { status, headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return rpcError(400, "not JSON");
  }
  const why = refusal(body);
  if (why) return rpcError(400, why);
  if (!admit(ipHash(req), Array.isArray(body) ? body.length : 1)) return rpcError(429, "slow down");
  try {
    const upstream = await fetch(serverEnv().rpcHttpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    return new Response(await upstream.text(), { status: upstream.status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  } catch {
    return rpcError(502, "the chain didn't answer");
  }
}
