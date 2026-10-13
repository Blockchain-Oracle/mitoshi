/** The duel arena on Tempo (R4-9, D-227): where it lives, what it says, how to read it and the calls a duel makes. */
export { arenaOf, seasonPoolOf } from "./deployment";
export { diagnoseArena } from "./errors";
export { encodeArenaIntent } from "./encoders";
export { cardsOutstanding, getArenaCredit, getArenaMatch, getArenaState, getSeasonPool, quoteArenaPick, readArenaAgent, toArenaMatch, toArenaParams, type ArenaMatchView, type ArenaState, type SeasonPoolState } from "./read";
