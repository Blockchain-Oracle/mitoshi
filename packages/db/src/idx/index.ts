/** The engine index store (index/0001; C.4.1–C.4.2). Owned by S3. */
export { applyEvent, leg } from "./apply";
export { applyStrategyEvent, FEEDBACK_EVENTS, STRATEGY_EVENTS } from "./apply-strategies";
export { applyVaultEvent, VAULT_EVENTS } from "./apply-vault";
export { readCrowdLean, type CrowdLean, type CrowdQuery } from "./crowd";
export { indexReader, type IdxMarketQuery, type IdxPage, type IdxRow, type IndexReader } from "./read";
export { readSettledRounds, type RoundRow, type RoundsQuery } from "./rounds";
export { hasCalled } from "./calls";
export { readAgentFeedback, readIndexedStrategies, readSubscribers, readRatedDays, readSeriesList, readSubscriptionsOf, readTraderCalls, readWindowFacts, type AgentFeedback, type IndexedStrategy, type IndexedSubscription, type TraderCall, type WindowFacts } from "./strategies";
export { readWalletFills, type WalletFill } from "./wallet-fills";
export { everyDay, readTickerCalls, readTraction, type Traction, type TractionCall, type TractionQuery } from "./traction";
export type { IdxCursor, IdxEvent, IdxSeries } from "./types";
export { indexWriter, INDEX_TABLES, MARKET_PROJECTIONS, type IndexWriter, type WindowResult } from "./write";
