/**
 * The theme agent's ERC-8004 identity (S16a "ERC-8004 registration"; R4-11, D-227). One agent — ops' `theme-agent`, which
 * rebalances every follow with its follower's scoped key — is registered once per chain in the pinned IdentityRegistry;
 * each theme names it with its creator's `ThemeRegistry.setAgent(themeId, agentId)` (`theme-set-agent`). Its
 * `agentURI` is the registration file served at THEME_AGENT_PATH, built here from the pinned id (no database row).
 */
import type { Address, Hex } from "viem";
import { agentRegistryId } from "../agents/erc8004";
import { REGISTRATION_TYPE, type AgentRegistrationFile } from "../agents/registration";

export const THEME_AGENT_PATH = "/api/themes/agent/registration.json";

export interface ThemeAgentIdentity { agentId: bigint; owner: Address; registerTx: Hex }

/** Filled from the live `register` receipt (docs/plan/acceptance/R4-11.md); absent = not registered on that chain. */
export const THEME_AGENT: Partial<Record<number, ThemeAgentIdentity>> = {
  42431: { agentId: 82n, owner: "0xb0A5F0389098a8B0F33B9B6d6cf2a5917F8A58D6", registerTx: "0xedc667045396306f8de29d2545723b9fb24ab6f75ed84cd0d579c0d565f27039" },
};

export function themeAgentOf(chainId: number): ThemeAgentIdentity | null {
  return THEME_AGENT[chainId] ?? null;
}

export function themeAgentUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}${THEME_AGENT_PATH}`;
}

/** The ERC-8004 registration file (`registration-v1`) the theme agent's `agentURI` points to. */
export function themeAgentRegistration(origin: string, chainId: number): AgentRegistrationFile {
  if (!/^https:\/\//.test(origin) && !/^http:\/\/localhost(:\d+)?$/.test(origin)) throw new Error("origin must be https");
  const base = origin.replace(/\/$/, "");
  const id = themeAgentOf(chainId);
  return {
    type: REGISTRATION_TYPE,
    name: "Mitoshi theme agent",
    description: "Keeps each follower's wallet inside a theme's bands: one scoped key per follow, rebalances only through the theme router, inside the follower's caps.",
    image: `${base}/api/agents/themes/image.svg`,
    services: [{ name: "web", endpoint: `${base}/themes` }],
    x402Support: false,
    active: id !== null,
    registrations: id ? [{ agentId: Number(id.agentId), agentRegistry: agentRegistryId(chainId) }] : [],
    supportedTrust: ["reputation"],
  };
}
