<!-- Copied from the approved build plan (v5, 2026-09-29). Change it only through D-entries in docs/plan/decisions.md. -->

## Appendix D — Mobile app (spec; S0 copies to `docs/specs/mobile.md`)

Research 2026-09-22: codebase audit (Masayume `a255ae9` = pin + docs only, Agari `f3ebc06`, Yosuku `3c56ef5`), Apple
distribution and review policy, Expo/RN + accounts SDK (`acc@183880b` = accounts 0.18.4). [C] confirmed in source, [I]
inference to be proved by the named spike.

**What exists to reuse:** Yosuku shipped an Expo app (TestFlight link in its README) whose source is gone; its
`app/native-auth/page.tsx` (OAuth return → `thebell://auth#…`) and `public/.well-known/apple-app-site-association`
(`webcredentials` only) survive [C]. Masayume/Agari have a PWA manifest, install feature and a placeholder
`/native-auth` [C]. The web UI is phone-first (pill nav at ≤ 720 px, safe-area insets, sheets and drawers) [C].
`@masayume/core` is Hermes-safe (zod only) [C]; the markets hooks are DOM-free [C].

### D.1 Stack and layout

Pins (Expo SDK 57 bundle [C]): `expo ~57.0.24` (≥ 57.0.17 for the Hermes V1 fix), `react-native 0.86.3`, `react 19.2.3`,
`expo-router ~57.0.22`, `react-native-webview 13.16.1`, `expo-notifications 57.0.20`, `expo-haptics`,
`expo-local-authentication`, `expo-secure-store`, `expo-web-browser` (57.0.x), `expo-widgets` (SM4),
`react-native-passkey 3.6.2`, `accounts ~0.18.4`, `viem ^2.56.8`, `react-native-get-random-values ^2`,
`react-native-mmkv 4.3.2` (v4 `createMMKV`: a plain store for shell state read at startup, an encrypted one keyed from
`expo-secure-store` for SM3) + `react-native-nitro-modules`, `uniwind` (SM4), `lucide-react-native`,
`react-native-reanimated` 4 + `react-native-gesture-handler` (More panel, tab pill), `expo-system-ui`,
`expo-splash-screen`, `expo-glass-effect`, `expo-observe`. New Architecture is
always on (SDK ≥ 55). Builds need Xcode 26 / iOS 26 SDK [C]. Move to SDK 58 when stable (native tabs stable there; not
needed by D27).

pnpm: isolated installs supported since SDK 54; Metro monorepo config automatic (no manual `watchFolders`) [C]. The
`mobile` named catalog holds React 19.2.3 / RN pins apart from the web's React 19.2.8; shared packages declare React as a
peer; no root `resolutions`/`overrides` for react (it would unify web and mobile). Fallback if isolated installs break a native module: `mobile/` becomes its own pnpm root (`nodeLinker: hoisted`)
linking `packages/{core,clients,markets}` — recorded as a D-entry if used.

```
mobile/
  app.config.ts            variants (D.8), associatedDomains, intentFilters, plugins, ITSAppUsesNonExemptEncryption
  eas.json                 development · preview (APK) · testflight · mainnet (later, organization account)
  src/app/_layout.tsx  (shell)/index.tsx  +native-intent.tsx  settings.tsx  lock.tsx  offline.tsx
  src/shell/{WebShell.tsx, bridge.ts, PillTabBar.tsx, MorePanel.tsx, links.ts, origin.ts, insets.ts, splash.ts}
  src/native/{push.ts, haptics.ts, share.ts, biometric.ts, auth-session.ts, wallet-links.ts}
  src/account/{passkey-adapter.ts, keystore.ts, provider.ts, inject.ts, intent-store-mmkv.ts}      (SM3)
  src/screens/{call, portfolio, notifications, alerts}/*                                           (SM4)
  src/widgets/{CallActivity.tsx, PortfolioWidget.tsx}                                              (SM4)
  modules/hardware-keys/      ios/HardwareKeys.swift (CryptoKit SecureEnclave.P256) · android/HardwareKeys.kt (AndroidKeyStore)
  modules/webview-webauthn/   Android: WebSettingsCompat.setWebAuthenticationSupport on the RN WebView (X14)
packages/core/src/shell/{protocol.ts, routes.ts}         packages/tokens/ (S1)
web/src/lib/shell/*  web/src/app/.well-known/{apple-app-site-association,assetlinks.json}/route.ts
web/src/app/native-auth/page.tsx  web/src/app/api/push/*  web/src/providers/wallet/connectors/shell-device.ts
services/ops/src/actors/notifier/*  packages/db/migrations/push/*
```

