// The fee relay (plan C.3.3): `Handler.relay` at /api/relay and /api/relay/:chainId (the provider posts to both,
// D-055), built once per process. Each request's JSON-RPC method, install id and region go into AsyncLocalStorage so
// the policy's `validate` knows which call it is judging (every co-signing method is debited; see relay/gates.ts).
import { relayContext } from "@cwf/markets/server";
import { MissingConfigError, unavailable } from "@/server/env";
import { requestPosture } from "@/server/region";
import { relayHandler } from "@/server/relay";
import { deviceId } from "@/server/request";

export async function POST(req: Request): Promise<Response> {
  let relay;
  try {
    relay = relayHandler();
  } catch (error) {
    if (error instanceof MissingConfigError) return unavailable(error);
    throw error;
  }
  const body = await req.clone().json().catch(() => null);
  const first = Array.isArray(body) ? body[0] : body;
  const method = typeof first?.method === "string" ? first.method : "unknown";
  const ctx = { method, device: deviceId(req), region: requestPosture(req), nowSec: Math.floor(Date.now() / 1000) };
  return relayContext.run(ctx, () => relay.handler.fetch(req));
}
