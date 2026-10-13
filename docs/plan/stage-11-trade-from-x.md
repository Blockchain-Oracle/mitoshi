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
- **F-S11-06 — the receipt card is ported.** Owarine's `reply-card.ts` (SVG text as font paths → `sharp` PNG, 1200 ×
  600) now draws Mitoshi's brand: the dark ground and vermilion glow, the cream receipt tilted, the mark and its seal,
  colours from `@cwf/tokens`, Sora and Inter bundled with their OFL texts. The text and the card come from one
  presentation (`reply-format.ts`), and the renderer re-checks every fact (a refusal title from the fixed list, a hash
  shape, a handle, the network). The card is rendered and uploaded before the posting gate. A failed render or upload
  sends the text. If X refuses the card reply outright, the same text goes once alone (`retryAsText`). An ambiguous POST
  stays `unknown`. Only the session (Rettiwt) uploads; the X API way in replies as text. `X_REPLY_IMAGES_ENABLED=0`
  turns cards off. Checked live: the card for the live fill, then an upload as @Mitoshi_app (media id, nothing posted).
- **F-S11-07 — the env examples lacked the X names.** `infra/env/{web,ops}.testnet.example` (the names `coolify app env
  sync` follows) now list them; the web reads no `X_BEARER_TOKEN`, so it is ops-only in the matrix.

## Handoff

Built on `r4/s11-x` (commits `6999be95` relay, `494fe6c9` web, `f134a708` gate, `f5fd7cdd` calls only, then the
receipt card). Gate (both items) on Moderato:
acceptance/S11.md — a bind verified from a passkey signature; a mention executed once through grant 16 (`0xf0d1…624a`)
with a dry run first and a replay that executed nothing.

For the integrator (deploy):
1. Web (Coolify, testnet; names in `infra/env/web.testnet.example`): `X_OAUTH2_CLIENT_ID`, `X_OAUTH2_CLIENT_SECRET`,
   `X_API_KEY`, `X_API_KEY_SECRET`, `X_SESSION_SECRET`, `X_REDIRECT_URI=https://testnet.mitoshi.xyz/api/x/callback`,
   `NEXT_PUBLIC_X_HANDLE=Mitoshi_app` (build-time) — values from `~/.config/mitoshi/x-testnet.env`, runtime-only.
2. Ops (names in `infra/env/ops.testnet.example`): `X_HANDLE`, `X_RETTIWT_API_KEY`, `X_ACCESS_TOKEN`,
   `X_ACCESS_TOKEN_SECRET`, `X_API_KEY`, `X_API_KEY_SECRET`, `X_BEARER_TOKEN`; the executor is the `x-relay` role key (`X_RELAY_PRIVATE_KEY` from
   `~/.config/cwf/testnet/x-relay.json`, `0x1022…08Fc`, funded at S0) or `X_EXECUTOR_PRIVATE_KEY`; `OPS_ACTORS`
   gains `x-relay`; it runs dry until `X_RELAY_LIVE=1` (with `DRY_RUN=0`); replies only live with
   `X_POSTING_ENABLED=1` (the local ops file has it at 1 — posting as the bot is the owner's call), each reply with
   the receipt card unless `X_REPLY_IMAGES_ENABLED=0` (the ops image builds `sharp` 0.35.5 — already in the lockfile
   through Next — and copies the fonts with the actor). Migration `x/0002` applies at ops start. Check `https://ops.testnet.mitoshi.xyz/x/relay` and `/api/x/status`.
3. Live checks after deploy: `/trade-from-x` at 375 × 812 (the active step's action on the first screen), Sign in
   with X → X's consent screen (a person), `/claim`, `/settings/account` → X account, `/go/t/BTC/5m?side=up&stake=5`;
   `/x/relay` shows `images: true` once posting is on.
4. The app on a device or simulator (it opens the deployed site): `/trade-from-x` → Sign in with X opens the system
   browser → approve → `/native-auth?handoff=` → **Continue** → back in the app, signed in with X (`?x=1`). The shell's
   routing for each hop is checked (acceptance/S11.md); an `ASWebAuthenticationSession` would need `expo-web-browser`
   and a new native build, and is not needed for this.

Open: the deploy and the app handoff on a device (steps above, the integrator's); the first mention from X, one real
sign-in, the X pairs' rotation, and turning posting on (owner-actions).
