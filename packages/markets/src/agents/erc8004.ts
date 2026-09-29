/**
 * ERC-8004 "Trustless Agents" on Tempo (plan C.2.3 "agent register / feedback", N-07, AG-1, AG-15): per-network
 * registries, the calls the owner and raters sign, the reads the board shows, and the agent registration file.
 *
 *   register(agentURI)          → mints the agent NFT to msg.sender; `Registered(agentId, agentURI, owner)`
 *   setAgentURI(agentId, uri)   → owner/operator only; `URIUpdated`
 *   giveFeedback(agentId, …)    → any client EXCEPT the agent's owner/operator ("Self-feedback not allowed"), so the
 *                                 platform rates from a separate rater account (AG-15)
 *   readAllFeedback / getSummary → reputation reads (`clientAddresses` required for the summary)
 *
 * Calls are built here and sent by `tx/send.ts` (the app) or `cast` (scripts) — this module never signs. The registries
 * are upgradeable ERC-1967 proxies owned by the 8004 team (a trust dependency, 16 §5); `readRegistryVersion` lets
 * `/status` notice an upgrade.
 * Docs: ERC-8004 spec (erc-8004-contracts@b9e466c `ERC8004SPEC.md`), context/tempo/16 §5.
 */
import { decodeEventLog, encodeFunctionData, getAddress, zeroHash, type Address, type Hex, type PublicClient } from "viem";
import { CHAIN, ERC8004 } from "@cwf/clients";
import type { Call } from "../tx/batch";
import { identityRegistryAbi, reputationRegistryAbi } from "./erc8004-abi";

export type Erc8004ChainId = typeof CHAIN.tempo | typeof CHAIN.moderato;

export interface Erc8004Registries {
  chainId: Erc8004ChainId;
  identity: Address;
  reputation: Address;
  validation: Address;
}

/** The pinned registries for a Tempo chain (different vanity sets per network; `pinned.ts`). */
export function erc8004Registries(chainId: number): Erc8004Registries {
  if (chainId !== CHAIN.tempo && chainId !== CHAIN.moderato) throw new Error(`ERC-8004 is not pinned for chain ${chainId}`);
  const r = ERC8004[chainId];
  return { chainId, identity: getAddress(r.identity), reputation: getAddress(r.reputation), validation: getAddress(r.validation) };
}

/** `{namespace}:{chainId}:{identityRegistry}` — the global agent registry id (spec "agentRegistry"). */
export function agentRegistryId(chainId: number): string {
  return `eip155:${chainId}:${erc8004Registries(chainId).identity}`;
}

// ── Calls ────────────────────────────────────────────────────────────────────────────────────────────────────────

const MAX_URI_BYTES = 2_048;

function checkUri(uri: string): void {
  if (!/^(https:\/\/|ipfs:\/\/|data:application\/json)/.test(uri)) throw new Error("agentURI must be https://, ipfs:// or a data:application/json URI");
  if (new TextEncoder().encode(uri).length > MAX_URI_BYTES) throw new Error(`agentURI is longer than ${MAX_URI_BYTES} bytes`);
}

export function registerAgentCall(chainId: number, agentURI: string): Call {
  checkUri(agentURI);
  return { to: erc8004Registries(chainId).identity, data: encodeFunctionData({ abi: identityRegistryAbi, functionName: "register", args: [agentURI] }) };
}

export function setAgentUriCall(chainId: number, agentId: bigint, agentURI: string): Call {
  checkUri(agentURI);
  return { to: erc8004Registries(chainId).identity, data: encodeFunctionData({ abi: identityRegistryAbi, functionName: "setAgentURI", args: [agentId, agentURI] }) };
}

export interface FeedbackInput {
  agentId: bigint;
  /** Signed fixed-point value with `valueDecimals` (0–18), e.g. 8750 with 2 decimals = 87.50. */
  value: bigint;
  valueDecimals: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
  /** keccak256 of the feedback file (not needed for ipfs:// URIs). */
  feedbackHash?: Hex;
}

const INT128_MAX = 2n ** 127n - 1n;

export function giveFeedbackCall(chainId: number, f: FeedbackInput): Call {
  if (!Number.isInteger(f.valueDecimals) || f.valueDecimals < 0 || f.valueDecimals > 18) throw new Error("valueDecimals must be 0–18");
  if (f.value > INT128_MAX || f.value < -INT128_MAX - 1n) throw new Error("value does not fit int128");
  return {
    to: erc8004Registries(chainId).reputation,
    data: encodeFunctionData({
      abi: reputationRegistryAbi,
      functionName: "giveFeedback",
      args: [f.agentId, f.value, f.valueDecimals, f.tag1 ?? "", f.tag2 ?? "", f.endpoint ?? "", f.feedbackURI ?? "", f.feedbackHash ?? zeroHash],
    }),
  };
}

