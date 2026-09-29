/**
 * Access-key management on the AccountKeychain (TIP-1011). Revoking a key is an exit: sponsored everywhere, never
 * geofenced, so stopping a delegated signer never needs funds (D-053). Authorising keys rides the sign-in ceremony's
 * inline key authorization (S4), not a sponsored call.
 */
import { Abis } from "viem/tempo";
import { TEMPO } from "@cwf/clients";
import type { RelayPolicy } from "../types";

export const keysPolicy: RelayPolicy = {
  area: "keys",
  targets: [TEMPO.accountKeychain],
  abi: Abis.accountKeychain,
  sponsor: ["revokeKey"],
  never: ["authorizeKey", "authorizeAdminKey", "updateSpendingLimit", "setAllowedCalls"],
  pillar: null,
  entry: [],
  maxGas: 150_000n,
};