### D.2 The shell

One web view on `https://testnet.<domain>` (testnet variant) with: `originWhitelist` = our origins (X-check that
external links still reach our handler, mobile-stack §3); no `sharedCookiesEnabled` (native never sets cookies);
`applicationNameForUserAgent: 'CWFShell/<version> (<ios|android>; <variant>)'`; shell settings via
`injectedJavaScriptObject` (read with `window.ReactNativeWebView.injectedObjectJson()`, reliable on Android) plus
`injectedJavaScriptBeforeContentLoaded` on iOS; opaque background in the theme colour; no `startInLoadingState`; the
splash (`preventAutoHideAsync` at module scope) hides on the web `ready` message with a timeout fallback;
`allowsBackForwardNavigationGestures`; `pullToRefreshEnabled` (iOS; Android refresh is web-side); `textZoom: 100` on
Android; iOS `onContentProcessDidTerminate` → reload the current path, Android `onRenderProcessGone` → remount at the
last path; `onShouldStartLoadWithRequest`: our origin stays, `wc:` and wallet schemes → `Linking.openURL`,
other https → SFSafariViewController / Custom Tabs; `setSupportMultipleWindows={false}`; `webviewDebuggingEnabled` only in
`development`. The native **PillTabBar** reproduces `MobileBottomNav` (4 destinations + More) with the same copy and
lucide icons; the More panel lists every destination ("Everything in …"); active tab follows `route-changed`; tap →
`navigate`; re-tap → `scroll-top`. **MorePanel** slides in from the right edge (owner rule: no bottom sheets), with a
search row. Native offline screen with retry; status bar follows the web theme.

Web side: `proxy.ts` sets cookie `cwf.shell=<platform>` when the user agent carries `CWFShell/` (or `?shell=`), so the
server layout renders shell mode without a flash; `ShellProvider` hides the header nav, `MobileBottomNav`, install
prompt and AppStrip, reads `--shell-bottom-inset`, and swaps adapters: `navigator.vibrate` → `haptic`, share →
native sheet, `Notification` → push, `window.open` → `open-external`, OAuth → `open-auth-session`.

### D.3 Bridge protocol v1 (`packages/core/src/shell/protocol.ts`, zod, shared by both sides)

Envelope `{ v: 1, id, type, payload }`; native accepts only messages whose `nativeEvent.url` origin is ours; size cap
64 KB; unknown types ignored; replies echo `id`.
- web → native: `ready {path}`, `route-changed {path, title, tab}`, `haptic {kind: select|success|warning|error|impact}` (Android maps to
  `performAndroidHapticsAsync` Confirm/Reject/Segment_Tick),
  `share {url, text, image?}`, `open-external {url}`, `open-auth-session {url, callbackScheme}`, `push-permission
  {reason}`, `badge {count}`, `theme {mode}`, `rpc {method, params}` (SM3).
- native → web: `navigate {path}`, `scroll-top`, `app-state {active|background}`, `push-token {token, platform,
  environment}`, `push-opened {path, data}`, `auth-session-result {url | cancelled}`, `insets {bottom}`, `rpc-result
  {id, result | error}`, `provider-event {event, data}` (SM3).

### D.4 Associated domains

AASA (served as `application/json` at `https://<domain>/.well-known/apple-app-site-association` and on
`testnet.<domain>`, HTTPS, **no redirects** — apex must not redirect to `www`):
```json
{ "applinks": { "details": [ { "appIDs": ["<TEAM>.<bundle>.testnet"],
    "components": [ {"/": "/go/*"}, {"/": "/markets/*"}, {"/": "/stocks/*"}, {"/": "/themes/*"}, {"/": "/launch/*"},
                    {"/": "/games/duel/*"}, {"/": "/u/*"}, {"/": "/native-auth*"} ] } ] },
  "webcredentials": { "apps": ["<TEAM>.<bundle>.testnet"] } }
```
(the mainnet bundle is added when it exists). Entitlements: `webcredentials:<domain>` (the passkey rpId, D25) and
`applinks:testnet.<domain>`; dev builds use `?mode=developer`. Apple's CDN refreshes within ~24 h [C].
`assetlinks.json`: relations `delegate_permission/common.handle_all_urls` + `delegate_permission/common.get_login_creds`,
`package_name <bundle>.testnet`, the EAS keystore SHA-256. `Handler.webAuthn` origins (array [C]):
`[APP_ORIGIN, 'https://<rpId>', 'android:apk-key-hash:<base64url(sha256(cert))>']`.

