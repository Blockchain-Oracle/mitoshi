// The phone app's identity on the web (D-227, MOBILE; docs/specs/mobile.md D.4/D.5): what the two association files
// (/.well-known/apple-app-site-association and /.well-known/assetlinks.json) say, and the extra passkey origins the
// ceremony handler accepts from the Android app. Nothing here is secret: Apple and Google publish all of it.
//
// Passkeys in the app: iOS's WKWebView offers them for an rpId listed in the app's `webcredentials:` associated domain
// and in that host's AASA; Android's WebView (WebAuthn FOR_APP) asks Credential Manager, which checks the rpId host's
// assetlinks.json for `get_login_creds`, and then signs clientDataJSON with the origin `android:apk-key-hash:<base64url
// SHA-256 of the signing certificate>` instead of the page's https origin. Both files must be served from the rpId host
// (mitoshi.xyz, D-060) as well as the app host (testnet.mitoshi.xyz, for App Links), with no redirect.

export const APPLE_TEAM_ID = "86C6ZFJ6V6";
export const APP_BUNDLE_ID = "xyz.mitoshi.app.testnet";
export const ANDROID_PACKAGE = "xyz.mitoshi.app.testnet";

/**
 * SHA-256 of every certificate that signs the Android app. The EAS keystore (@0xabu/mitoshi-testnet, made 2026-10-12)
 * signs the app bundle and the preview APKs. Google Play re-signs what it installs with its own app-signing key, whose
 * SHA-256 the Play Console shows under App integrity once the app exists there (docs/plan/owner-actions.md).
 */
export const ANDROID_CERT_SHA256: readonly string[] = [
  "A1:FF:55:DC:A0:81:24:6A:BA:34:F0:09:25:28:53:59:3B:6C:1F:49:F5:73:AA:E9:0C:E8:6B:E6:D4:E9:E0:63",
];

const APP_ID = `${APPLE_TEAM_ID}.${APP_BUNDLE_ID}`;

/**
 * The AASA: universal links for every page but the API, the framework's files and this folder, and the passkey
 * association. Apple's CDN caches it for about a day.
 */
export function appleAppSiteAssociation() {
  return {
    applinks: {
      details: [
        {
          appIDs: [APP_ID],
          components: [
            { "/": "/api/*", exclude: true },
            { "/": "/_next/*", exclude: true },
            { "/": "/.well-known/*", exclude: true },
            { "/": "/*" },
          ],
        },
      ],
    },
    webcredentials: { apps: [APP_ID] },
  };
}

/** Digital Asset Links: App Links (`handle_all_urls`) and passkeys / saved sign-ins (`get_login_creds`). */
export function assetLinks() {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls", "delegate_permission/common.get_login_creds"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: [...ANDROID_CERT_SHA256] },
    },
  ];
}

/** `AA:BB:…` (a certificate's SHA-256 as keytool and the Play Console print it) → `android:apk-key-hash:<base64url>`. */
export function apkKeyHashOrigin(sha256: string): string {
  const hex = sha256.replace(/:/g, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`not a SHA-256 fingerprint: ${sha256}`);
  let binary = "";
  for (let i = 0; i < 64; i += 2) binary += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
  return `android:apk-key-hash:${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

/** The origins the Android app's passkey ceremonies carry, one per signing certificate. */
export const ANDROID_PASSKEY_ORIGINS: readonly string[] = ANDROID_CERT_SHA256.map(apkKeyHashOrigin);
