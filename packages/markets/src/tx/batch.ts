/**
 * Call builders shared by every area (plan C.2.3): exact approvals (never max, C.3.3), and the typed call shape the
 * send module accepts. Area-specific encoders live beside their area (`engine/calls.ts`, …) and return these.
 */
// TIP-20 `approve` is ERC-20's (same selector): viem's `erc20Abi`, not the `Abis` namespace (S23 gate, F-S23-08).
import { encodeFunctionData, erc20Abi, type Address, type Hex } from "viem";

export interface Call {
  to: Address;
  data: Hex;
  /** Always 0 on Tempo (no native value; `no-native-value`). */
  value?: 0n;
}

/** `token.approve(spender, amount)` for an exact amount; a max approval is refused by relay policy. */
export function approveCall(token: Address, spender: Address, amountBase: bigint): Call {
  if (amountBase < 0n) throw new Error("approve amount must be non-negative");
  return { to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amountBase] }) };
}

/** Max calls in one Tempo batch our relay sponsors (C.3.3). */
export const MAX_SPONSORED_CALLS = 8;
