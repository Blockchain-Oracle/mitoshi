/**
 * `/themes*`'s reads on the Tempo read runtime (S16a; R4-11, D-227): the catalogue (`themeCount` themes, ids from 1,
 * newest first), one theme with its tokens and bands and each member's StockReference price, the mirrors a theme may
 * list (`ThemeRegistry.isEligible`), a follower's follow, and the router's own events for followers (Followed −
 * Unfollowed) and the rebalance timeline (Rebalanced). Each returns a `Reading`; a network without themes answers
 * empty / null inside it. Event reads walk from the registry's deploy block in RPC-sized windows.
 */
import { deployments as generated } from "@cwf/clients";
import { stockReferenceAbi } from "@cwf/clients/abis/StockReference";
import { themeRegistryAbi } from "@cwf/clients/abis/ThemeRegistry";
import { themeRouterAbi } from "@cwf/clients/abis/ThemeRouter";
import { specFromUri, type Reading, type ThemeSpec } from "@cwf/core";
import { erc20Abi, getAddress, type Address, type Hex } from "viem";
import { Abis, Addresses } from "viem/tempo";
import { getLogClient, getPublicClient } from "../runtime/read-runtime";
import { withReading } from "../runtime/reading";
import { themesVenueOf } from "./encoders";

const PATH_USD: Address = "0x20C0000000000000000000000000000000000000";
const LOG_WINDOW = 90_000n;

export interface ThemeBand { minBps: number; targetBps: number; maxBps: number; allowed: boolean }
export interface ThemeMember { token: Address; symbol: string; band: ThemeBand; refPriceE18: bigint | null; refObservedAtSec: bigint | null }
export interface ThemeView {
  themeId: bigint;
  creator: Address;
  createdAtSec: bigint;
  version: number;
  creatorFeeBps: number;
  delisted: boolean;
  maxSlippageBps: number;
  minIntervalSec: number;
  maxRefAgeSec: number;
  sessionsMask: number;
  agentId: bigint;
  specHash: Hex;
  specURI: string;
  spec: ThemeSpec | null;
  members: ThemeMember[];
  cash: ThemeBand;
  /** The oracle's session now (0 regular, 1 extended, 2 closed, 3 unknown) and whether this theme trades in it. */
  sessionNow: number | null;
  openNow: boolean | null;
}

const SESSION_ABI = [{ type: "function", name: "currentSession", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] }] as const;

async function sessionNow(client: Awaited<ReturnType<typeof getPublicClient>>, router: Address): Promise<number | null> {
  try {
    const oracle = await client.readContract({ address: router, abi: themeRouterAbi, functionName: "oracle" });
    return Number(await client.readContract({ address: oracle, abi: SESSION_ABI, functionName: "currentSession" }));
  } catch {
    return null;
  }
}

/** The stock mirrors this chain knows (`MirrorTSLA` … in the stocks fragment), symbol by address. */
export function mirrorsOf(chainId: number): { token: Address; symbol: string }[] {
  const contracts = (generated as unknown as Fragments)[String(chainId)]?.stocks?.contracts ?? {};
  return Object.entries(contracts).filter(([name]) => name.startsWith("Mirror")).map(([name, c]) => ({ token: getAddress(c.address), symbol: name.slice("Mirror".length) }));
}

async function venue() {
  const client = await getPublicClient();
  return { client, v: themesVenueOf(client.chain.id), chainId: client.chain.id };
}

type Fragments = Record<string, Record<string, { contracts: Record<string, { address: string }> }>>;
/** StockReference lives in the `guard` fragment (S15b), beside the StockGuardHook the theme pools wear. */
const stockReference = (chainId: number): Address | null => {
  const a = (generated as unknown as Fragments)[String(chainId)]?.guard?.contracts.StockReference?.address;
  return a ? getAddress(a) : null;
};

