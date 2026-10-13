import { NETWORKS, networkFrom } from "@cwf/core";
import { themeAgentRegistration } from "@cwf/markets/themes";

/** The theme agent's ERC-8004 registration file (its on-chain `agentURI`; R4-11, D-227), from the pinned identity. */
export function GET(request: Request): Response {
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  const file = themeAgentRegistration(origin, NETWORKS[networkFrom(process.env.NETWORK)]);
  return Response.json(file, { headers: { "cache-control": "public, s-maxage=300", "access-control-allow-origin": "*" } });
}
