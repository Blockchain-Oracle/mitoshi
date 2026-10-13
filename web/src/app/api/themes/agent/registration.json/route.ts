import { NETWORKS, networkFrom } from "@cwf/core";
import { basketAgentRegistration } from "@cwf/markets/strategies";

/** The themes' agent's ERC-8004 registration file — agent #82's on-chain `agentURI` (R4-11, D-227), kept at this path so
 *  the identity resolves; since D-231 it describes the basket runner (`basketAgentRegistration`). */
export function GET(request: Request): Response {
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const file = basketAgentRegistration(origin, NETWORKS[networkFrom(process.env.NETWORK)]);
  return Response.json(file, { headers: { "cache-control": "public, s-maxage=300", "access-control-allow-origin": "*" } });
}
