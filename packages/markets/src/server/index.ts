/**
 * @cwf/markets/server — code that holds server keys or server-only transports: the relay engine, gates, ledger and
 * validator; server signature verification; the Moderato faucet; the Redis-backed accounts `Kv`. Never bundled by the
 * browser or Metro (plan §4 "Mobile").
 */
export { createRedisKv, type RedisKv } from "./kv";
export { createAuthHandler, passkeyAddress, type AuthHandler, type AuthHandlerConfig } from "./auth-handler";
export { createRelayHandler, relayContext, type RelayHandlerConfig } from "./relay-handler";
export { createRateLimiter, type RateLimiter } from "./rate-limit";
export { messageVerifier } from "../auth/verify";
export { FaucetUnavailableError, fundAddress } from "../faucet/fund";
export { evaluate, feeMicros, functionNameOf, isTip20, MAX_CALLS, normalizeRequest, type EngineConfig } from "../relay/engine";
export { checkGates, DEFAULT_LIMITS, SIGNING_METHODS, type GateInput, type GateLimits } from "../relay/gates";
export { createMemoryLedger, type LedgerStore, type LedgerTotals, type LedgerWindow, type SponsorshipRow } from "../relay/ledger";
export { createRelayValidator, type ValidatorDeps } from "../relay/validator";
export { enginePolicy, keysPolicy, noopPolicy, POLICIES } from "../relay/policies";
export { walletKeyRule } from "../relay/policies/engine";
export { normalizeKeyAuthorization } from "../relay/key-auth";
export type { PolicyVerdict, RefusalCode, RelayCall, RelayContext, RelayPolicy, RelayRequest } from "../relay/types";
export * from "../mpp";
export * from "../indexer-api";
export { cashOutPrivateBet, ClaimRefusedError, createDesk, DeskRefusal, deskHealth, openPrivateBet, windowFacts, type Desk, type DeskOpenInput, type WindowFacts } from "../private/desk";
export { signPrivateClaim } from "../private/claim";
export { DATA_STREAMS_FEEDS, dataStreamsEnv, fetchLatestReport, fetchReportAt, v11Summary, type DataStreamsReport } from "../prices/datastreams";
