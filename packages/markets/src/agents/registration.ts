/**
 * The ERC-8004 agent registration file (spec "Agent URI and Agent Registration File", type `registration-v1`) that an
 * agent's `agentURI` points to — served per strategy at `/api/agents/<strategyId>/registration.json`. Pure: the web
 * route supplies the row from `agent_registrations` and the site origin.
 */
import { agentRegistryId } from "./erc8004";

export const REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

export interface AgentRegistrationInput {
  strategyId: string;
  name: string;
  description: string;
  /** Absolute https URL of the agent's image. */
  image: string;
  /** Site origin, e.g. `https://testnet.mitoshi.xyz`. */
  origin: string;
  active: boolean;
  /** On-chain registrations once minted (empty before the first `register`). */
  registrations: readonly { chainId: number; agentId: bigint }[];
}

export interface AgentRegistrationFile {
  type: typeof REGISTRATION_TYPE;
  name: string;
  description: string;
  image: string;
  services: { name: string; endpoint: string; version?: string }[];
  x402Support: false;
  active: boolean;
  registrations: { agentId: number; agentRegistry: string }[];
  supportedTrust: string[];
}

/** The URL an agent's `agentURI` is set to. */
export function registrationUrl(origin: string, strategyId: string): string {
  return `${origin.replace(/\/$/, "")}/api/agents/${encodeURIComponent(strategyId)}/registration.json`;
}

export function buildAgentRegistration(input: AgentRegistrationInput): AgentRegistrationFile {
  if (!/^https:\/\//.test(input.origin) && !/^http:\/\/localhost(:\d+)?$/.test(input.origin)) throw new Error("origin must be https");
  const origin = input.origin.replace(/\/$/, "");
  return {
    type: REGISTRATION_TYPE,
    name: input.name,
    description: input.description,
    image: input.image,
    // The agents board lists every registered strategy; per-agent pages and a receipts endpoint join in S9.
    services: [{ name: "web", endpoint: `${origin}/agents` }],
    x402Support: false,
    active: input.active,
    registrations: input.registrations.map((r) => {
      if (r.agentId > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("agentId exceeds a JSON-safe integer");
      return { agentId: Number(r.agentId), agentRegistry: agentRegistryId(r.chainId) };
    }),
    supportedTrust: ["reputation"],
  };
}
