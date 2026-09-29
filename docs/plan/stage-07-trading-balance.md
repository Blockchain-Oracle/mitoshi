# S7 — Trading Balance: EventVault + tap trading (after S4; contracts A.4.1, web C)

- [ ] Contracts: `src/products/shared/{EngineSeam,Payouts}.sol`; `src/products/vault/{IEventVault,VenueGateway,
  EventVault,VaultTally}.sol` (forwarder removed; D-062; D-091 `Caps.market`; P12 on withdraw; crank opt-out;
  `sweep(bytes32)`); tests that prove it: Masayume's `EventVault.funding`, `.trading`, `CapsVectors`, plus
  `test_D062_churnDoesNotLeakOpenPositions`, `test_D091_grantMarketScope`, `test_engineAccountingMismatch`,
  `test_withdraw_receivePolicyBlocked`, `test_msgSenderIsOwner_noForwarder`, `test_sessionKeyTapFlow`,
  `invariant_vaultPositionsMatchEngine`, `invariant_vaultWalletConservation`; `script/DeployEventVault.s.sol`.
- [ ] Off-chain: `packages/markets/src/vault/*`; `relay/policies/vault.ts` (sponsor: placeFor, withdraw,
  withdrawPrivate, revoke, crankSettle, sweep; never: deposit, depositAndGrant, grant, fundGrant — unchanged from Masayume;
  Q-021 for `place`/`moveToPrivate`); `sessions/session-key.ts` (WebCrypto P-256 account); port Masayume
  `web/src/features/{vault,session}/*` with the E.5 S7 fixes: the arm modal stays one sentence + one button (centred);
  the fallback reason always rendered on the CTA ("Budget used — add 25"); a persistent allowance pill ("Tap-trading ·
  18/25 left · 6 h") with warn-before-expiry, one-tap renew, "Add to budget", "Extend"; "Spent today" updates
  optimistically; memoised split context (no 1 s
  re-render); partial withdraw with Max and inline reasons (Agari `AmountField`); the D37 onboarding slot offers the Trading Balance
  arm (centred, one sentence); settler crank; `idx_vault_*`.
  21st starts: segmented control 23552 for caps presets, hold-to-confirm 23527 for revoke-all.
- **Gate:** passkey root deposits + grants (self-paid), session-key taps sponsored with no prompt, a cap refusal shown
  with its reason (never a surprise prompt), renew/extend, revoke, partial withdraw, killed-tab recovery by
  `validBefore`; the key appears in `/settings/account` (D44). **Rows:** L-08, L-27, L-28, Y-16, UX-01 (Trading Balance
  arm), UX-06.

## Findings

_None yet._

## Handoff

_Not started._
