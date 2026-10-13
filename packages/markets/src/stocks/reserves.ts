/**
 * `/reserves`' reads (S14w; the 14c.11 invariant; D-227 R4-12): per ticker, what the Robinhood lockbox holds, what the
 * Base hop carries and what Tempo minted, deferred and allows — each from its own chain, at a stated block, then
 * checked by `@cwf/core` `conservation`. Before the Robinhood side is deployed its column is null and the checks that
 * need it are "unavailable"; nothing is filled in.
 *
 * "Only the adapter issues" is proven from the mirror's `RoleMembershipUpdated(ISSUER_ROLE)` events (TIP-20 has no role
 * enumeration). Moderato answers at most 100,000 blocks per `eth_getLogs`, so `scanIssuers` walks in slices from a
 * cursor: reserve-watch keeps the holder set and its cursor in `reserve_snapshots`, and the browser's Re-check only
 * scans what came after.
 */
import { keccak256, toBytes, type Address, type PublicClient } from "viem";
import { conservation, toShared, LZ_EID, type BridgeTicker, type Conservation, type Network, type Reading, type ReserveReads } from "@cwf/core";
import { iTIP20Abi } from "@cwf/clients/abis/ITIP20";
import { scaledUIViewAbi } from "@cwf/clients/abis/ScaledUIView";
import { stockSyncReceiverAbi } from "@cwf/clients/abis/StockSyncReceiver";
import { tIP20MintBurnAdapterAbi } from "@cwf/clients/abis/TIP20MintBurnAdapter";
import { transitOFTAbi } from "@cwf/clients/abis/TransitOFT";
import { withReading } from "../runtime/reading";
import { iTIP20RolesAuthAbi } from "@cwf/clients/abis/ITIP20RolesAuth";
import { stockLockboxAbi } from "@cwf/clients/abis/StockLockbox";
import { RH_DECIMALS } from "./params";
import type { BridgeClients } from "./clients";
import { bridgeTopology, type TickerContracts } from "./topology";

export const ISSUER_ROLE = keccak256(toBytes("ISSUER_ROLE"));
/** Moderato's `eth_getLogs` ceiling. */
export const LOG_RANGE = 100_000n;

export interface IssuerScan {
  holders: Address[];
  /** The last block the scan covered. */
  toBlock: bigint;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Public RPCs answer a burst of log slices with 429; wait and retry a few times rather than fail the whole scan. */
async function patient<T>(run: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await run();
    } catch (error) {
      if (i >= tries || !/rate limit|429|exceeds defined limit/i.test(error instanceof Error ? error.message : String(error))) throw error;
      await sleep(250 * 2 ** i);
    }
  }
}

/** Applies `RoleMembershipUpdated(ISSUER_ROLE)` events in (`fromBlock`, `toBlock`] to a prior holder set. */
export async function scanIssuers(client: PublicClient, mirror: Address, fromBlock: bigint, toBlock: bigint, prior: readonly Address[] = []): Promise<IssuerScan> {
  const holders = new Set(prior.map((a) => a.toLowerCase() as Address));
  const event = iTIP20RolesAuthAbi.find((e) => e.type === "event" && e.name === "RoleMembershipUpdated")!;
  for (let from = fromBlock; from <= toBlock; from += LOG_RANGE) {
    const to = from + LOG_RANGE - 1n < toBlock ? from + LOG_RANGE - 1n : toBlock;
    const logs = await patient(() => client.getLogs({ address: mirror, event, args: { role: ISSUER_ROLE }, fromBlock: from, toBlock: to }));
    for (const log of logs) {
      const account = (log.args.account as Address).toLowerCase() as Address;
      if (log.args.hasRole) holders.add(account);
      else holders.delete(account);
    }
  }
  return { holders: [...holders].sort(), toBlock };
}

