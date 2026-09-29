# S12 — Games (after S4; 12a's result card after S5) — 12a ∥ 12b

- [ ] 12a hub, Practice, Lucky (crypto + stocks policy), Line Rider, Candle Hop on ops prices; achievements/profile/
  friends (Agari); result card (S5 components). Perf/UX: one `next/dynamic` chunk per game (today every game route
  loads ~938 KB gz); audio on first play, music off by default in the app; haptics through the shell bridge. 21st
  starts: lucky reel 33159, achievements 13045/12997, matchmaking radar 10759; hub and arcade wrapper composed (E.4).
- [ ] 12b `src/products/games/{ArenaGateway,ArenaAgents,ArenaMatches,ArenaCommitment,GameArena,IGameArena,
  SeasonPrizePool}.sol` (no payable; seat keys sponsored; P12 on `claimCredit`; `_payOrOwe` distribute); Masayume's vector,
  agents, lifecycle, picks and Season suites + the A.8 S12b tests; UX: optimistic swipe queue on the key lane, rematch /
  "Find another", countdowns on the create/join hand-off and reveal, push-paid credit; live params (join 60, reveal 45, minDeck 2); game-room,
  matchmaker/deckmaster, projector (reads `idx_events`), duel-settler; `relay/policies/games.ts`.
- **Gate:** each mode's full state set; one live duel on Moderato with sponsored agent picks, settle, finalize; route budgets on `/games` and one game route. **Rows:**
  L-61…L-71, M-14.

## Findings

_None yet._

## Handoff

_Not started._