export function revokeFeedbackCall(chainId: number, agentId: bigint, feedbackIndex: bigint): Call {
  return { to: erc8004Registries(chainId).reputation, data: encodeFunctionData({ abi: reputationRegistryAbi, functionName: "revokeFeedback", args: [agentId, feedbackIndex] }) };
}

// ── Receipts ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The part of a receipt log these readers need (viem receipts and `cast --json` receipts both fit). */
export interface LogLike {
  address: Address;
  topics: readonly Hex[];
  data: Hex;
}

export interface Registered {
  agentId: bigint;
  agentURI: string;
  owner: Address;
}

/** The `Registered` event in a receipt's logs (from our identity registry only). */
export function readRegistered(chainId: number, logs: readonly LogLike[]): Registered | null {
  const identity = erc8004Registries(chainId).identity.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== identity) continue;
    try {
      const ev = decodeEventLog({ abi: identityRegistryAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "Registered") return { agentId: ev.args.agentId, agentURI: ev.args.agentURI, owner: getAddress(ev.args.owner) };
    } catch {
      // another event of the registry (Transfer, MetadataSet)
    }
  }
  return null;
}

/** The feedback index a `giveFeedback` receipt assigned (`NewFeedback.feedbackIndex`). */
export function readNewFeedback(chainId: number, logs: readonly LogLike[]): { agentId: bigint; client: Address; feedbackIndex: bigint } | null {
  const reputation = erc8004Registries(chainId).reputation.toLowerCase();
  for (const log of logs) {
    if (log.address.toLowerCase() !== reputation) continue;
    try {
      const ev = decodeEventLog({ abi: reputationRegistryAbi, data: log.data, topics: log.topics as [Hex, ...Hex[]] });
      if (ev.eventName === "NewFeedback") return { agentId: ev.args.agentId, client: getAddress(ev.args.clientAddress), feedbackIndex: ev.args.feedbackIndex };
    } catch {
      // not ours
    }
  }
  return null;
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface AgentOnchain {
  agentId: bigint;
  owner: Address;
  agentURI: string;
  wallet: Address;
}

export async function readAgent(client: PublicClient, chainId: number, agentId: bigint): Promise<AgentOnchain> {
  const { identity } = erc8004Registries(chainId);
  const [owner, agentURI, wallet] = await Promise.all([
    client.readContract({ address: identity, abi: identityRegistryAbi, functionName: "ownerOf", args: [agentId] }),
    client.readContract({ address: identity, abi: identityRegistryAbi, functionName: "tokenURI", args: [agentId] }),
    client.readContract({ address: identity, abi: identityRegistryAbi, functionName: "getAgentWallet", args: [agentId] }),
  ]);
  return { agentId, owner: getAddress(owner), agentURI, wallet: getAddress(wallet) };
}

export interface FeedbackEntry {
  client: Address;
  feedbackIndex: bigint;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  revoked: boolean;
}

/** Every feedback entry for an agent (optionally from given clients / with a tag), revoked ones flagged. */
export async function readAllFeedback(
  client: PublicClient,
  chainId: number,
  agentId: bigint,
  opts: { clients?: readonly Address[]; tag1?: string; tag2?: string; includeRevoked?: boolean } = {},
): Promise<FeedbackEntry[]> {
  const { reputation } = erc8004Registries(chainId);
  const [clients, indexes, values, decimals, tag1s, tag2s, revoked] = await client.readContract({
    address: reputation,
    abi: reputationRegistryAbi,
    functionName: "readAllFeedback",
    args: [agentId, [...(opts.clients ?? [])], opts.tag1 ?? "", opts.tag2 ?? "", opts.includeRevoked ?? false],
  });
  return clients.map((c, i) => ({ client: getAddress(c), feedbackIndex: indexes[i]!, value: values[i]!, valueDecimals: decimals[i]!, tag1: tag1s[i]!, tag2: tag2s[i]!, revoked: revoked[i]! }));
}

/** `getSummary` over the given raters (the registry requires a client list — Sybil resistance is the reader's job). */
export async function readFeedbackSummary(client: PublicClient, chainId: number, agentId: bigint, raters: readonly Address[], tag1 = "", tag2 = "") {
  const { reputation } = erc8004Registries(chainId);
  const [count, value, decimals] = await client.readContract({ address: reputation, abi: reputationRegistryAbi, functionName: "getSummary", args: [agentId, [...raters], tag1, tag2] });
  return { count, value, valueDecimals: decimals };
}

/** Both registries' `getVersion()` — "2.0.0" when pinned (16 §5); a change means the 8004 team upgraded them. */
export async function readRegistryVersion(client: PublicClient, chainId: number): Promise<{ identity: string; reputation: string }> {
  const r = erc8004Registries(chainId);
  const [identity, reputation] = await Promise.all([
    client.readContract({ address: r.identity, abi: identityRegistryAbi, functionName: "getVersion" }),
    client.readContract({ address: r.reputation, abi: reputationRegistryAbi, functionName: "getVersion" }),
  ]);
  return { identity, reputation };
}
