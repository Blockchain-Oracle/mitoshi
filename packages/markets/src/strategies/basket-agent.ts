/**
 * The themes' agent's ERC-8004 identity (S16a; R4-11, D-227; D-231). Agent #82 was registered once on Moderato by the
 * themes' creator (`deployer-themes`, 0xb0A5…8D6) in the pinned IdentityRegistry, with its `agentURI` pointing at
 * BASKET_AGENT_PATH on the app — so that route must keep answering, or the identity 404s. Since D-231 every theme is a
 * `basket` strategy on the StrategyRegistry that names this agent and the house strategy-runner calls; the file says so.
 * Built here from the pinned id (no database row).
 */
import type { Address, Hex } from "viem";
import { agentRegistryId } from "../agents/erc8004";
import { REGISTRATION_TYPE, type AgentRegistrationFile } from "../agents/registration";

/** The agent's on-chain `agentURI` path (unchanged since R4-11: the identity resolves through it). */
export const BASKET_AGENT_PATH = "/api/themes/agent/registration.json";

export interface BasketAgentIdentity {
  agentId: bigint;
  owner: Address;
  registerTx: Hex;
}

/** Filled from the live `register` receipt (docs/plan/acceptance/R4-11.md); absent = not registered on that chain. */
export const BASKET_AGENT: Partial<Record<number, BasketAgentIdentity>> = {
  42431: { agentId: 82n, owner: "0xb0A5F0389098a8B0F33B9B6d6cf2a5917F8A58D6", registerTx: "0xedc667045396306f8de29d2545723b9fb24ab6f75ed84cd0d579c0d565f27039" },
};

export function basketAgentOf(chainId: number): BasketAgentIdentity | null {
  return BASKET_AGENT[chainId] ?? null;
}

/** The ERC-8004 registration file (`registration-v1`) the agent's `agentURI` points to. */
export function basketAgentRegistration(origin: string, chainId: number): AgentRegistrationFile {
  if (!/^https:\/\//.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) throw new Error("origin must be https");
  const base = origin.replace(/\/$/, "");
  const id = basketAgentOf(chainId);
  return {
    type: REGISTRATION_TYPE,
    name: "Mitoshi themes agent",
    description: "Trades Mitoshi's themes: weighted stock baskets published as strategies. On each stock's own Windows it makes one UP or DOWN call by the theme's rule, sized by that stock's weight, inside each follower's STRATEGY grant. Every Window opens and settles on RedStone's signed prints.",
    image: `${base}/api/agents/themes/image.svg`,
    services: [{ name: "web", endpoint: `${base}/themes` }],
    x402Support: false,
    active: id !== null,
    registrations: id ? [{ agentId: Number(id.agentId), agentRegistry: agentRegistryId(chainId) }] : [],
    supportedTrust: ["reputation"],
  };
}
