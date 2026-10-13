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
export { createPgTransferStore, type TransferStore } from "./transfer-store";
export { createPgArcadeStore, type ArcadeBoardRow, type ArcadeGameId, type ArcadeScoreInput, type ArcadeStore } from "./arcade-store";
export { createPgVitalsStore, VITAL_METRICS, type VitalMetric, type VitalSample, type VitalSummary, type VitalsStore } from "./vitals-store";
export { insertMppReceipt, receiptsForDecision, type MppReceiptInsert, type MppReceiptRecord } from "./mpp";
export { createPgMppStore, type PgMppStore } from "./mpp-store";
export { createPgStrategyStore, type DecisionGate, type DecisionVerdictSide, type HeartbeatRecord, type NewHeartbeat, type NewStrategyDecision, type StrategyDecisionRecord, type StrategyFillRecord, type StrategyStore } from "./strategy-store";
export { createPgStrategyAttempts, type AttemptKey, type NewStrategyAttempt, type StrategyAttempt, type StrategyAttemptState, type StrategyAttemptStore } from "./strategy-attempts";
export { createPgSealedMemory, type SealedMemoryIndexRow, type SealedMemoryStore } from "./strategy-memory";
export { agentRegistrationByStrategy, setAgentRegistrationUri, upsertAgentRegistration, type AgentRegistrationRow } from "./agents";
export { insertRecounts, type RecountInsert } from "./recounts";
export { createPgPrivateClaimsStore, type PrivateClaimRow, type PrivateClaimsStore, type PrivateClaimStatus } from "./private-claims";
export { createPgExitTriggersStore, type ExitTriggerRow, type ExitTriggerStatus, type ExitTriggersStore, type ExitWriteConflict } from "./exit-triggers";
export { createPgSocialPeople, BIO_MAX, DISPLAY_NAME, type Profile, type SetProfileResult, type SocialPeopleStore } from "./social-people";
export { createPgSocialPosts, type NewTake, type ReactionSummary, type ReactionTarget, type RoomComment, type SocialPostsStore, type TakeRow, type Via } from "./social-posts";
export { createPgPasskeyBackups, type PasskeyBackup, type PasskeyBackupStore } from "./passkey-backups";
export { CONTACT_TOPICS, createPgContact, type ContactMessage, type ContactStore, type ContactTopic } from "./contact";
export { createPgLaunchLogos, type LaunchLogo, type LaunchLogoStore, type LogoType } from "./launch-logos";
export { createPgThemeKeys, type ThemeKeyRow, type ThemeKeyStore } from "./theme-keys";
export { exportSocialData, type SocialExport } from "./social-export";
export { createPgSocialModeration, REPORT_REASONS, type DeletedRows, type ReportReason, type ReportRow, type ReportTarget, type SocialModerationStore } from "./social-moderation";
export { createPgBridgeStore, type BridgeAdvance, type BridgeMessageRow, type BridgeRowStatus, type BridgeStore, type LegRecord, type TrackInput } from "./bridge-store";
export { createPgReserveStore, createPgStockSyncStore, type ReserveDay, type ReserveSnapshotInput, type ReserveSnapshotRow, type ReserveStore, type StockSyncRow, type StockSyncStatus, type StockSyncStore } from "./reserve-store";
