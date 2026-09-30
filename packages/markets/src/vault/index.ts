/** EventVault's off-chain half (plan C.2.4 `vault/*`; S7): reads, intent encoders, the vault order route, recovery. */
export { capsTuple, getVaultHoldings, getVaultSnapshot, readVaultGrant, readVaultHoldings, readVaultSnapshot, toVaultGrant, vaultDeploymentOf, vaultOutcomeId, type GrantTuple } from "./read";
export { crankSettleCall, encodeVaultIntent, placeCall, placeForCall, summarizeVault } from "./calls";
export { diagnoseVault, VAULT_REVERT_KINDS, vaultErrorName } from "./errors";
export { assertGrantCovers, bookVaultFill, CAP_ERROR, capRefusalText, submitVaultOrder } from "./order";
export { vaultEvidence, vaultReconciler } from "./recovery";
