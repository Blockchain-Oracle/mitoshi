/**
 * The bridge's OFT send parameters (S14w; D-227 R4-12), kept apart from the reads so the Tempo encoder (in the
 * submitter's default set) doesn't pull the quote code. Testnet: both directions land on the Base hop composer with a
 * compose message naming the final chain and recipient (contracts/src/transit/HopComposer.sol).
 */
import type { Address, Hex } from "viem";
import { addressToBytes32, composeMsg, fromShared, LZ_EID } from "@cwf/core";
import type { TickerContracts } from "./topology";

/** Robinhood Stock Tokens have 18 decimals; mirrors 6 (= shared). */
export const RH_DECIMALS = 18;

export interface SendParam {
  dstEid: number;
  to: Hex;
  amountLD: bigint;
  minAmountLD: bigint;
  extraOptions: Hex;
  composeMsg: Hex;
  oftCmd: Hex;
}

/** The lockbox → Base composer send for `amountSD` (6 dp), delivered to `tempoTo` on Tempo. */
export function inSendParam(t: TickerContracts, amountSD: bigint, tempoTo: Address): SendParam {
  const amountLD = fromShared(amountSD, RH_DECIMALS);
  return { dstEid: LZ_EID.baseSepolia, to: addressToBytes32(t.hopComposer!), amountLD, minAmountLD: amountLD, extraOptions: "0x", composeMsg: composeMsg(LZ_EID.moderato, tempoTo, amountLD), oftCmd: "0x" };
}

/** The adapter → Base composer send for `amountSD`, delivered to `rhTo` on Robinhood Chain. */
export function outSendParam(t: TickerContracts, amountSD: bigint, rhTo: Address): SendParam {
  return { dstEid: LZ_EID.baseSepolia, to: addressToBytes32(t.hopComposer!), amountLD: amountSD, minAmountLD: amountSD, extraOptions: "0x", composeMsg: composeMsg(LZ_EID.robinhoodTestnet, rhTo, fromShared(amountSD, RH_DECIMALS)), oftCmd: "0x" };
}

