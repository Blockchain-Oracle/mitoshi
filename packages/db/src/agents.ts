/** `agent_registrations` (migrations/agents): the ERC-8004 agents we registered, keyed by strategy. */
import type { Sql } from "./index";

export interface AgentRegistrationRow {
  chainId: number;
  agentId: bigint;
  strategyId: string;
  owner: string;
  name: string;
  description: string;
  image: string;
  agentUri: string;
  active: boolean;
  registerTx: string;
}

type Raw = { chain_id: number; agent_id: string; strategy_id: string; owner: string; name: string; description: string; image: string; agent_uri: string; active: boolean; register_tx: string };

const fromRaw = (r: Raw): AgentRegistrationRow => ({
  chainId: r.chain_id,
  agentId: BigInt(r.agent_id),
  strategyId: r.strategy_id,
  owner: r.owner,
  name: r.name,
  description: r.description,
  image: r.image,
  agentUri: r.agent_uri,
  active: r.active,
  registerTx: r.register_tx,
});

/** Records (or refreshes) a registration after its `Registered` receipt. */
export async function upsertAgentRegistration(sql: Sql, row: AgentRegistrationRow): Promise<void> {
  await sql`
    insert into agent_registrations (chain_id, agent_id, strategy_id, owner, name, description, image, agent_uri, active, register_tx)
    values (${row.chainId}, ${row.agentId.toString()}, ${row.strategyId}, ${row.owner.toLowerCase()}, ${row.name}, ${row.description},
      ${row.image}, ${row.agentUri}, ${row.active}, ${row.registerTx})
    on conflict (chain_id, agent_id) do update set strategy_id = excluded.strategy_id, owner = excluded.owner, name = excluded.name,
      description = excluded.description, image = excluded.image, agent_uri = excluded.agent_uri, active = excluded.active, updated_at = now()`;
}

/** After `setAgentURI` lands. */
export async function setAgentRegistrationUri(sql: Sql, chainId: number, agentId: bigint, agentUri: string): Promise<void> {
  await sql`update agent_registrations set agent_uri = ${agentUri}, updated_at = now() where chain_id = ${chainId} and agent_id = ${agentId.toString()}`;
}

export async function agentRegistrationByStrategy(sql: Sql, chainId: number, strategyId: string): Promise<AgentRegistrationRow | null> {
  const [row] = await sql<Raw[]>`
    select chain_id, agent_id::text, strategy_id, owner, name, description, image, agent_uri, active, register_tx
    from agent_registrations where chain_id = ${chainId} and strategy_id = ${strategyId}`;
  return row ? fromRaw(row) : null;
}
