# S11 — Trade from X (after S7)

- [ ] x-relay (EXECUTOR grant, dry-run added); `/api/x/*` with the verifier; `/trade-from-x`, `/claim`; stock cashtags;
  `/go/t/[symbol]/[cadence]`, `/go/w/[marketId]` share-to-sign links (A-3e default); in the app the X OAuth step runs in
  the system auth session through SM2's `/native-auth` handoff (`state` bound server-side to the web session). UX: the
  shared header restored (Masayume's route is header-less); X bind as wizard 23576; mention receipts from 28430
  educalvolpz/tweet-card; linked-account card 28170 olewandowski1/connect-integration-cards; `/claim` = 5247
  ravikatiyar162/reward-card + hold-to-confirm 23527 + TxLifecycle; X errors mapped to human copy. Owner action: X
  account.
- **Gate:** a mention executes once from the EXECUTOR grant; a bind with a passkey signature verifies. **Rows:** L-58,
  L-59, L-60, A-3d, A-3e.

## Findings

_None yet._

## Handoff

_Not started._
