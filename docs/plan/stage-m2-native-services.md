# SM2 — Native services (after SM1; push sources as S3/S4… land; auth handoff with S11; bridge-in with S14w)

- [ ] SM2.1 Push (D.6; per-topic Android channels created at startup before the permission prompt; foreground
  handler answers within 3 s; cold-start taps read via `getLastNotificationResponseAsync`; category ids without `:`/`-`; `addPushTokenListener` re-registers rotated tokens; the foreground banner
  is suppressed when the current route already shows that market; category `verdict_ready` with View and Claim actions;
  channels `calls`, `money`, `social`, `alerts`, `launch`): `packages/db/migrations/push/0001_push.sql`; `/api/push/{register,unregister,prefs}` (web
  session auth; the web app registers the token native hands it); `services/ops/src/actors/notifier/*` (cursor over
  `idx_events` like duel-projector → `push_outbox` with dedupe keys → APNs HTTP/2 token auth / FCM HTTP v1; 410 disables
  the device; retries with backoff); native `expo-notifications` raw device token; permission asked in context (after the
  first call), never at launch; tap → navigate(path); badge count.
- [ ] SM2.2 Topics, each wired when its source stage lands: verdict + payout held (S4), resting-order fills (S4), vault
  grant actions (S7), agent trades on your grant (S9), X receipts (S11), duel matched / your turn / settled (S12b),
  price alerts (S13), bridge delivered / deferred (S14), theme rebalances (S16), graduation of a coin you hold (S17);
  `/settings/notifications` (web, rendered in the shell).
- [ ] SM2.3 Auth sessions + `/native-auth` (D.7): bridge `open-auth-session` → `expo-web-browser`
  `openAuthSessionAsync`; `web/src/app/native-auth/page.tsx` redirects to `<scheme>://auth#…` (pattern from Yosuku
  `reference/yosuku/app/native-auth/page.tsx`) with a named wait "Returning to the app…" and an "Open the app" button
  after 3 s; OAuth `state` bound server-side to the web session; `expo.scheme` = the callback scheme; no `Linking`
  listener on iOS; `preferEphemeralSession: false`; Android `mayInitWithUrlAsync` before opening.
- [ ] SM2.4 Biometric app lock (`expo-local-authentication`, opt-in, offered only when `hasHardwareAsync &&
  isEnrolledAsync`; `faceIDPermission` set; cold start and after 5 min in background; the lock screen is a centred
  `fullScreenModal`; a native cover on `AppState` inactive so the app-switcher snapshot hides balances).
- [ ] SM2.5 Native share sheet for share cards (and save image), clipboard, `open-external` in SFSafariViewController /
  Custom Tabs; WalletConnect deep links for `/bridge` (after S14w; Reown project ID), returning to the app, with "Waiting for your
  wallet app… / Reopen wallet" and a timeout. The OS share sheet is system UI, outside the overlay rule.
- **Gate:** a real verdict push on both platforms from the notifier (TestFlight builds use production APNs), tap opens
  the market; X bind completes inside the app (after S11); biometric lock; a bridge-in started in the app and signed in
  a wallet app on the same phone (after S14w). **Rows:** MOB-05, MOB-06, MOB-07, MOB-10, L-19 (`/native-auth`), UX-09 (push).

## Findings

_None yet._

## Handoff

_Not started._