### D.5 Accounts

- **Phase A (SM1):** the web app's `webAuthn` connector runs inside the web view; WKWebView passkeys work once the rpId
  is an associated domain [C]; Android WebView via androidx.webkit ≥ 1.12.1 in app mode (origin = apk-key-hash) [C].
  Browser session keys (WebCrypto P-256, non-extractable, IndexedDB) persist in the app's data container [I, X13].
  In phase A the Tempo Wallet row shows its honest pending state ("arrives with the in-app wallet connection") until
  SM3.6.
- **Phase B (SM3):** native owns the account. Native passkeys (`react-native-passkey`: `get` returns
  `authenticatorData`, `clientDataJSON`, `signature` [C]) against `/api/auth`; hardware keys: Secure Enclave P-256 with
  no per-signature prompt (limits and expiry are the safety net), persisted `dataRepresentation` in the Keychain
  `AfterFirstUnlockThisDeviceOnly`; Android StrongBox → TEE. Signing: SHA-256 ECDSA over the tx hash → DER → (r,s) →
  low-s (mandatory in the verifier precompile [C]) → `SignatureEnvelope {type: 'p256', prehash: true, publicKey}` [C].
  Roles: (1) the EventVault SESSION actor account for taps; (2) a TIP-1011 access key on the root for routine actions.
  Injected provider: EIP-1193 over the bridge + EIP-6963 (`rdns = <bundle>`); the web's `shellDevice()` connector
  treats it as a full Tempo account. Tempo Wallet: `mobileWebAuth` + `tempoWallet()` (system auth session; consumer
  manifest `/.well-known/urpc/consumer.json` lists `<bundle>:/auth`) [C].

### D.6 Push and Live Activities

Tables: `push_devices (id, account, platform, token, environment sandbox|production, variant, created_at, last_seen,
disabled_at)`, `push_prefs (account, topic, enabled)`, `push_outbox (id, account, topic, dedupe_key unique, payload,
status, attempts, next_at, sent_at, error)`, `notify_cursors`, `live_activities (account, market_id, push_token,
started_at, ended_at)`. APNs: HTTP/2 via `node:http2`, `api.push.apple.com` for TestFlight/App Store builds and
`api.sandbox.push.apple.com` for dev builds; ES256 provider JWT (key ID + team ID), reused 20–60 min; `apns-topic` =
bundle ID (`<bundle>.push-type.liveactivity` for `apns-push-type: liveactivity`); `apns-collapse-id` per market;
410 → disable. FCM HTTP v1 `projects/<id>/messages:send` with a service-account token. Payload carries `path`.
Sources: `idx_events` (verdicts, fills, holds, grants, bridge, rebalances, graduation) + ops events (duels, alerts, X,
agent decisions). Permission asked after the first call placed.

### D.7 Auth sessions and `/native-auth`

Web (in shell) asks the server for a one-time OAuth `state` bound to its session (`oauth_states`, 10 min) → bridge
`open-auth-session {url, callbackScheme: <bundle>}` → `openAuthSessionAsync` (ASWebAuthenticationSession / Custom Tabs)
→ provider → our callback completes server-side using `state` (the auth session has its own cookie jar) → redirect to
`/native-auth?result=<code>` → page does `location.replace('<bundle>://auth#result=<code>')` → native posts
`auth-session-result` → web refetches. Used by the X bind (S11). Passkey-only login keeps guideline 4.8 (Sign in with
Apple) out of scope; X never creates the primary account.

### D.8 Variants, builds, delivery

| Variant | Bundle | Web origin | Chains | Distribution |
|---|---|---|---|---|
| `testnet` | `<bundle>.testnet` | `https://testnet.<domain>` | Moderato (+ RH testnet, Base Sepolia for bridge-in) | internal + external TestFlight; APK |
| `mainnet` | `<bundle>` | `https://<domain>` | Tempo, Robinhood Chain | after an organization account (Q-029) |

