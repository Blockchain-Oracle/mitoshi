# Mitoshi Play reviewer access

Approved on 2026-10-14: a dedicated, capped Tempo testnet reviewer account, entered through a Mitoshi-only invitation code. This is for Google Play's App access review and does not change normal passkey sign-in.

## Entry and identity

- Add a discreet **Review access** action to Mitoshi's sign-in sheet. It asks for the invitation code that is supplied only in Play Console's App access instructions.
- The code is checked on the server with a constant-time comparison. On success the server issues a short-lived, HttpOnly, Secure, SameSite cookie scoped to Mitoshi. The code is never placed in a URL, browser storage, analytics, or a repository file. The session expires and is revocable by rotating the server secret.
- The server holds one dedicated testnet signing key. It never returns the key to the browser. The browser sees only the account address and a wallet-compatible signer, so the existing account, market, trading, and social screens can be used without a new passkey.
- A sign-out action clears the reviewer session. The interface identifies the account as a shared testnet review account so no tester mistakes it for a personal wallet.

## Signing boundary

- The reviewer signer is enabled only on Moderato testnet. It validates the review session on every sign request and refuses arbitrary JSON-RPC methods.
- Transactions can target only the Mitoshi contracts needed for the review trade flow. No native-value transfers, deployments, chain changes, or wallet export are allowed. The server imposes a small per-transaction and aggregate budget, rate limits requests, and can disable the signer without rebuilding the app. The account is funded only with test dollars that have no cash value.
- The server supports the existing message and transaction formats used by the Mitoshi UI. Server calls still apply their own normal authorization and region rules; reviewer access does not bypass them.
- Secret values are provisioned outside Git. Play instructions contain the invitation code and exact steps but never the signing key. Store keys remain untouched.

## Release and verification

- Verify the complete Android review journey from a fresh app install: enter code, see the testnet balance, open a Window, submit a small UP/DOWN trade, see its receipt and position, and sign out. Verify an invalid or revoked code cannot connect or sign.
- Build a new Android version because the sign-in UI changes. Keep version 7 internal until the new build is tested; use a testing track only, never production.
- Put the reusable code and steps in Play App access, then finish truthful Play declarations and the closed test. The public `/download` Android link is enabled only after the opt-in URL works for a tester outside the developer account.

## Explicit limits

Tempo history cannot be erased. A shared review account's activity may be visible to later reviewers, so the UI must say it is shared and hold no real funds or private user data. The signer must fail closed when its secret, network, policy, or session is absent.