async function readTheme(client: Awaited<ReturnType<typeof getPublicClient>>, v: NonNullable<ReturnType<typeof themesVenueOf>>, chainId: number, themeId: bigint, session: number | null): Promise<ThemeView> {
  const reg = { address: v.registry, abi: themeRegistryAbi } as const;
  const t = await client.readContract({ ...reg, functionName: "theme", args: [themeId] });
  const tokens = await client.readContract({ ...reg, functionName: "tokensOf", args: [themeId, t.version] });
  const names = new Map(mirrorsOf(chainId).map((m) => [m.token.toLowerCase(), m.symbol]));
  const ref = stockReference(chainId);
  const [bands, cash, refs] = await Promise.all([
    Promise.all(tokens.map((tok) => client.readContract({ ...reg, functionName: "bandOf", args: [themeId, t.version, tok] }))),
    client.readContract({ ...reg, functionName: "bandOf", args: [themeId, t.version, PATH_USD] }),
    Promise.all(tokens.map((tok) => (ref ? client.readContract({ address: ref, abi: stockReferenceAbi, functionName: "read", args: [tok] }).catch(() => null) : Promise.resolve(null)))),
  ]);
  const band = (b: { minBps: number; targetBps: number; maxBps: number; allowed: boolean }): ThemeBand => ({ minBps: b.minBps, targetBps: b.targetBps, maxBps: b.maxBps, allowed: b.allowed });
  return {
    themeId,
    creator: t.creator,
    createdAtSec: BigInt(t.createdAt),
    version: t.version,
    creatorFeeBps: t.creatorFeeBps,
    delisted: t.delisted,
    maxSlippageBps: t.maxSlippageBps,
    minIntervalSec: t.minIntervalSec,
    maxRefAgeSec: t.maxRefAgeSec,
    sessionsMask: t.sessionsMask,
    agentId: t.erc8004AgentId,
    specHash: t.specHash,
    specURI: t.specURI,
    spec: specFromUri(t.specURI),
    members: tokens.map((token, i) => {
      const r = refs[i] as { priceE18: bigint; observedAt: bigint } | null;
      return { token: getAddress(token), symbol: names.get(token.toLowerCase()) ?? token.slice(0, 8), band: band(bands[i]![1]), refPriceE18: r && r.priceE18 > 0n ? r.priceE18 : null, refObservedAtSec: r ? BigInt(r.observedAt) : null };
    }),
    cash: band(cash[1]),
    sessionNow: session,
    openNow: session === null ? null : ((t.sessionsMask >> session) & 1) === 1,
  };
}

/** Every published theme, newest first; empty without themes. */
export async function listThemes(limit = 50): Promise<Reading<ThemeView[]>> {
  return withReading(`themes:${limit}`, async () => {
    const { client, v, chainId } = await venue();
    if (!v) return [];
    const count = await client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "themeCount" });
    const ids: bigint[] = [];
    for (let id = count; id >= 1n && ids.length < limit; id--) ids.push(id);
    const session = await sessionNow(client, v.router);
    return Promise.all(ids.map((id) => readTheme(client, v, chainId, id, session)));
  });
}

export async function getTheme(themeId: bigint): Promise<Reading<ThemeView | null>> {
  return withReading(`theme:${themeId}`, async () => {
    const { client, v, chainId } = await venue();
    if (!v) return null;
    const count = await client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "themeCount" });
    return themeId >= 1n && themeId <= count ? readTheme(client, v, chainId, themeId, await sessionNow(client, v.router)) : null;
  });
}

/** The mirrors a theme may list now (a recorded pool the guard still reports), each with its reference price. */
export async function listEligibleMirrors(): Promise<Reading<{ token: Address; symbol: string; refPriceE18: bigint | null }[]>> {
  return withReading("themes:eligible", async () => {
    const { client, v, chainId } = await venue();
    if (!v) return [];
    const ref = stockReference(chainId);
    const mirrors = mirrorsOf(chainId);
    const rows = await Promise.all(
      mirrors.map(async (m) => {
        const [ok, r] = await Promise.all([
          client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "isEligible", args: [m.token] }),
          ref ? client.readContract({ address: ref, abi: stockReferenceAbi, functionName: "read", args: [m.token] }).catch(() => null) : Promise.resolve(null),
        ]);
        const p = r as { priceE18: bigint } | null;
        return ok ? { ...m, refPriceE18: p && p.priceE18 > 0n ? p.priceE18 : null } : null;
      }),
    );
    return rows.filter((r): r is NonNullable<typeof r> => r !== null);
  });
}

export interface ThemeActivity {
  followers: Address[];
  rebalances: { follower: Address; decisionId: Hex; version: number; txKey: Address; notionalUsd: bigint; fee: bigint; blockNumber: bigint; txHash: Hex }[];
}

