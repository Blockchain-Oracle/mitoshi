// Ported from Agari 03b30ab:packages/core/src/lifecycle/status.ts
/** On-chain MarketStatus enum. Only Trading accepts orders; Settling is never observable (canon #1). */
export const ONCHAIN_STATUS = {
  Listed: 0,
  Trading: 1,
  Locked: 2,
  Settling: 3,
  Resolved: 4,
  Voided: 5,
} as const;

export type OnchainStatus = (typeof ONCHAIN_STATUS)[keyof typeof ONCHAIN_STATUS];

export function isTradableOnchain(status: number): boolean {
  return status === ONCHAIN_STATUS.Trading;
}
