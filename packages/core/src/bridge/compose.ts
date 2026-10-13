/**
 * OFT amounts and the hop's compose message (S14w; contracts/src/transit/HopComposer.sol; D-227 R4-12). An OFT moves
 * amounts in 6 shared decimals: a Robinhood Stock Token (18 dp) loses its dust below 1e-6 at the source (`removeDust`),
 * a Tempo mirror (6 dp) has none. `HopComposer.lzCompose` decodes `abi.encode(uint32 finalEid, bytes32 finalTo,
 * uint256 minLD)` — exactly 96 bytes, each field one left-padded word — and bounces anything else back to the sender.
 */
import type { Address, Hex } from "../types/primitives";

/** Every bridged stock moves in 6 shared decimals (OFT default; the mirrors are 6-dp TIP-20s). */
export const SHARED_DECIMALS = 6;

const word = (v: bigint): string => {
  if (v < 0n || v >= 1n << 256n) throw new Error("word out of range");
  return v.toString(16).padStart(64, "0");
};

/** `bytes32(uint256(uint160(addr)))`, the OFT recipient format. */
export function addressToBytes32(address: Address): Hex {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error(`not an address: ${address}`);
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}` as Hex;
}

/** The lower 20 bytes of an OFT recipient word. */
export function bytes32ToAddress(value: Hex): Address {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`not a bytes32: ${value}`);
  return `0x${value.slice(26)}` as Address;
}

/** `abi.encode(uint32 finalEid, bytes32 finalTo, uint256 minLD)` — what the hop composer forwards on. */
export function composeMsg(finalEid: number, finalTo: Address, minLD: bigint): Hex {
  if (!Number.isInteger(finalEid) || finalEid <= 0 || finalEid > 0xffffffff) throw new Error(`bad eid ${finalEid}`);
  return `0x${word(BigInt(finalEid))}${addressToBytes32(finalTo).slice(2)}${word(minLD)}` as Hex;
}

/** The inverse, for the tracker and tests; null when the bytes are not a well-formed hop instruction. */
export function decodeComposeMsg(data: Hex): { finalEid: number; finalTo: Address; minLD: bigint } | null {
  if (!/^0x[0-9a-fA-F]{192}$/.test(data)) return null;
  const eid = BigInt(`0x${data.slice(2, 66)}`);
  if (eid > 0xffffffffn) return null;
  return { finalEid: Number(eid), finalTo: bytes32ToAddress(`0x${data.slice(66, 130)}` as Hex), minLD: BigInt(`0x${data.slice(130)}`) };
}

const rate = (localDecimals: number): bigint => {
  if (!Number.isInteger(localDecimals) || localDecimals < SHARED_DECIMALS) throw new Error(`local decimals ${localDecimals} < shared ${SHARED_DECIMALS}`);
  return 10n ** BigInt(localDecimals - SHARED_DECIMALS);
};

/** What actually leaves: `amountLD` rounded down to the shared precision (the dust stays with the sender). */
export function removeDust(amountLD: bigint, localDecimals: number): bigint {
  const r = rate(localDecimals);
  return amountLD - (amountLD % r);
}

/** Local units → shared (6 dp), rounded down. */
export function toShared(amountLD: bigint, localDecimals: number): bigint {
  return amountLD / rate(localDecimals);
}

/** Shared (6 dp) → local units. */
export function fromShared(amountSD: bigint, localDecimals: number): bigint {
  return amountSD * rate(localDecimals);
}