/** Followers now (Followed minus a later Unfollowed) and every rebalance, oldest first, from the router's events. */
export async function getThemeActivity(themeId: bigint): Promise<Reading<ThemeActivity>> {
  return withReading(`themeActivity:${themeId}`, async () => {
    const client = await getLogClient();
    const v = themesVenueOf(client.chain.id);
    if (!v) return { followers: [], rebalances: [] };
    const head = await client.getBlockNumber();
    const state = new Map<string, boolean>();
    const rebalances: ThemeActivity["rebalances"] = [];
    for (let from = v.deployBlock; from <= head; from += LOG_WINDOW) {
      const to = from + LOG_WINDOW - 1n > head ? head : from + LOG_WINDOW - 1n;
      const logs = await client.getContractEvents({ address: v.router, abi: themeRouterAbi, fromBlock: from, toBlock: to });
      for (const log of logs) {
        const a = log.args as Record<string, unknown>;
        if (a.themeId !== themeId) continue;
        if (log.eventName === "Followed") state.set(String(a.follower).toLowerCase(), true);
        else if (log.eventName === "Unfollowed") state.set(String(a.follower).toLowerCase(), false);
        else if (log.eventName === "Rebalanced") rebalances.push({ follower: a.follower as Address, decisionId: a.decisionId as Hex, version: Number(a.version), txKey: a.txKey as Address, notionalUsd: a.notionalUsd as bigint, fee: a.fee as bigint, blockNumber: log.blockNumber!, txHash: log.transactionHash! });
      }
    }
    return { followers: [...state.entries()].filter(([, on]) => on).map(([f]) => getAddress(f)), rebalances };
  });
}

export async function getFollow(follower: Address, themeId: bigint) {
  return withReading(`themeFollow:${follower.toLowerCase()}:${themeId}`, async () => {
    const { client, v } = await venue();
    if (!v) return null;
    return client.readContract({ address: v.router, abi: themeRouterAbi, functionName: "followOf", args: [follower, themeId] });
  });
}

/**
 * A live follow's theme tokens its agent key may not yet approve (a split follow that stopped before its last
 * `setAllowedCalls` chunk, D-100): the theme's tokens less the key's scopes (`AccountKeychain.getAllowedCalls`).
 */
export async function getUnscopedTokens(follower: Address, themeId: bigint): Promise<Reading<{ keyId: Address; tokens: Address[] } | null>> {
  return withReading(`themeUnscoped:${follower.toLowerCase()}:${themeId}`, async () => {
    const { client, v } = await venue();
    if (!v) return null;
    const f = await client.readContract({ address: v.router, abi: themeRouterAbi, functionName: "followOf", args: [follower, themeId] });
    if (!f.active) return null;
    const [tokens, [, scopes]] = await Promise.all([
      client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "tokensOf", args: [themeId, f.version] }),
      client.readContract({ address: Addresses.accountKeychain, abi: Abis.accountKeychain, functionName: "getAllowedCalls", args: [follower, f.keyId] }),
    ]);
    const scoped = new Set(scopes.map((s) => s.target.toLowerCase()));
    return { keyId: getAddress(f.keyId), tokens: tokens.filter((t) => !scoped.has(t.toLowerCase())).map((t) => getAddress(t)) };
  });
}

/** What a follower holds of each of a theme's tokens (the sell-everything sheet), in token base units. */
export async function getThemeHoldings(follower: Address, themeId: bigint): Promise<Reading<{ token: Address; balance: bigint }[]>> {
  return withReading(`themeHoldings:${follower.toLowerCase()}:${themeId}`, async () => {
    const { client, v } = await venue();
    if (!v) return [];
    const t = await client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "theme", args: [themeId] });
    const tokens = await client.readContract({ address: v.registry, abi: themeRegistryAbi, functionName: "tokensOf", args: [themeId, t.version] });
    return Promise.all(tokens.map(async (token) => ({ token: getAddress(token), balance: await client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [follower] }) })));
  });
}

/** A follower's latest rebalance across every theme (the reel's theme card), from the router's indexed event; null if none. */
export async function getLatestRebalanceFor(follower: Address): Promise<Reading<{ themeId: bigint; notionalUsd: bigint; fee: bigint; decisionId: Hex; txHash: Hex; blockNumber: bigint } | null>> {
  return withReading(`themeLatest:${follower.toLowerCase()}`, async () => {
    const client = await getLogClient();
    const v = themesVenueOf(client.chain.id);
    if (!v) return null;
    const head = await client.getBlockNumber();
    for (let to = head; to >= v.deployBlock; to -= LOG_WINDOW) {
      const from = to - LOG_WINDOW + 1n > v.deployBlock ? to - LOG_WINDOW + 1n : v.deployBlock;
      const logs = await client.getContractEvents({ address: v.router, abi: themeRouterAbi, eventName: "Rebalanced", args: { follower }, fromBlock: from, toBlock: to });
      const last = logs.at(-1);
      if (last) {
        const a = last.args as { themeId: bigint; notionalUsd: bigint; fee: bigint; decisionId: Hex };
        return { themeId: a.themeId, notionalUsd: a.notionalUsd, fee: a.fee, decisionId: a.decisionId, txHash: last.transactionHash!, blockNumber: last.blockNumber! };
      }
      if (from === v.deployBlock) break;
    }
    return null;
  });
}
