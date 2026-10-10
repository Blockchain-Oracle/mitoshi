/**
 * The proofs on `/demo` (Masayume 68f7a09:web/src/features/demo/proofs.ts's shape) — real transactions and real
 * contracts, nothing else.
 *
 * Each hash is a receipt from a live run recorded in `docs/plan/acceptance` (S23 pass 3–4, S24's 24.5), read through
 * Moderato's RPC with `cast receipt` on `PROOFS_READ_ON`: every one status 1. They come from the runs' own fresh test
 * accounts (and, for the exit, the ops keeper), so there is no single demo wallet. A completed action is historical
 * evidence; it does not establish a current position or a payout.
 *
 * Contract addresses come from the generated deployments the whole app reads (`@cwf/clients`), never retyped here.
 */
import { addressUrl, txUrl } from "@cwf/core/urls";
import { deployments } from "@cwf/clients";
import type { Address, Hex } from "viem";

export const PROOFS_READ_ON = "2026-10-10";
const CHAIN = "42431";

type ProofOperation = "tap" | "close" | "exit-grant" | "exit-sold" | "range" | "moonshot";

export interface TxProof {
  hash: Hex;
  operation: ProofOperation;
  detail: string;
}

export const TX_PROOFS: readonly TxProof[] = [
  { hash: "0x1c724ecc9c553d32a9499f0ec083b846e6791716f4171e572afd13b603309feb", operation: "tap", detail: "UP on TSLA off NYSE hours, one tap with no prompt: the 24/7 15-minute Window on RedStone (block 38,892,742)." },
  { hash: "0xd7333b4d015980064e0dab6ca423779c1ca5548aeb433123b570c98bce5f61fd", operation: "close", detail: "The same position closed in one tap at what the line showed (block 38,892,748)." },
  { hash: "0x251b4ce1af654617c239f8970749d3bfa24d61795a8b33b1089a332002694f51", operation: "exit-grant", detail: "One biometric grants the keeper its EXIT permission on the Trading Balance (block 38,842,916)." },
  { hash: "0xa5ddbcea7fd0ce01bd5159c939f219784effd52217d4392f3286326d9c1436aa", operation: "exit-sold", detail: "The stop-loss sold by the keeper 20.6 s after it triggered, with the tab closed (block 38,842,983)." },
  { hash: "0xed2c6c9e1658648b7eb3da6fc4efac1d2a737b530c7973c91b43e0499a2bfecc", operation: "range", detail: "A Range band on BTC 5m priced off the maker vault's depth, one prompt (block 38,904,254)." },
  { hash: "0xb5475fccb8bbf9d6ae232ad948e142fe4903fc7c4444b0ce9782e5310944d2c8", operation: "moonshot", detail: "A Moonshot long ×2 fired the same way (block 38,904,266)." },
];

const OPERATION_LABEL: Record<ProofOperation, string> = {
  tap: "Tap UP, no prompt",
  close: "CLOSE in one tap",
  "exit-grant": "Keeper exit granted",
  "exit-sold": "Stop-loss sold, app closed",
  range: "Range band placed",
  moonshot: "Moonshot fired",
};

export function txProofLabel(proof: TxProof): string {
  return `${OPERATION_LABEL[proof.operation]} · confirmed`;
}

export function txProofHref(proof: TxProof): string {
  return txUrl(proof.hash, "testnet");
}

type ContractKey = "engine" | "lens" | "prints" | "vault" | "range";

export interface ContractProof {
  key: ContractKey;
  label: string;
  address: Address;
}

type Deployed = Record<string, { contracts: Record<string, { address: string }> }>;
const areas = (deployments as unknown as Record<string, Deployed>)[CHAIN]!;
const at = (area: string, name: string) => areas[area]!.contracts[name]!.address as Address;

export const CONTRACT_PROOFS: readonly ContractProof[] = [
  { key: "engine", label: "EventsEngine (the books and the Windows)", address: at("engine", "EventsEngine") },
  { key: "lens", label: "EngineLens (what the app reads)", address: at("engine", "EngineLens") },
  { key: "prints", label: "RedStonePrintVerifier (the signed prints)", address: at("engine", "RedStonePrintVerifier") },
  { key: "vault", label: "MarketMakerVault (the maker vault)", address: at("maker", "MarketMakerVault") },
  { key: "range", label: "RangeReserve (Range and Moonshot)", address: at("range", "RangeReserve") },
];

export function contractProofHref(proof: ContractProof): string {
  return addressUrl(proof.address, "testnet");
}

export function contractProof(key: ContractKey): ContractProof {
  return CONTRACT_PROOFS.find((proof) => proof.key === key)!;
}
