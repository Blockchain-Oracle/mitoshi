/**
 * Relay policy for area "stocks" (S14; fragments.md "the stage adding sponsored calls").
 *
 * S14c deploys the bridge on Tempo (mirror TIP-20s, TIP20MintBurnAdapter proxies, StockSyncReceiver, ScaledUIViews) and
 * sponsors nothing: bridging out pays its LayerZero fee in the user's own pathUSD, and deliveries arrive through the
 * LayerZero executor, not the relay. S14w decides which calls the /bridge flow sponsors and lists them here.
 */
export const stocksRelayPolicy = {
  area: "stocks",
  sponsored: [] as readonly string[],
  never: [] as readonly string[],
} as const;