export interface TickerFacts {
  paused: boolean;
  sendsPaused: boolean;
  supplyCap: bigint;
  adapterIsIssuer: boolean;
  multiplierE18: bigint;
  /** Robinhood source time of the last applied multiplier sync; null = never synced. */
  syncedAtSec: number | null;
  statusFlags: number;
  inbound: { capacity: bigint; available: bigint; windowSec: number };
  outbound: { capacity: bigint; available: bigint; windowSec: number };
  /** Robinhood lockbox: locks paused and its outbound bucket (18 dp → 6 dp); null while not deployed. */
  lockbox: { locksPaused: boolean; capacity: bigint; available: bigint } | null;
}

export interface TickerReserve {
  ticker: BridgeTicker;
  contracts: TickerContracts;
  reads: ReserveReads;
  facts: TickerFacts;
  check: Conservation;
}

export interface ReservesView {
  network: Network;
  atMs: number;
  blocks: { tempo: bigint; base: bigint | null; robinhood: bigint | null };
  tickers: TickerReserve[];
}

/** Issuer holder sets the caller already knows (the last snapshot), with the block they were scanned to. */
export type KnownIssuers = Partial<Record<BridgeTicker, IssuerScan>>;

async function tempoSide(c: PublicClient, t: TickerContracts, receiver: Address | null, blockNumber: bigint) {
  const mirror = t.mirror!;
  const adapter = t.adapter!;
  const [supply, cap, paused, deferred, minted, sendsPaused, inbound, outbound, issuer] = await c.multicall({
    allowFailure: false,
    blockNumber,
    contracts: [
      { address: mirror, abi: iTIP20Abi, functionName: "totalSupply" },
      { address: mirror, abi: iTIP20Abi, functionName: "supplyCap" },
      { address: mirror, abi: iTIP20Abi, functionName: "paused" },
      { address: adapter, abi: tIP20MintBurnAdapterAbi, functionName: "totalDeferred" },
      { address: adapter, abi: tIP20MintBurnAdapterAbi, functionName: "mintedNet" },
      { address: adapter, abi: tIP20MintBurnAdapterAbi, functionName: "sendsPaused" },
      { address: adapter, abi: tIP20MintBurnAdapterAbi, functionName: "inboundLimit" },
      { address: adapter, abi: tIP20MintBurnAdapterAbi, functionName: "outboundLimit", args: [LZ_EID.baseSepolia] },
      { address: mirror, abi: iTIP20RolesAuthAbi, functionName: "hasRole", args: [adapter, ISSUER_ROLE] },
    ],
  });
  const [multiplier, sync] = await Promise.all([
    t.uiView ? c.readContract({ address: t.uiView, abi: scaledUIViewAbi, functionName: "uiMultiplier", blockNumber }) : Promise.resolve(10n ** 18n),
    receiver ? c.readContract({ address: receiver, abi: stockSyncReceiverAbi, functionName: "syncOf", args: [mirror], blockNumber }) : Promise.resolve(null),
  ]);
  return { supply, cap, paused, deferred, minted, sendsPaused, inbound, outbound, issuer, multiplier, sync };
}

