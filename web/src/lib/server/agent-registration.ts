/**
 * `/api/agents/<strategyId>/registration.json` (plan C.2.3, N-07): the ERC-8004 registration file an agent's
 * `agentURI` points to, built from its `agent_registrations` row. Kept apart from the route so it runs without Next.
 */
import { NETWORKS, networkFrom } from "@cwf/core";
import { agentRegistrationByStrategy, type Sql } from "@cwf/db";
import { buildAgentRegistration } from "@cwf/markets";

const STRATEGY_ID = /^[A-Za-z0-9._-]{1,64}$/;

export async function agentRegistrationResponse(sql: Sql | null, strategyId: string, origin: string, network = networkFrom(process.env.NETWORK)): Promise<Response> {
  if (!STRATEGY_ID.test(strategyId)) return Response.json({ error: "unknown strategy" }, { status: 404 });
  if (!sql) return Response.json({ error: "registrations are unavailable (no database configured)" }, { status: 503 });
  const chainId = NETWORKS[network];
  const row = await agentRegistrationByStrategy(sql, chainId, strategyId);
  if (!row) return Response.json({ error: "unknown strategy" }, { status: 404 });
  const file = buildAgentRegistration({
    strategyId,
    name: row.name,
    description: row.description,
    image: row.image,
    origin,
    active: row.active,
    registrations: [{ chainId, agentId: row.agentId }],
  });
  return Response.json(file, { headers: { "cache-control": "public, s-maxage=60", "access-control-allow-origin": "*" } });
}
