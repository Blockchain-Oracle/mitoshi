/** @cwf/db — one Postgres client per process; migrations run in order from `migrations/<area>/`. */
import postgres from "postgres";

export type Sql = ReturnType<typeof postgres>;

export function createSql(url = process.env.DATABASE_URL): Sql {
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, { max: 5, prepare: false, onnotice: () => undefined });
}

export { runMigrations } from "./migrations";
export { createPgLedger } from "./relay-ledger";
export { createPgFaucetStore, type FaucetStore } from "./faucet-store";
export { createPgKeychainStore, type KeychainStore, type ScanRange } from "./keychain-store";
export { createPgVitalsStore, VITAL_METRICS, type VitalMetric, type VitalSample, type VitalSummary, type VitalsStore } from "./vitals-store";
export { insertMppReceipt, receiptsForDecision, type MppReceiptInsert, type MppReceiptRecord } from "./mpp";
export { agentRegistrationByStrategy, setAgentRegistrationUri, upsertAgentRegistration, type AgentRegistrationRow } from "./agents";
export { insertRecounts, type RecountInsert } from "./recounts";
export { createPgPrivateClaimsStore, type PrivateClaimRow, type PrivateClaimsStore, type PrivateClaimStatus } from "./private-claims";
export { createPgExitTriggersStore, type ExitTriggerRow, type ExitTriggerStatus, type ExitTriggersStore, type ExitWriteConflict } from "./exit-triggers";
