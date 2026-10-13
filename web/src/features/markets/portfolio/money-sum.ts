// The money card's figure from its legs (R4-4, D-227; Owarine 90a91d71 plate/useMoney `totalBase`): wallet + Trading
// Balance + open positions at what Close pays + what waits to be collected. Pure, so the sum is tested apart from hooks.
export function sumMoney(input: { walletBase: bigint; tradingBase: bigint; positionsBase: bigint; collectBase: bigint }): bigint {
  return input.walletBase + input.tradingBase + input.positionsBase + input.collectBase;
}
