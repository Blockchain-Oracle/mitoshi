# Mitoshi Testnet — the phone app

The testnet site (`https://testnet.mitoshi.xyz`) in one native web view, built with Expo SDK 57 (D-227). The web is
already phone-first, so the app adds only what a browser tab can't do: a native splash held until the page paints,
the status bar following the page's theme, Android Back through the page's history, other sites in the system browser,
page downloads through the share sheet, an offline screen that retries by itself, and passkeys inside the web view.
The web sees the app in its user agent (`CWFShell/<version> (<ios|android>; testnet)`) and as `window.ReactNativeWebView`.

## Identity

Names and ids live in `app.identity.json` (Q-027): "Mitoshi Testnet", slug `mitoshi-testnet`, bundle id and package
`xyz.mitoshi.app.testnet`, scheme `mitoshi`, EAS project `@0xabu/mitoshi-testnet`. Icons and splash marks are rendered
from `web/src/app/icon.svg` by `scripts/icons.sh`.

## Passkeys

Mitoshi's passkeys use the rpId `mitoshi.xyz`.

- **iOS:** the app carries `webcredentials:mitoshi.xyz` (and `applinks:testnet.mitoshi.xyz`). WKWebView offers passkeys
  only after Apple has read `https://mitoshi.xyz/.well-known/apple-app-site-association`.
- **Android:** `modules/webview-webauthn` turns on WebView WebAuthn (`WEB_AUTHENTICATION_SUPPORT_FOR_APP`). Credential
  Manager then checks `https://mitoshi.xyz/.well-known/assetlinks.json`. Its ceremonies carry the origin
  `android:apk-key-hash:…`, which the web's ceremony handler accepts on testnet (`web/src/lib/app-links.ts`).

The web serves both files (`web/src/app/.well-known/*`). They must also answer on the apex `mitoshi.xyz`: add
`https://mitoshi.xyz` to the Coolify web app's domains. Its DNS already points at the box. The proxy serves only
`/.well-known/*` there and sends everything else to the testnet host.

## Build and ship

From `mobile/`, logged in to EAS as `0xabu`:

```sh
npx eas-cli@latest build -p android --profile production --non-interactive   # Play app bundle (.aab)
npx eas-cli@latest build -p android --profile preview --non-interactive      # sideloadable APK
EXPO_ASC_API_KEY_PATH=~/.config/agari/apple/AuthKey_852363VPL4.p8 EXPO_ASC_KEY_ID=852363VPL4 \
EXPO_ASC_ISSUER_ID=911e920f-cd28-49bb-b3fb-37e38abdb43e EXPO_APPLE_TEAM_ID=86C6ZFJ6V6 EXPO_APPLE_TEAM_TYPE=INDIVIDUAL \
EXPO_NO_CAPABILITY_SYNC=1 npx eas-cli@latest build -p ios --profile production --non-interactive
npx eas-cli@latest submit -p ios --profile production --latest       # TestFlight (needs the App Store Connect app)
npx eas-cli@latest submit -p android --profile production --latest   # Play internal track (after the first manual upload)
```

- The iOS credentials (the account's distribution certificate and an App Store profile with Associated Domains) are
  stored on EAS.
- Associated Domains is switched on for the bundle id through the App Store Connect API. EAS's own capability sync fails
  on that capability, so builds run with `EXPO_NO_CAPABILITY_SYNC=1`.
- Android signs with the EAS keystore, whose SHA-256 is in `assetlinks.json`.
- Owner steps (the App Store Connect record, the Play Console app and its first upload, the Play signing key) are in
  `docs/plan/owner-actions.md`.

## Checks

```sh
pnpm --filter @cwf/mobile typecheck
pnpm invariants
pnpm --filter @cwf/mobile exec expo export --platform android   # bundles the JS without a device
```
