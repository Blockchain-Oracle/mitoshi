// Ported from Agari 03b30abbbfe7ddc3cac4927c7c573e52f74d2d49:packages/db/src/idx/types.ts (Solana identity → EVM logs).
/** Structural rows the indexer hands the store; the store never imports the chain adapter. */

/** One decoded engine log, JSON-safe: uint64/int64 values arrive as decimal strings. */
export interface IdxEvent {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimeSec: number;
  address: string;
  name: string;
  /** Lower-case 0x market id for market-scoped events. */
  market: string | null;
  seq: string | null;
  data: Record<string, unknown>;
}

export interface IdxSeries {
  series: string;
  ticker: number;
  symbol: string | null;
  cadenceSec: number;
  basis: number;
  lotBase: string;
  tickBase: string;
  cashUnit: string;
}

export interface IdxCursor {
  chainId: number;
  address: string;
  block: number;
}