/** Every ticker's reserve, each chain read once, as of the blocks it returns. */
export async function readReserves(clients: BridgeClients, known: KnownIssuers = {}, opts: { fullIssuerScan?: boolean } = {}): Promise<Reading<ReservesView>> {
  return withReading(`reserves:${clients.network}`, async () => {
    const topo = bridgeTopology(clients.network);
    const live = Object.values(topo.tickers).filter((t) => t.adapter && t.mirror);
    const [tempoBlock, baseBlock, rhBlock] = await Promise.all([
      clients.tempo.getBlockNumber(),
      clients.base && live.some((t) => t.transit) ? clients.base.getBlockNumber() : Promise.resolve(null),
      live.some((t) => t.lockbox) ? clients.robinhood.getBlockNumber() : Promise.resolve(null),
    ]);
    // One mirror at a time: a first scan walks ~20 log slices per mirror and a public RPC rate-limits a burst.
    const scans = new Map<BridgeTicker, IssuerScan>();
    for (const t of live) {
      const prior = known[t.ticker];
      if (prior) scans.set(t.ticker, await scanIssuers(clients.tempo, t.mirror!, prior.toBlock + 1n, tempoBlock, prior.holders));
      else if (opts.fullIssuerScan) scans.set(t.ticker, await scanIssuers(clients.tempo, t.mirror!, topo.tempoFromBlock, tempoBlock));
    }
    const tickers = await Promise.all(
      live.map(async (t): Promise<TickerReserve> => {
        const [tempo, transitSupply, lockbox] = await Promise.all([
          tempoSide(clients.tempo, t, topo.receiver, tempoBlock),
          t.transit && clients.base && baseBlock !== null ? clients.base.readContract({ address: t.transit, abi: transitOFTAbi, functionName: "totalSupply", blockNumber: baseBlock }) : Promise.resolve(null),
          t.lockbox && rhBlock !== null
            ? Promise.all([
                clients.robinhood.readContract({ address: t.lockbox, abi: stockLockboxAbi, functionName: "reserveView", blockNumber: rhBlock }),
                clients.robinhood.readContract({ address: t.lockbox, abi: stockLockboxAbi, functionName: "locksPaused", blockNumber: rhBlock }),
                clients.robinhood.readContract({ address: t.lockbox, abi: stockLockboxAbi, functionName: "outboundLimit", args: [LZ_EID.baseSepolia], blockNumber: rhBlock }),
              ])
            : Promise.resolve(null),
        ]);
        const issuers = scans.get(t.ticker) ?? null;
        const reads: ReserveReads = {
          lockbox: lockbox ? { locked: toShared(lockbox[0][0], RH_DECIMALS), outstanding: toShared(lockbox[0][1], RH_DECIMALS), owed: toShared(lockbox[0][2], RH_DECIMALS) } : null,
          // Mainnet has no hop (nothing can sit on Base); on testnet an unread or undeployed hop stays unknown.
          transitSupply: clients.network === "mainnet" ? 0n : transitSupply === null ? null : toShared(transitSupply, RH_DECIMALS),
          supply: tempo.supply,
          supplyCap: tempo.cap,
          deferred: tempo.deferred,
          mintedNet: tempo.minted,
          adapter: t.adapter!,
          issuers: issuers?.holders ?? null,
        };
        const facts: TickerFacts = {
          paused: tempo.paused,
          sendsPaused: tempo.sendsPaused,
          supplyCap: tempo.cap,
          adapterIsIssuer: tempo.issuer,
          multiplierE18: tempo.multiplier,
          syncedAtSec: tempo.sync && tempo.sync.syncedAt > 1n ? Number(tempo.sync.syncedAt) : null,
          statusFlags: tempo.sync ? Number(tempo.sync.flags) : 0,
          inbound: { capacity: tempo.inbound[0], available: tempo.inbound[1], windowSec: Number(tempo.inbound[2]) },
          outbound: { capacity: tempo.outbound[0], available: tempo.outbound[1], windowSec: Number(tempo.outbound[2]) },
          lockbox: lockbox ? { locksPaused: lockbox[1], capacity: toShared(lockbox[2][0], RH_DECIMALS), available: toShared(lockbox[2][2], RH_DECIMALS) } : null,
        };
        return { ticker: t.ticker, contracts: t, reads, facts, check: conservation(reads) };
      }),
    );
    return { network: clients.network, atMs: Date.now(), blocks: { tempo: tempoBlock, base: baseBlock, robinhood: rhBlock }, tickers };
  });
}

/** The issuer scans a reserves view carried (for the next snapshot's cursor). */
export function issuerScansOf(view: ReservesView): KnownIssuers {
  return Object.fromEntries(view.tickers.filter((t) => t.reads.issuers).map((t) => [t.ticker, { holders: [...t.reads.issuers!], toBlock: view.blocks.tempo }]));
}