`eas.json`: `cli.appVersionSource: "remote"`; `development` (dev client, internal distribution, sandbox APNs),
`preview` (Android `buildType: apk`), `testflight` (store distribution, `testnet`, `autoIncrement`, version 1.0), an
`environment` per profile, `google-services.json` as an EAS secret file variable, `submit.testflight.ios.ascAppId`;
upload with `eas submit -p ios --latest --groups "<internal group>"`; Metro `inlineRequires` + tree shaking. Credentials EAS-managed via
Apple ID login (individual API keys can't use provisioning endpoints [C]). `eas submit -p ios --latest` → TestFlight
(10–15 min processing [C]). The testnet app has no mainnet code path (2.3.1(a)); web content updates through web deploys
(allowed while the app's purpose is unchanged, DPLA §3.3.1(B) [C]). APK at `https://testnet.<domain>/download/android/`
with its SHA-256; its signing fingerprint is the one in `assetlinks.json`.

### D.9 Beta App Review package

Review notes: testnet-only build, tokens have no monetary value, no fiat on- or off-ramp, non-custodial passkey
accounts, fees sponsored by us; a step-by-step walkthrough written for a reviewer with no crypto background (create a
passkey → faucet funds automatically → place a call → see the verdict → Earn, stocks, themes, launch, games, X, social);
backend and faucet kept up during review; geofence explanation (Q-028); where AI data goes and the consent screen;
report / block / filter and contact; account deletion path; privacy policy URL; content served from our web app; 18+
(frequent simulated gambling); export compliance answered (standard OS crypto + signatures; confirmed against Apple's
questionnaire in SM5); latest agreements accepted. Nothing is removed from the app for review.

### D.10 Native hot paths (SM4)

Native call flow (hero, Up/Down ticket, verdict, claim) with haptics and the hardware session key; the price chart is an
Expo DOM-component island (embedded, `file://` origin — no passkeys there, never needed) reusing the web chart code;
portfolio, notifications centre, alerts in Uniwind with `packages/tokens`; everything else stays the web screen. Live
Activity: open call countdown (lock, expiry), live price, verdict, via notifier pushes; widget: open calls + balance
via App Group data. Parity: native screens match the web route at 390 in both themes.

Native screens have no 21st source (21st is web-only): each reproduces a named revamped web component at 390 px with
`packages/tokens` and is registered in `components.md` as `native-of: <web id>` — lock = the 19045 passkey-card anatomy
(centred, Face ID; 31481 vault-lock as reference); offline = 21518 bundui/offline-empty-state anatomy + Masayume's
`BoundaryScreen` copy ("Your funds and positions are safe on-chain"); settings = 26523 field-02 rows; portfolio = 27124
card rows + 29532; notifications = 28490; ticket = the revamped S4 ticket; Live Activity / widget = the Call card + the
19328 countdown in SwiftUI through `@expo/ui`.

### D.11 Tests

Protocol schema tests (both sides import one module); keystore vectors (DER → (r,s), low-s flip, envelope bytes vs
viem `fromWebCryptoP256` output); notifier unit tests (dedupe, 410 disable, backoff, JWT reuse window); Maestro flows
(simulator + emulator); association checks (our files, `app-site-association.cdn-apple.com/a/v1/<domain>`, Google
`digitalassetlinks.googleapis.com/v1/statements:list`); owner device checks per SM gate; Moderato tx evidence.

### D.12 Ledger rows (added to `12-parity-ledger.md` §11 at S0's doc sync)

| Row | Capability | Stage |
|---|---|---|
| MOB-01 | Expo shell, one web view, native pill tab bar + right-edge More panel | SM1 |
| MOB-02 | Web shell mode + bridge protocol v1 | SM1 |
| MOB-03 | Passkeys in the app = the web account (associated domains, Android origin) | SM1 |
| MOB-04 | Universal links / app links for shared routes | SM1 |
| MOB-05 | Push notifications (APNs, FCM, notifier, prefs) | SM2 |
| MOB-06 | `/native-auth` handoff + system auth sessions (X bind) | SM2 |
| MOB-07 | Biometric app lock + app-switcher cover | SM2 |
| MOB-08 | Native account: native passkeys, hardware session keys, injected provider | SM3 |
| MOB-09 | Tempo Wallet in the app (`mobileWebAuth`) | SM3 |
| MOB-10 | Bridge-in from a phone (WalletConnect deep links) | SM2 |
| MOB-11 | Native call flow, portfolio, notifications, alerts | SM4 |
| MOB-12 | Live Activity + home-screen widget | SM4 |
| MOB-13 | Delivery: internal + external TestFlight, APK, `/download` | SM5 |
| MOB-14 | Review obligations: report/block/filter, contact, AI consent, account deletion, privacy policy, age rating, export | S13 + SM5 |

L-19 (native app + `/native-auth`) and Y-17 (native iOS/Android) → Additive — reconstruction, Done when MOB-01…MOB-13
are Done.
