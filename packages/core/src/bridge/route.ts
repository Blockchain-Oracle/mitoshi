/**
 * The bridge's routes (S14w; docs/specs/pillar2.md B.1.3, B.1.5; D-227 R4-12). On mainnet a stock moves in one
 * LayerZero leg, Robinhood Chain 30416 ⇄ Tempo 30410. On testnet the direct 40451 ⇄ 40444 pathway is unsupported, so it
 * hops through Base Sepolia (Q-009): in = lockbox → TransitOFT + compose (40451 → 40245), then HopComposer → adapter
 * (40245 → 40444); out mirrors it. Pure: the markets data layer and the tracker read the legs from here.
 */
import type { Network } from "../constants/network";

/** LayerZero V2 endpoint ids (pinned in `@cwf/clients` LAYERZERO; plan B.1.5). */
export const LZ_EID = { robinhood: 30416, tempo: 30410, robinhoodTestnet: 40451, baseSepolia: 40245, moderato: 40444 } as const;

export type BridgeDirection = "in" | "out";
/** The three stops a stock passes: Robinhood Chain, the Base Sepolia hop (testnet only) and Tempo. */
export type BridgeStop = "robinhood" | "base" | "tempo";

export interface LegPlan {
  index: number;
  from: BridgeStop;
  to: BridgeStop;
  srcEid: number;
  dstEid: number;
  /** The leg lands on the hop composer and carries a compose message (it re-sends from Base). */
  compose: boolean;
}

export interface BridgeRoute {
  direction: BridgeDirection;
  network: Network;
  legs: readonly LegPlan[];
  /** The hop chain, or null on the direct (mainnet) pathway. */
  via: BridgeStop | null;
  /** Every stop in order, source first. */
  stops: readonly BridgeStop[];
}

/** Chain ids per stop and network; Base has no mainnet stop (the mainnet pathway is direct). */
export const STOP_CHAIN_ID: Record<Network, Partial<Record<BridgeStop, number>>> = {
  mainnet: { robinhood: 4663, tempo: 4217 },
  testnet: { robinhood: 46630, base: 84532, tempo: 42431 },
};

const eidOf = (stop: BridgeStop, network: Network): number =>
  network === "mainnet" ? (stop === "tempo" ? LZ_EID.tempo : LZ_EID.robinhood) : stop === "tempo" ? LZ_EID.moderato : stop === "base" ? LZ_EID.baseSepolia : LZ_EID.robinhoodTestnet;

export function routeOf(direction: BridgeDirection, network: Network): BridgeRoute {
  const [src, dst]: [BridgeStop, BridgeStop] = direction === "in" ? ["robinhood", "tempo"] : ["tempo", "robinhood"];
  const stops: BridgeStop[] = network === "mainnet" ? [src, dst] : [src, "base", dst];
  const legs = stops.slice(1).map((to, i): LegPlan => {
    const from = stops[i]!;
    return { index: i, from, to, srcEid: eidOf(from, network), dstEid: eidOf(to, network), compose: to === "base" };
  });
  return { direction, network, legs, via: network === "mainnet" ? null : "base", stops };
}

/** The stop a chain id belongs to on a network, or null. */
export function stopOfChain(chainId: number, network: Network): BridgeStop | null {
  const hit = Object.entries(STOP_CHAIN_ID[network]).find(([, id]) => id === chainId);
  return hit ? (hit[0] as BridgeStop) : null;
}
