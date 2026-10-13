# S11 — Trade from X (after S7)

> **Revamp (2026-10-08, D-189…D-200):** "the shared header restored" now means the S22 shell (top line and rail) on `/trade-from-x`.

- [x] x-relay (EXECUTOR grant, dry-run added); `/api/x/*` with the verifier; `/trade-from-x`, `/claim`; stock cashtags;
  `/go/t/[symbol]/[cadence]`, `/go/w/[marketId]` share-to-sign links (A-3e default); in the app the X OAuth step runs in
  the system auth session through SM2's `/native-auth` handoff (`state` bound server-side to the web session). UX: the
  shared header restored (Masayume's route is header-less); X bind as wizard 23576; mention receipts from 28430
  educalvolpz/tweet-card; linked-account card 28170 olewandowski1/connect-integration-cards; `/claim` = 5247
  ravikatiyar162/reward-card + hold-to-confirm 23527 + TxLifecycle; X errors mapped to human copy. Owner action: X
  account.
- **Gate:** a mention executes once from the EXECUTOR grant; a bind with a passkey signature verifies. **Rows:** L-58,
  L-59, L-60, A-3d, A-3e.

## Findings

- **F-S11-01 — Rettiwt reads again on 7.1.4.** Codex's check failed on rettiwt-api 4.2.0 (403 by id, a parse error by
  username). The same key — already the README's three cookies (`auth_token`, `ct0`, `twid`) — answers as
  @Mitoshi_app and reads its mentions on 7.1.4 (Masayume 52a86fc: "7.1.3 no longer reads the X session"). The catalog
  pin moved 7.1.3 → 7.1.4. X's search sometimes answers a transient 404 (as Owarine's README says); the next poll
  reads it.
- **F-S11-02 — the X API is pay-per-use with $0 credits.** `GET /2/users/:id/mentions` with the bot's OAuth 1.0a user
  context answers 402; `/2/users/me` with the same context answers 200 (owner's check). The relay prefers the
  session and reports `credits` when only the API is left; the UI says "Paused: X wants API credits".
- **F-S11-03 — a house re-quote empties the taker's book for a moment.** The first live run met no rested ask (the
  seed maker had just re-quoted, under `TAKER_MIN_REST_SEC`) and refused `no-liquidity` — the honest reply. A real
  mention in that second would get the same; the next mention fills.
- **F-S11-04 — the app's X sign-in needs no native module.** The shell already sends other sites to the system
  browser and opens `mitoshi://<path>` in its web view, so the handoff is: web view → `POST /api/x/start {app}` → X in
  the system browser → callback → `/native-auth?handoff=` → one tap `mitoshi://native-auth?code=` → the web view trades
  the code with its own PKCE verifier. An `ASWebAuthenticationSession` (expo-web-browser) would keep the browser tab
  out of the way; that is native work and a new build, not needed for it to work. Not yet run on a device.
- **F-S11-05 — OAuth state lives server-side.** Owarine kept `state` and the PKCE verifier in cookies; here they sit
  in `x_oauth_states` (hashed key, ten minutes, taken once), bound to an httpOnly browser cookie and to the Mitoshi
  caller signed in at the start; the app's handoff code is bound to the web view's PKCE challenge instead.

## Handoff

Built on `r4/s11-x` (commits `6999be95` relay, `494fe6c9` web, then this one). Gate (both items) on Moderato:
acceptance/S11.md — a bind verified from a passkey signature; a mention executed once through grant 16 (`0xf0d1…624a`)
with a dry run first and a replay that executed nothing.

For the integrator (deploy):
1. Web (Coolify, testnet): `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_CLIENT_SECRET`, `X_API_KEY`, `X_API_KEY_SECRET`,
   `X_BEARER_TOKEN`, `X_SESSION_SECRET`, `X_REDIRECT_URI=https://testnet.mitoshi.xyz/api/x/callback`,
   `NEXT_PUBLIC_X_HANDLE=Mitoshi_app` (build-time) — values from `~/.config/mitoshi/x-testnet.env`, runtime-only.
2. Ops: `X_HANDLE`, `X_RETTIWT_API_KEY`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`, `X_API_KEY`, `X_API_KEY_SECRET`,
   `X_BEARER_TOKEN`; the executor is the `x-relay` role key (`X_RELAY_PRIVATE_KEY` from
   `~/.config/cwf/testnet/x-relay.json`, `0x1022…08Fc`, funded at S0) or `X_EXECUTOR_PRIVATE_KEY`; `OPS_ACTORS`
   gains `x-relay`; it runs dry until `X_RELAY_LIVE=1` (with `DRY_RUN=0`); replies only live with
   `X_POSTING_ENABLED=1` (the local ops file has it at 1 — posting as the bot is the owner's call). Migration
   `x/0002` applies at ops start. Check `https://ops.testnet.mitoshi.xyz/x/relay` and `/api/x/status`.
3. Live checks after deploy: `/trade-from-x` at 375 × 812 (the active step's action on the first screen), Sign in
   with X → X's consent screen (a person), `/claim`, `/settings/account` → X account, `/go/t/BTC/5m?side=up&stake=5`.

Open: the first mention from X and one real sign-in (owner-actions), the app handoff on a device, the X pairs'
rotation (owner-actions). Reply cards (Owarine's PNG renderer) are not ported: replies are text.
