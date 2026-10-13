/**
 * Where every bridge contract lives (S14w; D-227 R4-12). The generated `stocks` fragments are the source of truth
 * (`contracts/deployments/<chain>/stocks.json` → `@cwf/clients`), and the Robinhood testnet Stock Tokens are pinned
 * (`ROBINHOOD_TESTNET`, never resolved by symbol). A contract with no fragment is null — "not deployed", never a guess:
 * today 46630 has none (the deployer has no test ETH there), so every lockbox reads null.
 */
import type { Address } from "viem";
import { BRIDGE_TICKERS, STOP_CHAIN_ID, type BridgeTicker, type Network } from "@cwf/core";
import { ROBINHOOD_TESTNET } from "@cwf/clients";
import { deploymentOf, type AreaDeployment } from "../deployments";

export interface TickerContracts {
  ticker: BridgeTicker;
  /** The Robinhood Chain Stock Token (18 dp). */
  rhStock: Address | null;
  /** StockLockbox on Robinhood Chain. */
  lockbox: Address | null;
  /** Base Sepolia TransitOFT and its HopComposer (testnet hop). */
  transit: Address | null;
  hopComposer: Address | null;
  /** TIP20MintBurnAdapter proxy, the mirror TIP-20 (6 dp) and its ScaledUIView on Tempo. */
  adapter: Address | null;
  mirror: Address | null;
  uiView: Address | null;
}

export interface BridgeTopology {
  network: Network;
  chains: { robinhood: number; base: number | null; tempo: number };
  tickers: Record<BridgeTicker, TickerContracts>;
  receiver: Address | null;
  forwarder: Address | null;
  sender: Address | null;
  /** First block of the Tempo fragment (role-event scans start here). */
  tempoFromBlock: bigint;
  /** Deploy blocks of the Robinhood and Base fragments (event scans start here); null when not deployed. */
  rhFromBlock: bigint | null;
  baseFromBlock: bigint | null;
}

const at = (d: AreaDeployment | null, name: string): Address | null => (d?.[name]?.address ?? null) as Address | null;

function firstBlock(d: AreaDeployment | null): bigint | null {
  const blocks = Object.values(d ?? {}).map((c) => c.deployBlock).filter((b): b is number => b !== null && b > 0);
  return blocks.length ? BigInt(Math.min(...blocks)) : null;
}

export function bridgeTopology(network: Network): BridgeTopology {
  const ids = STOP_CHAIN_ID[network];
  const rh = deploymentOf("stocks", ids.robinhood!);
  const base = ids.base ? deploymentOf("stocks", ids.base) : null;
  const tempo = deploymentOf("stocks", ids.tempo!);
  const stocks = network === "testnet" ? (ROBINHOOD_TESTNET.stocks as Record<string, string>) : {};
  const tickers = Object.fromEntries(
    BRIDGE_TICKERS.map((t) => [
      t,
      {
        ticker: t,
        rhStock: (stocks[t] ?? null) as Address | null,
        lockbox: at(rh, `Lockbox${t}`),
        transit: at(base, `Transit${t}`),
        hopComposer: at(base, `HopComposer${t}`),
        adapter: at(tempo, `Adapter${t}`),
        mirror: at(tempo, `Mirror${t}`),
        uiView: at(tempo, `ScaledUIView${t}`),
      } satisfies TickerContracts,
    ]),
  ) as Record<BridgeTicker, TickerContracts>;
  return {
    network,
    chains: { robinhood: ids.robinhood!, base: ids.base ?? null, tempo: ids.tempo! },
    tickers,
    receiver: at(tempo, "StockSyncReceiver"),
    forwarder: at(base, "StockSyncForwarder"),
    sender: at(rh, "StockSyncSender"),
    tempoFromBlock: firstBlock(tempo) ?? 0n,
    rhFromBlock: firstBlock(rh),
    baseFromBlock: firstBlock(base),
  };
}

/** The Robinhood side is live for a ticker once its lockbox is deployed and (testnet) its hop exists. */
export function robinhoodLive(t: TickerContracts, network: Network): boolean {
  return t.lockbox !== null && t.rhStock !== null && (network === "mainnet" || (t.transit !== null && t.hopComposer !== null));
}
