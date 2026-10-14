// The Expo config (D-227, MOBILE; plan stage SM1 and docs/specs/mobile.md D.2/D.4/D.8, simplified by the owner: the app
// is the responsive site in one web view). Ported from Owarine 90a91d71:mobile/app.config.js — every identifier the
// stores, EAS and the passkey association see comes from app.identity.json, so a rename touches that one file.
//   - displayName, slug, owner, scheme, bundleId / androidPackage: what the stores, EAS and deep links see (Q-027);
//   - webOrigin: the site the web view loads (https://mitoshi.xyz, D-228); legacyLinkHosts: older hosts whose links still
//     open the app (testnet.mitoshi.xyz redirects to the apex and serves the same association files);
//   - passkeyRpId: the passkey relying party (D-060), which must list this app in its
//     /.well-known/apple-app-site-association (webcredentials) and /.well-known/assetlinks.json (get_login_creds);
//   - easProjectId: written once by `eas init`; while it is null the config names no EAS project.
// Colours come from the token source (packages/tokens), the same values the web paints, so the splash, the root view
// and the web view's first frame are one colour (no white flash).
const id = require("./app.identity.json");
const tokens = require("../packages/tokens/src/tokens.json");

const DARK = tokens.palette.dark.bg;
const LIGHT = tokens.palette.light.bg;
/** The icon's ink ground (web/src/app/icon.svg; the light palette's text colour). */
const INK = tokens.palette.light.white;
const webHost = new URL(id.webOrigin).host;
/** Hosts whose https links open the app: the site's own first, then the older ones (D-228). */
const linkHosts = [...new Set([webHost, ...(id.legacyLinkHosts ?? [])])];
/** Hosts that hold the passkey association: the rpId and the site's host (one name since D-228). */
const credentialHosts = [...new Set([id.passkeyRpId, webHost])];
/** Round 7: Face ID guards the optional app lock (src/shell/face-id.ts). */
const FACE_ID_PERMISSION = "Mitoshi uses Face ID to unlock the app.";

/**
 * A local simulator build can load a dev server instead (round 7: every phone change is checked in the iOS Simulator):
 * `MITOSHI_WEB_ORIGIN=http://localhost:3110`, or the same origin in `mobile/.dev-origin` (gitignored; Xcode's build
 * phases evaluate this config again without the shell's environment). Its host then counts as the app's own (passkeys
 * need the real rpId, so they stay off there). Store builds (EAS) never set either.
 */
const devOrigin = process.env.MITOSHI_WEB_ORIGIN || readDevOrigin();
function readDevOrigin() {
  try {
    return require("node:fs").readFileSync(require("node:path").join(__dirname, ".dev-origin"), "utf8").trim() || null;
  } catch {
    return null;
  }
}
const webExtra = devOrigin ? { origin: devOrigin, rpId: new URL(devOrigin).hostname } : { origin: id.webOrigin, rpId: id.passkeyRpId };

module.exports = () => ({
  name: id.displayName,
  slug: id.slug,
  owner: id.owner,
  version: "1.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  scheme: id.scheme,
  userInterfaceStyle: "automatic",
  backgroundColor: DARK,
  ios: {
    bundleIdentifier: id.bundleId,
    supportsTablet: false,
    // ITSAppUsesNonExemptEncryption = false: the app uses only the OS's own TLS.
    config: { usesNonExemptEncryption: false },
    // webcredentials: the passkey rpId (WKWebView offers passkeys only for an associated rpId) and the web host;
    // applinks: https links to the web host (and the older hosts) open the app on that screen.
    associatedDomains: [...credentialHosts.map((h) => `webcredentials:${h}`), ...linkHosts.map((h) => `applinks:${h}`)],
  },
  android: {
    package: id.androidPackage,
    adaptiveIcon: {
      backgroundColor: INK,
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/adaptive-icon-monochrome.png",
    },
    // The minimum set plus VIBRATE, which the web's haptics (navigator.vibrate) need inside a WebView. Files a page
    // saves go to the app's cache and out through the share sheet, so no storage or overlay permission is asked for.
    permissions: ["android.permission.VIBRATE"],
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ],
    // The hardware Back walks the web's history first (src/shell/Shell.tsx).
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: linkHosts.map((host) => ({ scheme: "https", host })),
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    // Round 7 (native where the finger touches; as Senryo's app configures them): the audio session that lets the
    // page's sounds play (no microphone), the Face ID lock and its Keychain flag.
    // Web Audio cues play only while the app is in front; no recording or background playback.
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false, enableBackgroundPlayback: false }],
    ["expo-local-authentication", { faceIDPermission: FACE_ID_PERMISSION }],
    ["expo-secure-store", { faceIDPermission: FACE_ID_PERMISSION }],
    [
      "expo-splash-screen",
      {
        backgroundColor: LIGHT,
        image: "./assets/splash-icon.png",
        imageWidth: 96,
        dark: { backgroundColor: DARK, image: "./assets/splash-icon-dark.png" },
      },
    ],
  ],
  extra: {
    web: webExtra,
    ...(id.easProjectId ? { eas: { projectId: id.easProjectId } } : {}),
  },
  // The content is the web, deployed with the web. Round 7: the shell's own code (the native frame around it) updates
  // over the air within a runtime version, so a shell fix needs no store build unless a native module changes.
  runtimeVersion: { policy: "appVersion" },
  ...(id.easProjectId ? { updates: { url: `https://u.expo.dev/${id.easProjectId}` } } : { updates: { enabled: false } }),
});
