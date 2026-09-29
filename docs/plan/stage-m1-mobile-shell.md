# SM1 — Mobile shell, passkeys in the app, delivery pipeline (after S1's gate + the domain; App. D)

- [ ] SM1.1 Spike X19 + monorepo: `mobile/` Expo SDK 57 app (default template stripped), in the pnpm workspace with
  isolated installs (supported since SDK 54; fallback D.1); EAS project; dev build on the owner's iPhone and an Android
  phone (`eas device:create` first — the individual account can't auto-register devices); App Store Connect record for
  the testnet bundle; internal TestFlight group; single-React check for `mobile/` in CI.
- [ ] SM1.2 Shell contract: `packages/core/src/shell/{protocol,routes}.ts` (zod messages v1, tab map, deep-link
  allowlist) + tests; web shell mode: `web/src/lib/shell/{detect,bridge-client,ShellProvider}.ts(x)`, `proxy.ts` sets
  `cwf.shell` from the `CWFShell/` user agent (Android also reads `injectedJavaScriptObject`), layout hides the web header nav, `MobileBottomNav`, install prompt and
  AppStrip, bottom inset from native; adapters for haptics (`games/feedback.ts`), share (`features/share`), external
  links, alerts' `Notification` (→ push in SM2); Android pull-to-refresh on the web side; `ready` message fired when the
  first screen is painted; `/download` in-shell state.
- [ ] SM1.3 `mobile/src/shell/*`: the single web view (D.2) behind a splash held until the web `ready` (no white flash:
  opaque themed background, `expo-system-ui`, dark splash); native pill tab bar reproducing Masayume
  `components/shell/header/MobileBottomNav.tsx` and `styles/navigation.css` (pill `min(26rem, 100vw − 1.25rem)`, safe
  area, ≤ 420/380 tightening) with 11 px labels (not 9 px), a focus ring distinct from active, the sliding active pill
  (technique from 21st 21349), `expo-glass-effect` on iOS 26 where available; the **More panel slides from the right**
  (owner rule; Reanimated 4 transforms/opacity) with a search row and every destination; exact-origin guard;
  iOS `onContentProcessDidTerminate` → reload, Android render-process death → remount at the last path; native offline
  screen; theme sync; re-tap scrolls to top; `expo-observe` `markInteractive` on web `ready`.
- [ ] SM1.3a Native theme: Uniwind from `packages/tokens` (built in S1): generated `global.css` with light and dark blocks
  keeping the web's variable names; `Uniwind.setTheme` follows the web `theme` message; `useCSSVariable` for colours in
  code; `SafeAreaListener → Uniwind.updateInsets`; `userInterfaceStyle: 'automatic'`; the Android pill on a solid token
  surface (no blur). Native screens follow D.10's design sources.
- [ ] SM1.4 Associated domains (D.4): `web/src/app/.well-known/{apple-app-site-association,assetlinks.json}/route.ts` on
  both hosts with no redirects; `ios.associatedDomains`; Android `intentFilters` with `autoVerify`; `src/app/+native-
  intent.tsx` (`redirectSystemPath` never throws; allowed paths become the web view's first
  `source` URI, so no double load); `Handler.webAuthn` origins += `android:apk-key-hash:…` and
  `https://<rpId>`; `scripts/mobile/check-associated-domains.ts` (our files, Apple's CDN, Google's Digital Asset Links
  API).
- [ ] SM1.5 Spikes X13, X14 (`mobile/modules/webview-webauthn`: enables `WebSettingsCompat.setWebAuthenticationSupport(
  …FOR_APP)` on the RN WebView, androidx.webkit ≥ 1.12.1; fallback native Credential Manager), X18.
- [ ] SM1.6 EAS profiles `development`, `preview` (Android APK; splash verified here), `testflight` (D.8); variant config; icons and splash
  from Masayume's `web/public` assets with a "Testnet" badge; `eas submit -p ios --latest` to internal TestFlight; APK
  hosted with its SHA-256.
- **Gate:** internal TestFlight build on the owner's iPhone and the APK on an Android phone: sign in with the passkey
  made on the web → same address; a sponsored no-op through the relay; a non-extractable WebCrypto P-256 key in IndexedDB (the X13
  spike key; re-checked with the D38 key after S4) survives relaunch; cold start ≤ 2.5 s (§3.1);
  a `https://testnet.<domain>/markets/…` link opens that screen in the app; every web route reachable through tabs/More
  at 390 and 320 with no duplicated web nav; association checks green. **Rows:** MOB-01…MOB-04, L-19 (shell), Y-17
  (shell).

## Findings

_None yet._

## Handoff

_Not started._
